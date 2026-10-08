/**
 * Validación pura del archivo de backup (Fase 8.3).
 *  - Rechaza schema_version desconocido (no entero, < 1 o > SCHEMA_VERSION).
 *  - Rechaza colecciones desconocidas y entidades con estructura inválida.
 *  - `parseBackupJson` rechaza texto imposible de deserializar.
 *  - Nunca modifica ni migra los datos: devuelve la misma referencia de entrada en éxito.
 *
 * Nota de versiones: el formato es aditivo (Fase 3), así que un backup v1 válido también cumple
 * los schemas actuales (los campos v2 son opcionales). Si una versión futura rompiera esto,
 * `ENTITY_SCHEMAS_BY_VERSION` permite registrar schemas por versión sin cambiar la API.
 */
import { z } from 'zod'
import { COLLECTIONS, type CollectionName } from '@domain/entities'
import { SCHEMA_VERSION, type BackupFile } from '@domain/backup/schema'
import { ENTITY_SCHEMAS, type ValidationIssue, type ValidationResult } from './entities'
import { dayStringSchema, isoDateTimeSchema, monthStringSchema } from './primitives'

/** Colecciones que nunca viajan dentro de `collections`: las fotos van en `photos`; los backups no se anidan. */
export const BACKUP_EXCLUDED: ReadonlySet<CollectionName> = new Set<CollectionName>(['progress_photos', 'backups'])

export const backupEnvelopeSchema = z.object({
  schema_version: z.number().int().min(1).max(SCHEMA_VERSION),
  app_version: z.string().min(1),
  exported_at: isoDateTimeSchema,
  device_id: z.string().min(1),
  collections: z.record(z.string(), z.array(z.unknown())),
  // 8.11: metadata completa obligatoria (sin ella la foto no se puede restaurar).
  photos: z.array(z.object({
    id: z.string().min(1), mime: z.string().min(1), data_base64: z.string(), thumb_base64: z.string(),
    thumb_mime: z.string().min(1), date: dayStringSchema, month: monthStringSchema, view: z.enum(['front', 'side', 'back']),
    width: z.number().int().positive(), height: z.number().int().positive(), bytes: z.number().int().nonnegative(),
    created_at: isoDateTimeSchema, updated_at: isoDateTimeSchema, deleted_at: isoDateTimeSchema.optional(), source: z.enum(['user', 'shortcut', 'system', 'import']),
  })).optional(),
})

const KNOWN = new Set<string>(COLLECTIONS)

export interface BackupValidationOptions {
  /** Máximo de issues por colección en el informe (evita informes gigantes). */
  maxIssuesPerCollection?: number
}

export function validateBackup(input: unknown, opts: BackupValidationOptions = {}): ValidationResult<BackupFile> {
  const max = opts.maxIssuesPerCollection ?? 20
  const env = backupEnvelopeSchema.safeParse(input)
  if (!env.success) {
    return { ok: false, issues: env.error.issues.map(i => ({ path: i.path.map(String).join('.'), message: i.message })) }
  }
  const issues: ValidationIssue[] = []
  for (const [name, rows] of Object.entries(env.data.collections)) {
    if (!KNOWN.has(name)) { issues.push({ path: `collections.${name}`, message: 'Colección desconocida' }); continue }
    const c = name as CollectionName
    if (BACKUP_EXCLUDED.has(c)) { issues.push({ path: `collections.${name}`, message: 'Esta colección no puede ir dentro de collections' }); continue }
    const schema = ENTITY_SCHEMAS[c]
    let count = 0
    rows.forEach((row, i) => {
      if (count >= max) return
      const r = schema.safeParse(row)
      if (!r.success) {
        count++
        const first = r.error.issues[0]
        issues.push({ path: `collections.${name}[${i}]${first ? '.' + first.path.map(String).join('.') : ''}`, message: first?.message ?? 'Entidad inválida' })
      }
    })
    if (count >= max) issues.push({ path: `collections.${name}`, message: `… más errores omitidos (máximo ${max})` })
  }
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, value: input as BackupFile }
}

/** Deserializa y valida. Un JSON roto produce un único issue en la raíz. */
export function parseBackupJson(text: string, opts?: BackupValidationOptions): ValidationResult<BackupFile> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, issues: [{ path: '', message: `JSON inválido: ${e instanceof Error ? e.message : String(e)}` }] }
  }
  return validateBackup(parsed, opts)
}
