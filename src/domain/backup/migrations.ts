/**
 * Migraciones del formato de backup en memoria, encadenadas: v1→v2, v2→v3, …
 * Cada función recibe el JSON de la versión `from` y devuelve el de `from + 1`.
 * Reglas (Fase 3): solo añadir campos o colecciones; nunca borrar y renombrar en la misma versión.
 */
import type { Exercise } from '@domain/entities'
import { enrichLegacyExercise } from '@domain/catalog/legacy'
import { SCHEMA_VERSION, type BackupFile } from './schema'

export type BackupMigration = (input: BackupFile) => BackupFile

/** Clave = versión de origen. `MIGRATIONS[1]` migra de v1 a v2. */
export const MIGRATIONS: Record<number, BackupMigration> = {
  /** v1 → v2: catálogo. Añade colecciones vacías y deriva los campos v2 de cada Exercise. Nada se borra. */
  1: (b) => ({
    ...b,
    schema_version: 2,
    collections: {
      ...b.collections,
      exercises: ((b.collections.exercises ?? []) as Exercise[]).map(enrichLegacyExercise),
      exercise_variants: b.collections.exercise_variants ?? [],
      exercise_substitution_groups: b.collections.exercise_substitution_groups ?? [],
      warmup_exercises: b.collections.warmup_exercises ?? [],
      training_goals: b.collections.training_goals ?? [],
    },
  }),
}

export class MigrationError extends Error {
  readonly from: number
  readonly to: number
  constructor(message: string, from: number, to: number) {
    super(message)
    this.name = 'MigrationError'
    this.from = from
    this.to = to
  }
}

/** Migra un backup hasta SCHEMA_VERSION. Devuelve una copia; nunca muta la entrada. */
export function migrateBackup(input: BackupFile): BackupFile {
  let current: BackupFile = structuredClone(input)
  if (current.schema_version > SCHEMA_VERSION) {
    throw new MigrationError(
      `El backup es de un esquema más nuevo (v${current.schema_version}) que esta app (v${SCHEMA_VERSION}). Actualiza la app.`,
      current.schema_version,
      SCHEMA_VERSION,
    )
  }
  while (current.schema_version < SCHEMA_VERSION) {
    const from = current.schema_version
    const step = MIGRATIONS[from]
    if (!step) {
      throw new MigrationError(`No existe migración de v${from} a v${from + 1}.`, from, from + 1)
    }
    const next = step(current)
    if (next.schema_version !== from + 1) {
      throw new MigrationError(`La migración v${from}→v${from + 1} no actualizó schema_version.`, from, from + 1)
    }
    current = next
  }
  return current
}
