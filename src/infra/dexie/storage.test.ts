import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { COLLECTIONS, type DailyCheckIn } from '@domain/entities'
import { SCHEMA_VERSION } from '@domain/backup/schema'
import { AppError } from '@domain/errors'
import { DexieStorage } from './storage'
import { preMigrationBackup, KEEP_AUTO_BACKUPS } from './db'
import { DEXIE_SCHEMAS } from './schema'

const now = () => new Date().toISOString()
const checkIn = (date: string, weight_kg: number): DailyCheckIn => ({
  id: `ci_${date}`, created_at: now(), updated_at: now(), source: 'user', date, weight_kg, irregular: false,
})

describe('DexieStorage', () => {
  it('abre la base, crea todos los stores y reporta la versión de esquema', async () => {
    const s = new DexieStorage('t_open')
    await s.open()
    const info = await s.info()
    expect(info.ok).toBe(true)
    expect(info.schema_version).toBe(SCHEMA_VERSION)
    for (const c of COLLECTIONS) expect(info.counts[c]).toBe(0)
    s.close()
  })

  it('el esquema v1 declara exactamente las colecciones del dominio', () => {
    expect(Object.keys(DEXIE_SCHEMAS[0]!).sort()).toEqual([...COLLECTIONS].sort())
  })

  it('persiste y lee por índice único (date)', async () => {
    const s = new DexieStorage('t_rw')
    await s.open()
    await s.run(['daily_check_ins'], r => r.daily_check_ins.put(checkIn('2026-10-06', 119.4)))
    const rows = await s.repos.daily_check_ins.whereEquals('date', '2026-10-06')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.weight_kg).toBe(119.4)
    s.close()
  })

  it('una transacción que lanza no persiste nada (atomicidad)', async () => {
    const s = new DexieStorage('t_tx')
    await s.open()
    await expect(
      s.run(['daily_check_ins', 'app_events'], async r => {
        await r.daily_check_ins.put(checkIn('2026-10-06', 119.4))
        throw new Error('boom')
      }),
    ).rejects.toBeInstanceOf(AppError)
    expect(await s.repos.daily_check_ins.count()).toBe(0)
    s.close()
  })

  it('rechaza duplicar un índice único y envuelve el error como write_failed', async () => {
    const s = new DexieStorage('t_unique')
    await s.open()
    await s.run(['daily_check_ins'], r => r.daily_check_ins.put(checkIn('2026-10-06', 119.4)))
    const dup = { ...checkIn('2026-10-06', 120), id: 'otro_id' }
    await expect(s.run(['daily_check_ins'], r => r.daily_check_ins.put(dup))).rejects.toMatchObject({ code: 'write_failed' })
    expect(await s.repos.daily_check_ins.count()).toBe(1)
    s.close()
  })

  it('softDelete marca deleted_at y getLive lo excluye', async () => {
    const s = new DexieStorage('t_soft')
    await s.open()
    await s.run(['daily_check_ins'], r => r.daily_check_ins.put(checkIn('2026-10-06', 119.4)))
    await s.run(['daily_check_ins'], r => r.daily_check_ins.softDelete('ci_2026-10-06', now()))
    expect(await s.repos.daily_check_ins.count()).toBe(1)
    expect(await s.repos.daily_check_ins.getLive()).toHaveLength(0)
    s.close()
  })

  it('wipe borra todo', async () => {
    const s = new DexieStorage('t_wipe')
    await s.open()
    await s.run(['daily_check_ins'], r => r.daily_check_ins.put(checkIn('2026-10-06', 119.4)))
    await s.wipe()
    expect(await s.repos.daily_check_ins.count()).toBe(0)
    s.close()
  })
})

describe('preMigrationBackup', () => {
  it('no hace nada si la base no existe', async () => {
    expect(await preMigrationBackup('t_none')).toEqual({ installed: 0, backedUp: false })
  })

  it('no hace nada si la base ya está en la versión actual', async () => {
    const s = new DexieStorage('t_same')
    await s.open()
    s.close()
    expect(await preMigrationBackup('t_same')).toEqual({ installed: SCHEMA_VERSION, backedUp: false })
  })

  it('crea un backup automático con los datos cuando la versión instalada es anterior a la requerida', async () => {
    const legacy = new Dexie('t_legacy')
    legacy.version(1).stores({ daily_check_ins: 'id, &date', backups: 'id, created_at, kind' })
    await legacy.open()
    await legacy.table('daily_check_ins').put(checkIn('2026-10-01', 120))
    legacy.close()

    // Simulamos que la app requiere v2.
    const r = await preMigrationBackup('t_legacy', 2)
    expect(r).toEqual({ installed: 1, backedUp: true })

    const dyn = new Dexie('t_legacy')
    await dyn.open()
    const backups = await dyn.table('backups').toArray()
    expect(backups).toHaveLength(1)
    expect(backups[0].kind).toBe('auto_pre_migration')
    expect(backups[0].schema_version).toBe(1)
    const json = JSON.parse(await (backups[0].blob as Blob).text())
    expect(json.schema_version).toBe(1)
    expect(json.collections.daily_check_ins).toHaveLength(1)
    expect(json.collections.daily_check_ins[0].weight_kg).toBe(120)
    dyn.close()
  })

  it('conserva solo los últimos KEEP_AUTO_BACKUPS backups automáticos', async () => {
    const legacy = new Dexie('t_keep')
    legacy.version(1).stores({ daily_check_ins: 'id, &date', backups: 'id, created_at, kind' })
    await legacy.open()
    legacy.close()
    for (let i = 0; i < KEEP_AUTO_BACKUPS + 2; i++) {
      await preMigrationBackup('t_keep', 2)
      await new Promise(r => setTimeout(r, 2)) // created_at distinto
    }
    const dyn = new Dexie('t_keep')
    await dyn.open()
    expect(await dyn.table('backups').count()).toBe(KEEP_AUTO_BACKUPS)
    dyn.close()
  })
})
