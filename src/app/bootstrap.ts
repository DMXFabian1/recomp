/**
 * Arranque de la aplicación: abre el almacenamiento (con backup automático previo a migración),
 * siembra si hace falta y devuelve el Storage listo para los servicios.
 */
import { ulid } from 'ulid'
import { DexieStorage } from '@infra/dexie/storage'
import { SCHEMA_VERSION } from '@domain/backup/schema'
import type { Storage } from '@repo/index'
import { seedIfEmpty, type SeedResult } from './seed/seed'

export interface BootResult {
  storage: Storage
  migratedFrom: number | null
  schemaVersion: number
  seed: SeedResult
}

export async function bootstrap(dbName?: string): Promise<BootResult> {
  const storage = new DexieStorage(dbName)
  await storage.open()
  const migratedFrom = storage.migratedFrom
  if (migratedFrom !== null) {
    const now = new Date().toISOString()
    await storage.run(['app_events'], repos =>
      repos.app_events.put({
        id: ulid(), created_at: now, updated_at: now, source: 'system', ts: now,
        type: 'migration', payload: { from: migratedFrom, to: SCHEMA_VERSION },
      }))
  }
  const seed = await seedIfEmpty(storage)
  return { storage, migratedFrom, schemaVersion: SCHEMA_VERSION, seed }
}
