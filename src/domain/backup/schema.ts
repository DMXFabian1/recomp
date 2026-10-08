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
  photos?: BackupPhoto[]
}

/**
 * Foto dentro del backup (8.11). La metadata es OBLIGATORIA para poder restaurar la entidad ProgressPhoto completa:
 * sin date/month/view/width/height/bytes/thumb_mime, la foto no se puede reconstruir y el backup se rechaza.
 * Cambio aditivo del envelope: SCHEMA_VERSION sigue en 2 (nunca se exportaron fotos antes de 8.11).
 */
export interface BackupPhoto {
  id: string
  mime: string
  data_base64: string
  thumb_base64: string
  thumb_mime: string
  date: string
  month: string
  view: 'front' | 'side' | 'back'
  width: number
  height: number
  bytes: number
  created_at: string
  updated_at: string
  deleted_at?: string
  source: 'user' | 'shortcut' | 'system' | 'import'
}
