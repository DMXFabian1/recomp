/**
 * Un solo número de versión de esquema, compartido por:
 *  - la base IndexedDB (Dexie `version(n)`),
 *  - el formato de backup JSON (`schema_version`),
 *  - las migraciones en memoria de un backup importado.
 * Subirlo exige añadir una entrada en `MIGRATIONS` (domain/backup/migrations.ts)
 * y, si cambia el esquema de stores, en `DEXIE_SCHEMAS` (infra/dexie/schema.ts).
 */
export const SCHEMA_VERSION = 2 // v2: catálogo de ejercicios (DK)

export const APP_VERSION = '0.2.0'

export interface BackupFile {
  schema_version: number
  app_version: string
  exported_at: string
  device_id: string
  collections: Record<string, unknown[]>
  photos?: Array<{ id: string; mime: string; data_base64: string; thumb_base64: string }>
}
