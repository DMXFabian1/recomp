/**
 * Storage = implementación V1 de la unidad de trabajo sobre Dexie.
 * `run` ejecuta un caso de uso dentro de UNA transacción 'rw' sobre las colecciones indicadas:
 * si la función lanza, Dexie aborta y nada se persiste.
 */
import type { Table } from 'dexie'
import { COLLECTIONS, type CollectionName } from '@domain/entities'
import { SCHEMA_VERSION } from '@domain/backup/schema'
import { AppError } from '@domain/errors'
import type { Repos, Storage, StorageInfo } from '@repo/index'
import { openDatabase, type RecompDB } from './db'
import { DexieRepository } from './repository'

export class DexieStorage implements Storage {
  private db: RecompDB | null = null
  private _repos: Repos | null = null
  migratedFrom: number | null = null

  private readonly name: string | undefined
  constructor(name?: string) {
    this.name = name
  }

  async open() {
    if (this.db) return
    const { db, migratedFrom } = await openDatabase(this.name)
    this.db = db
    this.migratedFrom = migratedFrom
    this._repos = buildRepos(db)
    // Pide almacenamiento persistente (evita evicción en iOS/Android). Tolera rechazo.
    try {
      await navigator.storage?.persist?.()
    } catch {
      /* no crítico */
    }
  }

  close() {
    this.db?.close()
    this.db = null
    this._repos = null
  }

  get repos(): Repos {
    if (!this._repos) throw new AppError('storage_unavailable', 'La base de datos no está abierta.')
    return this._repos
  }

  async run<R>(collections: CollectionName[], fn: (repos: Repos) => Promise<R>): Promise<R> {
    const db = this.requireDb()
    const tables: Table[] = collections.map(c => db.tbl(c) as Table)
    try {
      return await db.transaction('rw', tables, () => fn(this.repos))
    } catch (e) {
      if (e instanceof AppError) throw e
      throw new AppError('write_failed', 'No se guardó. Intenta de nuevo.', e)
    }
  }

  async info(): Promise<StorageInfo> {
    const db = this.requireDb()
    const counts: StorageInfo['counts'] = {}
    for (const c of COLLECTIONS) counts[c] = await db.tbl(c).count()
    let persisted = false
    let usage_bytes: number | undefined
    let quota_bytes: number | undefined
    try {
      persisted = (await navigator.storage?.persisted?.()) ?? false
      const est = await navigator.storage?.estimate?.()
      usage_bytes = est?.usage
      quota_bytes = est?.quota
    } catch {
      /* no disponible */
    }
    const info: StorageInfo = { ok: true, schema_version: SCHEMA_VERSION, persisted, counts }
    if (usage_bytes !== undefined) info.usage_bytes = usage_bytes
    if (quota_bytes !== undefined) info.quota_bytes = quota_bytes
    return info
  }

  async wipe() {
    const db = this.requireDb()
    await db.transaction('rw', db.tables, async () => {
      for (const t of db.tables) await t.clear()
    })
  }

  private requireDb(): RecompDB {
    if (!this.db) throw new AppError('storage_unavailable', 'La base de datos no está abierta.')
    return this.db
  }
}

function buildRepos(db: RecompDB): Repos {
  const repos = {} as Record<CollectionName, unknown>
  for (const c of COLLECTIONS) repos[c] = new DexieRepository(db.tbl(c))
  return repos as Repos
}
