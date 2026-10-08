/**
 * Inspección de un backup — Fase 8.11. Puro: texto → resultado con etapa de fallo o resumen listo para confirmar.
 * Orden (todo antes de tocar la DB): JSON → envelope/versión → migración existente (solo v1→v2) → entidades → integridad.
 * Nunca "arregla" un backup futuro ni importa parcialmente.
 */
import type { ValidationIssue } from '@domain/validation/entities'
import { validateBackup } from '@domain/validation/backup'
import { migrateBackup, MigrationError } from './migrations'
import { SCHEMA_VERSION, type BackupFile } from './schema'
import { BACKUP_COLLECTIONS, checkIntegrity } from './integrity'

export type InspectStage = 'json' | 'envelope' | 'version' | 'migration' | 'entities' | 'integrity'

export interface BackupSummary {
  schema_version: number
  migrated_from: number | null
  app_version: string
  exported_at: string
  device_id: string
  counts: Record<string, number>
  total_records: number
  photos: number
  warnings: string[]
}

export type InspectResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; stage: InspectStage; message: string; issues: ValidationIssue[] }

const fail = (stage: InspectStage, message: string, issues: ValidationIssue[] = []): InspectResult => ({ ok: false, stage, message, issues })

/** Colecciones que el arranque (seed 8.2) rellena si llegan vacías. */
const SEEDED_IF_EMPTY = ['users', 'settings', 'baselines', 'exercises', 'workout_templates', 'programs', 'foods', 'food_equivalents', 'recipes', 'meal_plans', 'goals', 'monthly_goals', 'exercise_variants', 'exercise_substitution_groups', 'warmup_exercises', 'training_goals']

export function inspectBackupText(text: string): InspectResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return fail('json', 'El archivo no contiene un backup RECOMP válido (no es JSON).')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || !('collections' in parsed)) {
    return fail('envelope', 'El archivo no contiene un backup RECOMP válido.')
  }
  const v = (parsed as { schema_version?: unknown }).schema_version
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return fail('version', 'El backup no indica una versión de esquema válida.')
  if (v > SCHEMA_VERSION) return fail('version', `Schema version ${v} no es compatible con esta aplicación (soporta hasta ${SCHEMA_VERSION}).`)

  const env = validateBackup(parsed)
  if (!env.ok) return fail('entities', describe(env.issues), env.issues)

  let backup: BackupFile = env.value
  let migrated_from: number | null = null
  if (backup.schema_version < SCHEMA_VERSION) {
    try {
      migrated_from = backup.schema_version
      backup = migrateBackup(backup)
    } catch (e) {
      return fail('migration', e instanceof MigrationError ? e.message : 'No se pudo migrar el backup.')
    }
    const again = validateBackup(backup)
    if (!again.ok) return fail('entities', describe(again.issues), again.issues)
  }

  const integrity = checkIntegrity(backup)
  if (integrity.length > 0) return fail('integrity', describe(integrity), integrity)

  const counts: Record<string, number> = {}
  for (const c of BACKUP_COLLECTIONS) counts[c] = backup.collections[c]!.length
  const warnings: string[] = []
  if (migrated_from !== null) warnings.push(`El backup es de la versión ${migrated_from}; se migrará a la ${SCHEMA_VERSION} con la migración existente.`)
  const emptySeeded = SEEDED_IF_EMPTY.filter(c => counts[c] === 0)
  warnings.push('Al volver a abrir la app se ejecuta el arranque normal: el catálogo de ejercicios puede añadir ejercicios nuevos o completar los no editados.')
  if (emptySeeded.length > 0) warnings.push(`Estas colecciones vienen vacías y el arranque las llenará con los datos iniciales: ${emptySeeded.join(', ')}.`)
  return {
    ok: true, backup,
    summary: {
      schema_version: backup.schema_version, migrated_from, app_version: backup.app_version, exported_at: backup.exported_at, device_id: backup.device_id,
      counts, total_records: Object.values(counts).reduce((a, b) => a + b, 0), photos: backup.photos?.length ?? 0, warnings,
    },
  }
}

function describe(issues: ValidationIssue[]): string {
  const first = issues[0]
  if (!first) return 'El backup no es válido.'
  if (/^Referencia inexistente/.test(first.message)) return `El backup contiene una referencia inexistente: ${first.message.replace(/^Referencia inexistente: /, '')}`
  if (/^Falta la colección/.test(first.message)) return `${first.message}.`
  const col = first.path.match(/^collections\.([a-z_]+)/)?.[1]
  if (col) return `No se pudo validar la colección ${col}: ${first.message} (${first.path}).`
  return `El archivo no contiene un backup RECOMP válido: ${first.message}${first.path ? ` (${first.path})` : ''}.`
}
