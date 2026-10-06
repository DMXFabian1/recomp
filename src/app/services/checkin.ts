/**
 * Check-in matutino — Fase 8.5. Upsert PARCIAL por fecha (índice único &date): cada guardado fusiona
 * solo los campos presentes; lo ausente queda ausente (unknown). Nunca puntúa ni bloquea.
 * Modo irregular: flag en el check-in + AppEvent irregular_on/off. No cambia kcal, programa ni metas.
 */
import { ulid } from 'ulid'
import type { DailyCheckIn, DayString } from '@domain/entities'
import { validateEntity } from '@domain/validation/entities'
import { AppError } from '@domain/errors'
import type { Storage } from '@repo/index'

export type CheckInPatch = Partial<Omit<DailyCheckIn, 'id' | 'created_at' | 'updated_at' | 'source' | 'date' | 'deleted_at'>>

export async function getCheckIn(storage: Storage, date: DayString): Promise<DailyCheckIn | null> {
  const rows = await storage.repos.daily_check_ins.whereEquals('date', date)
  return rows.find(r => !r.deleted_at) ?? null
}

export async function saveCheckIn(storage: Storage, date: DayString, patch: CheckInPatch, now: string): Promise<DailyCheckIn> {
  return storage.run(['daily_check_ins'], async repos => {
    const existing = (await repos.daily_check_ins.whereEquals('date', date)).find(r => !r.deleted_at)
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    const row: DailyCheckIn = existing
      ? { ...existing, ...clean, updated_at: now, source: 'user' }
      : { id: ulid(), created_at: now, updated_at: now, source: 'user', date, irregular: false, ...clean }
    const v = validateEntity('daily_check_ins', row)
    if (!v.ok) throw new AppError('validation', `Check-in inválido: ${v.issues.map(i => `${i.path}: ${i.message}`).join('; ')}`)
    await repos.daily_check_ins.put(row)
    return row
  })
}

export async function setIrregular(storage: Storage, date: DayString, on: boolean, now: string, extra: Pick<CheckInPatch, 'irregular_food' | 'irregular_activity' | 'irregular_protein_g'> = {}): Promise<DailyCheckIn> {
  return storage.run(['daily_check_ins', 'app_events'], async repos => {
    const existing = (await repos.daily_check_ins.whereEquals('date', date)).find(r => !r.deleted_at)
    const base: DailyCheckIn = existing ?? { id: ulid(), created_at: now, updated_at: now, source: 'user', date, irregular: false }
    const row: DailyCheckIn = { ...base, ...(on ? extra : {}), irregular: on, updated_at: now }
    if (!on) { delete row.irregular_food; delete row.irregular_activity; delete row.irregular_protein_g }
    await repos.daily_check_ins.put(row)
    if (base.irregular !== on) {
      await repos.app_events.put({ id: ulid(), created_at: now, updated_at: now, source: 'user', ts: now, type: on ? 'irregular_on' : 'irregular_off', payload: { date } })
    }
    return row
  })
}
