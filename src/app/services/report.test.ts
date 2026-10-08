/** Fase 8.10 — reporte quincenal sobre IndexedDB real (fake-indexeddb) con el seed oficial. READ-ONLY. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DexieStorage } from '@infra/dexie/storage'
import { seedIfEmpty } from '@app/seed/seed'
import { SEED_IDS } from '@app/seed/ids'
import { COLLECTIONS } from '@domain/entities'
import { addDays } from '@domain/time/day'
import type { Storage } from '@repo/index'
import { saveCheckIn } from './checkin'
import { logWaist } from './progress'
import { logOffPlan } from './meals'
import { logCardio } from './cardio'
import { startSession, suggestVersion } from './sessions'
import { finishSession, logSet } from './training'
import { savePhoto } from './photos'
import { acceptRecommendation, evaluateAdjustmentWindow, ignoreRecommendation, loadPendingRecommendation } from './adjustments'
import { loadCoachReport } from './report'

const ISO = (d: string, hhmm = '08:00') => `${d}T${hhmm}:00.000Z`
const START = '2026-10-06', END = '2026-10-19', TODAY = '2026-10-21'
async function fresh(name: string): Promise<Storage> {
  const s = new DexieStorage(name); await s.open(); await seedIfEmpty(s); return s
}
async function snapshot(s: Storage): Promise<string> {
  const out: Record<string, unknown> = {}
  for (const c of COLLECTIONS) {
    const rows = await s.repos[c].getAll()
    out[c] = c === 'progress_photos' ? rows.map(r => ({ ...r, blob: (r as { blob: Blob }).blob.size, thumb: (r as { thumb: Blob }).thumb.size })) : rows
  }
  return JSON.stringify(out)
}
/** Quincena completa: peso 120 → 118.5, adherencia plan, cintura, una sesión con squat, cardio, comidas. */
async function fill(s: Storage) {
  for (let d = 0; d < 14; d++) {
    const date = addDays(START, d)
    await saveCheckIn(s, date, { weight_kg: d < 7 ? 120 : 118.5, food_yesterday: 'plan', sleep_bucket: d < 4 ? '<6' : '7-8', steps_yesterday: 8000, energy: 3, hunger: 3, mood: 3 }, ISO(date))
  }
  await logWaist(s, '2026-10-08', 105, ISO('2026-10-08'))
  await logWaist(s, '2026-10-16', 104.2, ISO('2026-10-16'))
  const tpl = (await s.repos.workout_templates.get(SEED_IDS.templates.legA))!
  const ws = await startSession(s, { template: tpl, date: START, suggestion: suggestVersion({ template: tpl }), userChoice: 'full' }, ISO(START, '18:15'))
  for (let i = 0; i < 3; i++) await logSet(s, { session_id: ws.id, exercise_id: SEED_IDS.exercises.squat, weight_kg: 60, reps: 8, rir: 2, is_warmup: false }, ISO(START, `18:2${i}`))
  await finishSession(s, ws.id, ISO(START, '19:30'), START)
  await logCardio(s, { date: '2026-10-07', modality: 'row', preset: 'z2_20', duration_s: 1200, rpe: 4, distance_m: 4200 }, ISO('2026-10-07'))
  await logOffPlan(s, { date: '2026-10-07', slot: 'lunch', protein_g: 60 }, ISO('2026-10-07', '14:00'))
  await logOffPlan(s, { date: '2026-10-08', slot: 'dinner', protein_g: null }, ISO('2026-10-08', '20:00'))
}

describe('reporte quincenal: contenido', () => {
  it('datos completos: ventana cerrada, cuerpo, fuerza, cardio, comidas, alertas y Recommendation pending', async () => {
    const s = await fresh('rep_full')
    await fill(s)
    await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY)) // 8.9 crea su Recommendation y alertas (no el reporte)
    const { report: r, text } = await loadCoachReport(s, TODAY, ISO(TODAY, '09:00'))
    expect(r.period).toMatchObject({ status: 'closed', start: START, end: END, days: 14 })
    expect(r.body).toMatchObject({ avg7_kg: 118.5, avg7_prev_kg: 120, avg7_change_kg: -1.5, loss_pct_week: 1.25, waist_change_cm: -0.8 })
    expect(r.training.counts.completed).toBe(1)
    expect(r.training.key_lifts[0]!.sessions).toEqual([{ date: START, load_kg: 60, reps: [8, 8, 8], substituted: false }])
    expect(r.training.rotation!.next).toBe((await s.repos.workout_templates.get(SEED_IDS.templates.upperA))!.name)
    expect(r.cardio).toMatchObject({ total_minutes: 20, total_distance_m: 4200 })
    expect(r.nutrition).toMatchObject({ meal_logs: 2, off_plan_protein_unknown: 1, kcal_target: 2400 })
    expect(r.nutrition.by_status.off_plan).toBe(2)
    expect(r.nutrition.days.find(d => d.date === '2026-10-07')!.protein_g).toBe(60)
    expect(r.nutrition.days.find(d => d.date === '2026-10-09')!.protein_g).toBeNull()
    expect(r.nutrition.foods_without_macros.some(n => /Mutant ISO/.test(n))).toBe(true) // proteína desconocida
    expect(r.alerts.items.map(a => a.type).sort()).toEqual(['adherence_high', 'sleep_drop'])
    expect(r.adjustments.recommendations).toHaveLength(1)
    expect(r.adjustments.recommendations[0]).toMatchObject({ status: 'pending', decision: null, proposed_change: { type: 'kcal', delta: 150 } })
    expect(text).toContain('STATUS: pending')
    expect(text).toContain('Mutant ISO')
    s.close()
  })
  it('datos parciales: ventana en curso hasta ayer; solo lo registrado', async () => {
    const s = await fresh('rep_partial')
    await saveCheckIn(s, '2026-10-06', { weight_kg: 120 }, ISO('2026-10-06'))
    const { report: r } = await loadCoachReport(s, '2026-10-08', ISO('2026-10-08'))
    expect(r.period).toMatchObject({ status: 'partial', start: START, end: '2026-10-07', days: 2, window_end: END })
    expect(r.body.latest_weight).toEqual({ date: '2026-10-06', kg: 120 })
    expect(r.body.avg7_kg).toBeNull()
    expect(r.missing.items[0]).toMatch(/solo 2 días cerrados/)
    s.close()
  })
  it('accepted e ignored con su Decision; Settings vigente nuevo', async () => {
    const a = await fresh('rep_accepted')
    await fill(a)
    await evaluateAdjustmentWindow(a, TODAY, ISO(TODAY))
    await acceptRecommendation(a, (await loadPendingRecommendation(a))!.id, TODAY, ISO(TODAY, '10:00'))
    const ra = (await loadCoachReport(a, '2026-10-22', ISO('2026-10-22'))).report
    expect(ra.period.status).toBe('partial') // nueva ventana desde hoy (8.9)
    expect(ra.adjustments.recommendations[0]).toMatchObject({ status: 'accepted', decision: { decision: 'accepted', applied_effective_from: TODAY } })
    expect(ra.adjustments.current).toMatchObject({ effective_from: TODAY, change_origin: 'recommendation', kcal_target: 2550 })
    a.close()
    const i = await fresh('rep_ignored')
    await fill(i)
    await evaluateAdjustmentWindow(i, TODAY, ISO(TODAY))
    await ignoreRecommendation(i, (await loadPendingRecommendation(i))!.id, ISO(TODAY, '10:00'))
    const ri = (await loadCoachReport(i, TODAY, ISO(TODAY, '11:00'))).report
    expect(ri.adjustments.recommendations[0]).toMatchObject({ status: 'ignored', decision: { decision: 'ignored', applied_effective_from: null } })
    expect(ri.adjustments.current.kcal_target).toBe(2400)
    i.close()
  })
})

describe('reporte quincenal: READ-ONLY, privacidad, determinismo', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  afterEach(() => fetchSpy.mockClear())
  it('generar no modifica NINGUNA colección (Settings, Recommendations, Decisions, Alerts, sesiones, comidas…), no crea Recommendations, no hace red', async () => {
    const s = await fresh('rep_readonly')
    await fill(s)
    await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY))
    await savePhoto(s, { date: '2026-10-10', view: 'front', blob: new Blob([new Uint8Array(64)], { type: 'image/jpeg' }), thumb: new Blob([new Uint8Array(8)], { type: 'image/jpeg' }), width: 10, height: 10 }, ISO('2026-10-10'))
    const before = await snapshot(s)
    const xhr = vi.fn(), beacon = vi.fn()
    vi.stubGlobal('XMLHttpRequest', xhr)
    vi.stubGlobal('navigator', { ...globalThis.navigator, sendBeacon: beacon })
    const v1 = await loadCoachReport(s, TODAY, ISO(TODAY, '09:00'))
    const v2 = await loadCoachReport(s, TODAY, ISO(TODAY, '09:00'))
    vi.unstubAllGlobals()
    expect(await snapshot(s)).toBe(before)
    expect(await s.repos.recommendations.count()).toBe(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhr).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    // determinista: mismo snapshot → mismo texto y misma estructura
    expect(v2.text).toBe(v1.text)
    expect(JSON.stringify(v2.report)).toBe(JSON.stringify(v1.report))
    // fotos nunca incluidas
    const json = JSON.stringify(v1.report)
    expect(json).not.toMatch(/progress_photo|thumb|image\/jpeg|blob/i)
    expect(v1.text).not.toMatch(/foto|photo|blob|base64|data:|https?:/i)
    s.close()
  })
})
