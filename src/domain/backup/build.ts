/**
 * Serialización — Fase 8.11. Puro: filas + fotos ya codificadas → BackupFile determinista (filas ordenadas por id;
 * solo `exported_at` varía entre exportaciones del mismo estado). Las conversiones Blob ↔ base64 viven en app.
 */
import type { CollectionName } from '@domain/entities'
import { APP_VERSION, SCHEMA_VERSION, type BackupFile, type BackupPhoto } from './schema'
import { BACKUP_COLLECTIONS } from './integrity'

const byId = (a: unknown, b: unknown) => {
  const x = (a as { id: string }).id, y = (b as { id: string }).id
  return x < y ? -1 : x > y ? 1 : 0
}

export function buildBackupFile(input: { exported_at: string; device_id: string; collections: Partial<Record<CollectionName, unknown[]>>; photos: BackupPhoto[] }): BackupFile {
  const collections: Record<string, unknown[]> = {}
  for (const c of BACKUP_COLLECTIONS) collections[c] = [...(input.collections[c] ?? [])].sort(byId)
  return {
    schema_version: SCHEMA_VERSION, app_version: APP_VERSION, exported_at: input.exported_at, device_id: input.device_id,
    collections, photos: [...input.photos].sort(byId),
  }
}

export function backupFileName(localDay: string): string {
  return `recomp-backup-${localDay}.json`
}
