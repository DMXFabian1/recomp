/** Fase 8.8 — progreso y fotos sobre IndexedDB real (fake-indexeddb) con el seed oficial. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DexieStorage } from '@infra/dexie/storage'
import { seedIfEmpty } from '@app/seed/seed'
import { SEED_IDS } from '@app/seed/ids'
import type { Storage } from '@repo/index'
import { saveCheckIn } from './checkin'
import { logOffPlan } from './meals'
import { startSession, suggestVersion } from './sessions'
import { finishSession, logSet } from './training'
import { logCardio, logMonthlyTest } from './cardio'
import { loadProgress, logBia, logWaist } from './progress'
import { deletePhoto, getPhoto, listPhotos, savePhoto } from './photos'

const ISO = (d: string, hhmm = '08:00') => `${d}T${hhmm}:00.000Z`
async function fresh(name: string): Promise<Storage> {
  const s = new DexieStorage(name); await s.open(); await seedIfEmpty(s); return s
}

describe('progreso: cuerpo', () => {
  it('peso: último registro, promedio 7 d solo con ≥4 registros reales, tendencia; sin datos → null', async () => {
    const s = await fresh('pg_body')
    let v = await loadProgress(s, '2026-10-07', 30)
    expect(v.body.latest).toBeNull()
    expect(v.body.avg7.kg).toBeNull()
    expect(v.body.trend_kg_week).toBeNull()
    for (const [d, w] of [['2026-10-01', 121], ['2026-10-02', 120.6], ['2026-10-04', 120.2], ['2026-10-07', 119.4]] as const) await saveCheckIn(s, d, { weight_kg: w }, ISO(d))
    v = await loadProgress(s, '2026-10-07', 30)
    expect(v.body.latest).toEqual({ date: '2026-10-07', kg: 119.4 })
    expect(v.body.avg7.kg).toBe(120.3)
    expect(v.body.avg7.points).toBe(4)
    expect(v.body.prev7.kg).toBeNull()
    expect(v.body.series).toHaveLength(4)
    expect(v.body.all_points).toBe(4)
    expect((await loadProgress(s, '2026-10-07', 7)).body.series).toHaveLength(4)
    s.close()
  })
  it('cintura y BIA: registro por fecha (upsert), último, histórico', async () => {
    const s = await fresh('pg_waist')
    await logWaist(s, '2026-10-01', 105, ISO('2026-10-01'))
    await logWaist(s, '2026-10-07', 103.5, ISO('2026-10-07'))
    await logWaist(s, '2026-10-07', 103, ISO('2026-10-07', '09:00')) // mismo día: reemplaza
    const b = await logBia(s, '2026-10-07', { bia_weight_kg: 119.6, bia_fat_pct: 36.2, bia_muscle_kg: 70.1 }, ISO('2026-10-07'))
    expect(b.type).toBe('bia')
    await expect(logBia(s, '2026-10-08', {}, ISO('2026-10-08'))).rejects.toMatchObject({ code: 'validation' })
    await expect(logWaist(s, '2026-10-08', -3, ISO('2026-10-08'))).rejects.toMatchObject({ code: 'validation' })
    const v = await loadProgress(s, '2026-10-07', 30)
    expect(v.body.waist_latest).toEqual({ date: '2026-10-07', cm: 103 })
    expect(v.body.waist_series.map(w => w.cm)).toEqual([105, 103])
    expect(v.body.bia).toHaveLength(1)
    expect(v.body.bia[0]!.bia_fat_pct).toBe(36.2)
    expect(await s.repos.body_measurements.count()).toBe(3)
    s.close()
  })
})

describe('progreso: fuerza, cardio, hábitos, metas', () => {
  it('fuerza desde sesiones completadas reales; key lifts exactos; tonelaje sin calentamientos', async () => {
    const s = await fresh('pg_strength')
    const tpl = (await s.repos.workout_templates.get(SEED_IDS.templates.legA))!
    const ws = await startSession(s, { template: tpl, date: '2026-10-06', suggestion: suggestVersion({ template: tpl }), userChoice: 'full' }, ISO('2026-10-06', '18:15'))
    await logSet(s, { session_id: ws.id, exercise_id: SEED_IDS.exercises.squat, weight_kg: 40, reps: 8, rir: 4, is_warmup: true }, ISO('2026-10-06', '18:16'))
    for (let i = 0; i < 3; i++) await logSet(s, { session_id: ws.id, exercise_id: SEED_IDS.exercises.squat, weight_kg: 60, reps: 8, rir: 2, is_warmup: false }, ISO('2026-10-06', `18:2${i}`))
    let v = await loadProgress(s, '2026-10-07', 30)
    expect(v.strength.tonnage).toEqual([]) // aún abierta
    await finishSession(s, ws.id, ISO('2026-10-06', '19:30'), '2026-10-06')
    v = await loadProgress(s, '2026-10-07', 30)
    expect(v.strength.tonnage).toHaveLength(1)
    expect(v.strength.tonnage[0]!.tonnage_kg).toBe(1440)
    expect(v.strength.key_lifts.map(k => k.id)).toEqual(['ex_squat', 'ex_bench', 'ex_deadlift', 'ex_chest_supported_row'])
    expect(v.strength.key_lifts[0]!.history).toEqual([{ date: '2026-10-06', session_id: ws.id, load_kg: 60, reps: [8, 8, 8], substituted: false }])
    expect(v.strength.key_lifts[1]!.history).toEqual([])
    s.close()
  })
  it('cardio semanal y pruebas; hábitos independientes; metas vs real', async () => {
    const s = await fresh('pg_rest')
    await logCardio(s, { date: '2026-10-05', modality: 'row', preset: 'z2_20', duration_s: 1200, rpe: 4, distance_m: 4200 }, ISO('2026-10-05'))
    await logCardio(s, { date: '2026-10-07', modality: 'walk', duration_s: 1800, rpe: 3 }, ISO('2026-10-07'))
    await logMonthlyTest(s, { date: '2026-10-07', distance_m: 2300 }, ISO('2026-10-07'))
    await saveCheckIn(s, '2026-10-07', { food_yesterday: 'off', sleep_bucket: '6-7', steps_yesterday: 7500, energy: 3, hunger: 4, mood: 3, weight_kg: 119.4 }, ISO('2026-10-07'))
    await logOffPlan(s, { date: '2026-10-06', slot: 'lunch', protein_g: 100 }, ISO('2026-10-06', '14:00'))
    await logOffPlan(s, { date: '2026-10-06', slot: 'dinner', protein_g: 70 }, ISO('2026-10-06', '20:00'))
    const v = await loadProgress(s, '2026-10-07', 7)
    expect(v.cardio.weeks[0]).toMatchObject({ week_start: '2026-10-05', sessions: 2, minutes: 50, distance_m: 4200 })
    expect(v.cardio.tests[0]!.test.distance_m).toBe(2300)
    expect(v.cardio.tests[0]!.distance_delta_m).toBeNull()
    expect(v.habits.days).toHaveLength(7)
    const d6 = v.habits.days.find(d => d.date === '2026-10-06')!
    expect(d6.protein_g).toBe(170) // proteína del 6
    expect(v.habits.days.find(d => d.date === '2026-10-07')!.food_yesterday).toBe('off') // adherencia declarada el 7 sobre el 6: independientes
    expect(v.habits.sleep['6-7']).toBe(1)
    expect(v.habits.steps_avg).toBe(7500)
    expect(v.goals).toHaveLength(4)
    const oct = v.goals.find(g => g.month === '2026-10')!
    expect(oct.weight_goal_kg).toBeNull() // baseline sin weight_avg_kg: solo %
    expect(oct.weight_goal_pct).toEqual([-4, -1.5])
    expect(oct.weight_real_kg).toBeNull() // 1 registro: sin datos suficientes
    expect(oct.cardio_sessions_real).toBe(2)
    expect(oct.strength_sessions_real).toBe(0)
    expect(v.settings?.steps_target).toBe(9000)
    expect((await s.repos.monthly_goals.get('mg_2026-10'))!.weight_pct_range).toEqual([-4, -1.5]) // sin modificación
    expect((await s.repos.settings.getLive())).toHaveLength(1) // Settings intactos
    s.close()
  })
})

describe('fotos (locales)', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  afterEach(() => fetchSpy.mockClear())
  const blob = (n: number) => new Blob([new Uint8Array(n)], { type: 'image/jpeg' })
  it('front/side/back por mes: guardar, listar, reemplazar, abrir y borrar; Blob en IndexedDB; ninguna llamada externa', async () => {
    const s = await fresh('pg_photos')
    const a = await savePhoto(s, { date: '2026-10-07', view: 'front', blob: blob(300), thumb: blob(30), width: 1200, height: 1600 }, ISO('2026-10-07'))
    await savePhoto(s, { date: '2026-10-08', view: 'side', blob: blob(200), thumb: blob(20), width: 1200, height: 1600 }, ISO('2026-10-08'))
    await savePhoto(s, { date: '2026-10-09', view: 'back', blob: blob(100), thumb: blob(10), width: 1200, height: 1600 }, ISO('2026-10-09'))
    expect(a.month).toBe('2026-10')
    expect(a.bytes).toBe(300)
    let list = await listPhotos(s)
    expect(list.map(p => p.view)).toEqual(['back', 'front', 'side'])
    // reemplazo: misma vista y mes → mismo id, nuevo blob
    const a2 = await savePhoto(s, { date: '2026-10-20', view: 'front', blob: blob(500), thumb: blob(50), width: 1000, height: 1000 }, ISO('2026-10-20'))
    expect(a2.id).toBe(a.id)
    expect(a2.bytes).toBe(500)
    expect(await s.repos.progress_photos.count()).toBe(3)
    const got = (await getPhoto(s, a.id))!
    expect(got.blob).toBeInstanceOf(Blob)
    expect(got.blob.size).toBe(500)
    expect(got.thumb.size).toBe(50)
    // otro mes: registro aparte
    await savePhoto(s, { date: '2026-11-07', view: 'front', blob: blob(1), thumb: blob(1), width: 10, height: 10 }, ISO('2026-11-07'))
    expect(await s.repos.progress_photos.count()).toBe(4)
    expect((await listPhotos(s))[0]!.month).toBe('2026-11')
    await deletePhoto(s, a.id)
    list = await listPhotos(s)
    expect(list.some(p => p.id === a.id)).toBe(false)
    expect(await getPhoto(s, a.id)).toBeNull()
    // tras borrar se puede volver a guardar esa vista del mes (índice único)
    await savePhoto(s, { date: '2026-10-21', view: 'front', blob: blob(7), thumb: blob(7), width: 10, height: 10 }, ISO('2026-10-21'))
    expect(fetchSpy).not.toHaveBeenCalled()
    s.close()
  })
  it('valida: sin dimensiones o sin Blob → error', async () => {
    const s = await fresh('pg_photos_bad')
    await expect(savePhoto(s, { date: '2026-10-07', view: 'front', blob: blob(1), thumb: blob(1), width: 0, height: 10 }, ISO('2026-10-07'))).rejects.toMatchObject({ code: 'validation' })
    await expect(savePhoto(s, { date: '2026-10-07', view: 'front', blob: 'x' as never, thumb: blob(1), width: 10, height: 10 }, ISO('2026-10-07'))).rejects.toMatchObject({ code: 'validation' })
    expect(fetchSpy).not.toHaveBeenCalled()
    s.close()
  })
})
