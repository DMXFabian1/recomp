/**
 * Interfaces de repositorio (Fase 3). Solo tipos: la UI y el dominio dependen de esto,
 * nunca de Dexie. `infra/dexie` las implementa en V1; un `HttpRepo` las implementará
 * contra tu API sin tocar dominio ni UI.
 */
import type { BaseEntity, CollectionName, EntityMap } from '@domain/entities'

export interface QueryRange<K> {
  lower?: K
  upper?: K
  lowerOpen?: boolean
  upperOpen?: boolean
}

/** Repositorio genérico por colección. Las operaciones son por documento completo. */
export interface Repository<T extends BaseEntity> {
  get(id: string): Promise<T | undefined>
  getAll(): Promise<T[]>
  /** Todos los registros no borrados (deleted_at ausente). */
  getLive(): Promise<T[]>
  put(entity: T): Promise<void>
  bulkPut(entities: T[]): Promise<void>
  /** Borrado lógico: fija deleted_at y updated_at. */
  softDelete(id: string, at: string): Promise<void>
  /** Borrado físico: solo para importación en modo reemplazar y limpieza de backups automáticos. */
  hardDelete(id: string): Promise<void>
  clear(): Promise<void>
  count(): Promise<number>
  /** Búsqueda por índice simple o compuesto (los índices se declaran en infra). */
  where<K>(index: string, range: QueryRange<K>): Promise<T[]>
  whereEquals(index: string, value: unknown): Promise<T[]>
}

export type Repos = { [C in CollectionName]: Repository<EntityMap[C]> }

/**
 * Unidad de trabajo: cada caso de uso escribe en una sola transacción.
 * `run` ejecuta `fn` con acceso a todos los repos; si lanza, nada se persiste.
 */
export interface UnitOfWork {
  run<R>(collections: CollectionName[], fn: (repos: Repos) => Promise<R>): Promise<R>
  /** Lectura fuera de transacción. */
  readonly repos: Repos
}

export interface StorageInfo {
  ok: boolean
  schema_version: number
  persisted: boolean
  usage_bytes?: number
  quota_bytes?: number
  counts: Partial<Record<CollectionName, number>>
}

export interface Storage extends UnitOfWork {
  open(): Promise<void>
  close(): void
  info(): Promise<StorageInfo>
  /** Borra TODO (solo importación en modo reemplazar o reset explícito). */
  wipe(): Promise<void>
}
