/**
 * Base de datos IndexedDB vía Dexie.
 * - Versiones declaradas desde DEXIE_SCHEMAS; SCHEMA_VERSION debe coincidir con su longitud.
 * - Antes de abrir con una versión más nueva que la instalada, `preMigrationBackup` guarda un
 *   backup automático en el store `backups` (se conservan los 3 más recientes).
 * - Si la actualización falla, Dexie aborta y la base queda en la versión previa.
 */
import Dexie, { type Table } from 'dexie'
import { ulid } from 'ulid'
import { COLLECTIONS, type CollectionName, type EntityMap, type Backup, type Exercise } from '@domain/entities'
import { SCHEMA_VERSION, APP_VERSION } from '@domain/backup/schema'
import { AppError } from '@domain/errors'
import { enrichLegacyExercise } from '@domain/catalog/legacy'
import { DB_NAME, DEXIE_SCHEMAS } from './schema'
import type { Transaction } from 'dexie'

/**
 * Transformaciones de datos por versión de destino. Se ejecutan dentro de la transacción
 * `versionchange`: si fallan, Dexie aborta y la base queda en la versión anterior.
 */
const UPGRADES: Record<number, (tx: Transaction) => Promise<void>> = {
  // v2: deriva los campos de catálogo de cada Exercise v1 sin tocar ids ni campos existentes.
  2: async (tx) => {
    await tx.table('exercises').toCollection().modify((e: Exercise) => {
      Object.assign(e, enrichLegacyExercise(e))
    })
  },
}

if (DEXIE_SCHEMAS.length !== SCHEMA_VERSION) {
  throw new Error(`DEXIE_SCHEMAS (${DEXIE_SCHEMAS.length}) y SCHEMA_VERSION (${SCHEMA_VERSION}) no coinciden`)
}

export type Tables = { [C in CollectionName]: Table<EntityMap[C], string> }

export class RecompDB extends Dexie {
  constructor(name = DB_NAME) {
    super(name)
    DEXIE_SCHEMAS.forEach((stores, i) => {
      const v = this.version(i + 1).stores(stores as Record<string, string>)
      const upgrade = UPGRADES[i + 1]
      if (upgrade) v.upgrade(upgrade)
    })
  }

  /** Acceso tipado a una tabla por nombre de colección. */
  tbl<C extends CollectionName>(name: C): Table<EntityMap[C], string> {
    return this.table(name) as Table<EntityMap[C], string>
  }
}

export const KEEP_AUTO_BACKUPS = 3

/**
 * Abre la base en modo dinámico (sin declarar versión) para leer la versión instalada.
 * Si es menor que SCHEMA_VERSION y mayor que 0, vuelca todas las colecciones a un backup
 * automático ANTES de que ocurra la actualización.
 * Devuelve la versión instalada encontrada (0 si la base no existía).
 */
export async function preMigrationBackup(
  name = DB_NAME,
  targetVersion = SCHEMA_VERSION,
): Promise<{ installed: number; backedUp: boolean }> {
  const exists = await Dexie.exists(name)
  if (!exists) return { installed: 0, backedUp: false }

  const dyn = new Dexie(name)
  try {
    await dyn.open() // modo dinámico: adopta el esquema instalado
    const installed = dyn.verno
    if (installed >= targetVersion || installed === 0) return { installed, backedUp: false }

    const collections: Record<string, unknown[]> = {}
    for (const c of COLLECTIONS) {
      if (c === 'backups' || c === 'progress_photos') continue // fotos: blobs aparte; backups: no anidar
      if (!dyn.tables.some(t => t.name === c)) continue
      collections[c] = await dyn.table(c).toArray()
    }
    const json = JSON.stringify({
      schema_version: installed,
      app_version: APP_VERSION,
      exported_at: new Date().toISOString(),
      device_id: 'auto',
      collections,
    })
    const blob = new Blob([json], { type: 'application/json' })
    const now = new Date().toISOString()
    const entry: Backup = {
      id: ulid(),
      created_at: now,
      updated_at: now,
      source: 'system',
      schema_version: installed,
      kind: 'auto_pre_migration',
      blob,
      bytes: blob.size,
    }
    if (dyn.tables.some(t => t.name === 'backups')) {
      const backups = dyn.table('backups') as Table<Backup, string>
      await backups.put(entry)
      const autos = (await backups.where('kind').equals('auto_pre_migration').toArray())
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      for (const old of autos.slice(KEEP_AUTO_BACKUPS)) await backups.delete(old.id)
    }
    return { installed, backedUp: true }
  } finally {
    dyn.close()
  }
}

/** Abre la base con la versión actual, haciendo antes el backup automático si procede. */
export async function openDatabase(name = DB_NAME): Promise<{ db: RecompDB; migratedFrom: number | null }> {
  let pre: { installed: number; backedUp: boolean }
  try {
    pre = await preMigrationBackup(name)
  } catch (e) {
    throw new AppError('storage_unavailable', 'No se pudo leer la base de datos existente.', e)
  }
  const db = new RecompDB(name)
  try {
    await db.open()
  } catch (e) {
    throw new AppError('migration', `No se pudo abrir o actualizar la base (instalada v${pre.installed}, requerida v${SCHEMA_VERSION}).`, e)
  }
  const migratedFrom = pre.installed > 0 && pre.installed < SCHEMA_VERSION ? pre.installed : null
  return { db, migratedFrom }
}
