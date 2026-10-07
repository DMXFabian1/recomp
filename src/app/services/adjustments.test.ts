/** Fase 8.9 — evaluación, Recommendation, Decision y Settings sobre IndexedDB real (fake-indexeddb) con el seed oficial. */
import { describe, expect, it } from 'vitest'
import { DexieStorage } from '@infra/dexie/storage'
import { seedIfEmpty } from '@app/seed/seed'
import type { Storage } from '@repo/index'
import { addDays } from '@domain/time/day'
import { saveCheckIn } from './checkin'
import { logWaist } from './progress'
import { acceptRecommendation, evaluateAdjustmentWindow, ignoreRecommendation, listDecisions, loadPendingRecommendation } from './adjustments'

const ISO = (d: string, hhmm = '08:00') => `${d}T${hhmm}:00.000Z`
const START = '2026-10-06' // effective_from del seed → ventana 0: 10-06 → 10-19
const END = '2026-10-19'
const TODAY = '2026-10-21'
async function fresh(name: string): Promise<Storage> {
  const s = new DexieStorage(name); await s.open(); await seedIfEmpty(s); return s
}
/** Semana 1 peso w1, semana 2 peso w2, todos los días con check-in. */
async function fill(s: Storage, w1: number, w2: number, extra: Parameters<typeof saveCheckIn>[2] = {}, food: 'plan' | 'almost' | 'off' = 'plan') {
  for (let d = 0; d < 14; d++) {
    const date = addDays(START, d)
    await saveCheckIn(s, date, { weight_kg: d < 7 ? w1 : w2, food_yesterday: food, ...extra }, ISO(date))
  }
}

describe('evaluación de ventana', () => {
  it('ventana incompleta: no crea nada; sin datos: no_change; nunca toca Settings', async () => {
    const s = await fresh('adj_window')
    const r0 = await evaluateAdjustmentWindow(s, '2026-10-19', ISO('2026-10-19'))
    expect(r0.skipped).toBe('window_incomplete')
    expect(r0.window).toMatchObject({ kind: 'window_incomplete', next_end: END, days_remaining: 1 })
    const r1 = await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY))
    expect(r1.skipped).toBe('no_change')
    expect(r1.outcome!.results.B.no_data).toBe(true)
    expect(r1.outcome!.results.A.no_data).toBe(true)
    expect(await s.repos.recommendations.count()).toBe(0)
    expect(await s.repos.alerts.count()).toBe(0)
    expect(await s.repos.settings.getLive()).toHaveLength(1)
    s.close()
  })
  it('pérdida >1 %: crea UNA Recommendation pending con evidencia; repetir es idempotente; otra ventana no duplica si hay pending', async () => {
    const s = await fresh('adj_fast')
    await fill(s, 120, 118.5)
    const r = await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY))
    expect(r.skipped).toBeNull()
    const rec = (await loadPendingRecommendation(s))!
    expect(rec).toMatchObject({ id: r.recommendation_id, origin: 'rules', type: 'kcal', status: 'pending', rule_id: 'weight_loss_too_fast', evaluation_period_start: START, evaluation_period_end: END, proposed_change: { type: 'kcal', delta: 150 } })
    expect(rec.evidence!.find(e => e.metric === 'weight_loss_pct_week')!.observed).toBe(1.25)
    // alertas: adherencia >85 % (100 %); mismo estado tras repetir
    expect((await s.repos.alerts.getLive()).map(a => a.type)).toEqual(['adherence_high'])
    const r2 = await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY, '09:00'))
    expect(r2.skipped).toBe('duplicate')
    expect(r2.alerts_created).toBe(0)
    const r3 = await evaluateAdjustmentWindow(s, addDays(TODAY, 1), ISO(addDays(TODAY, 1)))
    expect(r3.skipped).toBe('duplicate')
    expect(await s.repos.recommendations.count()).toBe(1)
    expect(await s.repos.alerts.count()).toBe(1)
    // segunda ventana (10-20 → 11-02) con pérdida rápida y la primera aún pending → pending_exists
    for (let d = 14; d < 28; d++) { const date = addDays(START, d); await saveCheckIn(s, date, { weight_kg: d < 21 ? 118 : 116, food_yesterday: 'plan' }, ISO(date)) }
    const r4 = await evaluateAdjustmentWindow(s, '2026-11-04', ISO('2026-11-04'))
    expect(r4.skipped).toBe('pending_exists')
    expect(r4.recommendation_id).toBe(rec.id)
    expect(await s.repos.recommendations.count()).toBe(1)
    expect(await s.repos.settings.getLive()).toHaveLength(1) // la evaluación nunca escribe Settings
    s.close()
  })
  it('adherencia <80 %: alerta adherence_low, sin Recommendation aunque la pérdida sea rápida', async () => {
    const s = await fresh('adj_low')
    await fill(s, 120, 117)
    for (const d of [0, 1, 2, 3]) await saveCheckIn(s, addDays(START, d), { food_yesterday: 'off' }, ISO(addDays(START, d)))
    const r = await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY))
    expect(r.skipped).toBe('no_change')
    expect(r.outcome!.decided_by).toBe('adherence_low')
    expect((await s.repos.alerts.getLive()).map(a => a.type)).toEqual(['adherence_low'])
    expect(await s.repos.recommendations.count()).toBe(0)
    s.close()
  })
  it('peso+cintura estables con adherencia alta → +2000 pasos; sueño y ánimo solo alertas', async () => {
    const s = await fresh('adj_stable')
    await fill(s, 120, 119.8, { steps_yesterday: 6000, sleep_bucket: '<6', mood: 2 })
    await logWaist(s, '2026-10-08', 104, ISO('2026-10-08'))
    await logWaist(s, '2026-10-16', 103.5, ISO('2026-10-16'))
    const r = await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY))
    const rec = (await loadPendingRecommendation(s))!
    expect(rec).toMatchObject({ type: 'steps', rule_id: 'weight_waist_stable', proposed_change: { type: 'steps', delta: 2000 } })
    expect((await s.repos.alerts.getLive()).map(a => a.type).sort()).toEqual(['adherence_high', 'mood', 'sleep_drop', 'weight_flat'])
    expect(r.alerts_created).toBe(4)
    expect((await s.repos.settings.getLive())[0]!.steps_target).toBe(9000)
    s.close()
  })
})

describe('aceptar / ignorar', () => {
  it('aceptar: transacción con Decision + accepted + Settings nueva (kcal 2550, origin recommendation, effective_from hoy); segundo intento already_decided', async () => {
    const s = await fresh('adj_accept')
    await fill(s, 120, 118.5)
    await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY))
    const rec = (await loadPendingRecommendation(s))!
    const r = await acceptRecommendation(s, rec.id, TODAY, ISO(TODAY, '10:00'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const rows = (await s.repos.settings.getLive()).sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ kcal_target: 2400, change_origin: 'seed', effective_from: START })
    expect(rows[1]).toMatchObject({ id: r.settings!.id, kcal_target: 2550, steps_target: 9000, protein_target_g: 180, change_origin: 'recommendation', effective_from: TODAY, recommendation_decision_id: r.decision.id })
    expect((await s.repos.recommendations.get(rec.id))!.status).toBe('accepted')
    expect((await s.repos.recommendation_decisions.get(r.decision.id))).toMatchObject({ recommendation_id: rec.id, decision: 'accepted', applied_settings_id: r.settings!.id, decided_at: ISO(TODAY, '10:00') })
    expect(await loadPendingRecommendation(s)).toBeNull()
    expect(await acceptRecommendation(s, rec.id, TODAY, ISO(TODAY, '11:00'))).toEqual({ ok: false, reason: 'already_decided' })
    expect(await ignoreRecommendation(s, rec.id, ISO(TODAY, '11:00'))).toEqual({ ok: false, reason: 'already_decided' })
    expect(await s.repos.settings.count()).toBe(2)
    expect(await s.repos.recommendation_decisions.count()).toBe(1)
    const list = await listDecisions(s)
    expect(list[0]!.recommendation!.id).toBe(rec.id)
    // la siguiente ventana parte de los nuevos Settings (effective_from hoy): incompleta
    expect((await evaluateAdjustmentWindow(s, addDays(TODAY, 1), ISO(addDays(TODAY, 1)))).skipped).toBe('window_incomplete')
    s.close()
  })
  it('ignorar: Decision + ignored, Settings intacto; segundo intento already_decided; la ventana ya evaluada no vuelve a recomendar', async () => {
    const s = await fresh('adj_ignore')
    await fill(s, 120, 118)
    await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY))
    const rec = (await loadPendingRecommendation(s))!
    const r = await ignoreRecommendation(s, rec.id, ISO(TODAY, '10:00'))
    expect(r).toMatchObject({ ok: true, settings: null, decision: { decision: 'ignored', recommendation_id: rec.id } })
    expect(await s.repos.settings.getLive()).toHaveLength(1)
    expect((await s.repos.settings.getLive())[0]!.kcal_target).toBe(2400)
    expect((await s.repos.recommendations.get(rec.id))!.status).toBe('ignored')
    expect(await ignoreRecommendation(s, rec.id, ISO(TODAY, '11:00'))).toEqual({ ok: false, reason: 'already_decided' })
    expect(await acceptRecommendation(s, rec.id, TODAY, ISO(TODAY, '11:00'))).toEqual({ ok: false, reason: 'already_decided' })
    expect((await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY, '12:00'))).skipped).toBe('duplicate')
    expect(await s.repos.recommendations.count()).toBe(1)
    expect(await s.repos.recommendation_decisions.count()).toBe(1)
    s.close()
  })
  it('atomicidad: si falla la escritura de Settings no queda Decision ni Recommendation accepted', async () => {
    const s = await fresh('adj_atomic')
    await fill(s, 120, 118.5)
    await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY))
    const rec = (await loadPendingRecommendation(s))!
    // Forzamos una validación fallida: fecha de hoy inválida → Settings.effective_from inválido → AppError dentro de la transacción
    await expect(acceptRecommendation(s, rec.id, 'no-es-fecha' as never, ISO(TODAY))).rejects.toMatchObject({ code: 'validation' })
    expect((await s.repos.recommendations.get(rec.id))!.status).toBe('pending')
    expect(await s.repos.recommendation_decisions.count()).toBe(0)
    expect(await s.repos.settings.count()).toBe(1)
    s.close()
  })
  it('recomendación inexistente → not_found', async () => {
    const s = await fresh('adj_404')
    await expect(acceptRecommendation(s, 'nope', TODAY, ISO(TODAY))).rejects.toMatchObject({ code: 'not_found' })
    s.close()
  })
})
