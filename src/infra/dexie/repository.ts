import type { Table } from 'dexie'
import type { BaseEntity } from '@domain/entities'
import type { QueryRange, Repository } from '@repo/index'

/** Implementación genérica de Repository sobre una tabla Dexie. */
export class DexieRepository<T extends BaseEntity> implements Repository<T> {
  private readonly table: Table<T, string>
  constructor(table: Table<T, string>) {
    this.table = table
  }

  get(id: string) {
    return this.table.get(id)
  }

  getAll() {
    return this.table.toArray()
  }

  /** Devuelve promesas Dexie (no async/await nativo) para no cerrar transacciones abiertas entre ticks. */
  getLive(): Promise<T[]> {
    return this.table.toArray().then(rows => rows.filter(e => !e.deleted_at))
  }

  put(entity: T): Promise<void> {
    return this.table.put(entity).then(() => undefined)
  }

  bulkPut(entities: T[]): Promise<void> {
    return this.table.bulkPut(entities).then(() => undefined)
  }

  softDelete(id: string, at: string): Promise<void> {
    return this.table.get(id).then(e => (e ? this.table.put({ ...e, deleted_at: at, updated_at: at }).then(() => undefined) : undefined))
  }

  hardDelete(id: string): Promise<void> {
    return this.table.delete(id)
  }

  clear(): Promise<void> {
    return this.table.clear()
  }

  count() {
    return this.table.count()
  }

  where<K>(index: string, range: QueryRange<K>) {
    const w = this.table.where(index)
    if (range.lower !== undefined && range.upper !== undefined) {
      return w.between(range.lower, range.upper, !range.lowerOpen, !range.upperOpen).toArray()
    }
    if (range.lower !== undefined) return (range.lowerOpen ? w.above(range.lower) : w.aboveOrEqual(range.lower)).toArray()
    if (range.upper !== undefined) return (range.upperOpen ? w.below(range.upper) : w.belowOrEqual(range.upper)).toArray()
    return this.table.toArray()
  }

  whereEquals(index: string, value: unknown) {
    return this.table.where(index).equals(value as never).toArray()
  }
}
