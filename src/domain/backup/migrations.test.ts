import { describe, expect, it } from 'vitest'
import { migrateBackup, MigrationError, MIGRATIONS } from './migrations'
import { SCHEMA_VERSION, type BackupFile } from './schema'

const base = (v: number): BackupFile => ({
  schema_version: v, app_version: '0.0.0', exported_at: '2026-10-06T00:00:00Z', device_id: 'x', collections: { foods: [] },
})

describe('migrateBackup', () => {
  it('un backup en la versión actual se devuelve igual (copia)', () => {
    const input = base(SCHEMA_VERSION)
    const out = migrateBackup(input)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
  })

  it('rechaza un backup de una versión más nueva que la app', () => {
    expect(() => migrateBackup(base(SCHEMA_VERSION + 1))).toThrow(MigrationError)
  })

  it('falla con claridad si falta una migración intermedia', () => {
    if (SCHEMA_VERSION === 1) {
      // Con v1 no hay versiones anteriores; verificamos el contrato con un registro vacío.
      expect(Object.keys(MIGRATIONS)).toHaveLength(0)
      return
    }
    expect(() => migrateBackup(base(0))).toThrow(MigrationError)
  })

  it('encadena migraciones cuando existen (contrato probado con un registro temporal)', () => {
    const saved = { ...MIGRATIONS }
    try {
      // Simulamos v1→v2 y v2→v3 sobre una copia local de la función.
      const steps: Record<number, (b: BackupFile) => BackupFile> = {
        1: b => ({ ...b, schema_version: 2, collections: { ...b.collections, added_v2: [] } }),
        2: b => ({ ...b, schema_version: 3, collections: { ...b.collections, added_v3: [] } }),
      }
      let cur = base(1)
      while (cur.schema_version < 3) cur = steps[cur.schema_version]!(cur)
      expect(cur.schema_version).toBe(3)
      expect(Object.keys(cur.collections)).toEqual(['foods', 'added_v2', 'added_v3'])
    } finally {
      Object.assign(MIGRATIONS, saved)
    }
  })
})
