/** Fase 8.9 — reglas de ajuste puras. Fixtures sintéticos (2001, ids test_*). */
import { describe, expect, it } from 'vitest'
import type { BodyMeasurement, DailyCheckIn, Settings } from '@domain/entities'
import { addDays } from '@domain/time/day'
import { createCompletedSessionFixture, createSetsFixture, resetFixtureSequence, TEST_T0 } from '@test/fixtures/training'
import {
  acceptRecommendationPure, buildInputs, evaluateAdjustment, evaluationWindow, ignoreRecommendationPure, previousWindow, ruleC, ruleE, strengthInput,
  type AdjustmentInputs, type EvaluationWindow,
} from './index'

const base = { created_at: TEST_T0, updated_at: TEST_T0, source: 'user' as const }
const FROM = '2001-03-01' // effective_from sintético
const W: EvaluationWindow = { start: '2001-03-01', end: '2001-03-14', index: 0 }
const TODAY = '2001-03-15'

type CI = Partial<Omit<DailyCheckIn, 'date'>>
function checkIns(spec: Record<string, CI>): DailyCheckIn[] {
  return Object.entries(spec).map(([date, c], i) => ({ ...base, id: `test_ci_${i}`, date, irregular: false, ...c }))
}
/** 14 días: peso lineal de w1 (día 1) a w2 (día 14) con todos los días; adherencia y extras uniformes. */
function fullWindow(w: EvaluationWindow, opts: { w1?: number; w2?: number; food?: DailyCheckIn['food_yesterday']; extra?: CI; skipWeightDays?: number[] } = {}): Record<string, CI> {
  const out: Record<string, CI> = {}
  for (let d = 0; d < 14; d++) {
    const date = addDays(w.start, d)
    const c: CI = { food_yesterday: opts.food ?? 'plan', ...opts.extra }
    if (opts.w1 !== undefined && opts.w2 !== undefined && !(opts.skipWeightDays ?? []).includes(d)) {
      // semana 1 constante w1, semana 2 constante w2 → promedios exactos
      c.weight_kg = d < 7 ? opts.w1 : opts.w2
    }
    out[date] = c
  }
  return out
}
function waist(cm1: number | null, cm2: number | null): BodyMeasurement[] {
  const out: BodyMeasurement[] = []
  if (cm1 !== null) out.push({ ...base, id: 'test_bm_1', date: addDays(W.start, 3), type: 'waist', waist_cm: cm1 })
  if (cm2 !== null) out.push({ ...base, id: 'test_bm_2', date: addDays(W.start, 10), type: 'waist', waist_cm: cm2 })
  return out
}
function inputs(spec: Record<string, CI>, measurements: BodyMeasurement[] = []): AdjustmentInputs {
  return buildInputs({ window: W, checkIns: checkIns(spec), measurements, sessions: [], sets: [] })
}
const SETTINGS = { steps_target: 9000 }
const evalWith = (spec: Record<string, CI>, m: BodyMeasurement[] = []) => evaluateAdjustment(inputs(spec, m), SETTINGS, TODAY)

describe('ventana', () => {
  it('incompleta mientras end ≥ hoy; completa cuando end < hoy; se evalúa la última completa', () => {
    expect(evaluationWindow(FROM, '2001-03-01')).toMatchObject({ kind: 'window_incomplete', next_end: '2001-03-14', days_remaining: 14 })
    expect(evaluationWindow(FROM, '2001-03-14')).toMatchObject({ kind: 'window_incomplete', days_remaining: 1 })
    expect(evaluationWindow(FROM, '2001-03-15')).toEqual({ kind: 'ready', window: W })
    expect(evaluationWindow(FROM, '2001-03-28')).toEqual({ kind: 'ready', window: W })
    expect(evaluationWindow(FROM, '2001-03-29')).toEqual({ kind: 'ready', window: { start: '2001-03-15', end: '2001-03-28', index: 1 } })
    expect(previousWindow(W)).toEqual({ start: '2001-02-15', end: '2001-02-28', index: -1 })
  })
})

describe('datos mínimos: missing ≠ zero', () => {
  it('peso con <4 puntos en alguna semana → null; no se interpola', () => {
    const i = inputs(fullWindow(W, { w1: 120, w2: 118, skipWeightDays: [7, 8, 9, 10] }))
    expect(i.weight.week2_points).toBe(3)
    expect(i.weight.loss_pct_week).toBeNull()
    const o = evaluateAdjustment(i, SETTINGS, TODAY)
    expect(o.results.B.no_data).toBe(true)
    expect(o.results.B.fired).toBe(false)
    expect(o.results.F.fired).toBe(false)
    expect(o.recommendation).toBeNull()
  })
  it('adherencia con <10 check-ins respondidos → null (no 0 %) y A no se activa', () => {
    const spec = fullWindow(W, { w1: 120, w2: 118.5 })
    for (const d of [0, 1, 2, 3, 4]) delete spec[addDays(W.start, d)]!.food_yesterday
    const i = inputs(spec)
    expect(i.adherence.answered).toBe(9)
    expect(i.adherence.pct).toBeNull()
    const o = evaluateAdjustment(i, SETTINGS, TODAY)
    expect(o.results.A).toMatchObject({ fired: false, no_data: true })
    expect(o.alerts.some(a => a.type === 'adherence_low' || a.type === 'adherence_high')).toBe(false)
    // B sí puede activarse: la adherencia desconocida no bloquea ni habilita por sí misma
    expect(o.decided_by).toBe('weight_loss_too_fast')
  })
  it('sin datos de peso no hay weight_flat (sin datos ≠ estable); sin cintura E no se activa', () => {
    const o = evalWith(fullWindow(W, { food: 'plan' }))
    expect(o.alerts.some(a => a.type === 'weight_flat')).toBe(false)
    const o2 = evalWith(fullWindow(W, { w1: 120, w2: 119.9 }), [])
    expect(o2.results.E).toMatchObject({ no_data: true, fired: false })
    expect(o2.recommendation).toBeNull()
  })
  it('hambre/ánimo sin datos → 0 días, nunca se activa', () => {
    const i = inputs(fullWindow(W, { w1: 120, w2: 119 }))
    expect(i.recent.hunger_high_days).toBe(0)
    expect(i.recent.mood_low_days).toBe(0)
    expect(evaluateAdjustment(i, SETTINGS, TODAY).results.D.fired).toBe(false)
  })
})

describe('reglas', () => {
  it('A: adherencia <80 % bloquea B aunque la pérdida sea rápida; alerta adherence_low', () => {
    const spec = fullWindow(W, { w1: 120, w2: 117, food: 'plan' })
    for (const d of [0, 1, 2, 3]) spec[addDays(W.start, d)]!.food_yesterday = 'off' // 10/14 = 71 %
    const o = evalWith(spec)
    expect(o.results.A.fired).toBe(true)
    expect(o.results.B.fired).toBe(true)
    expect(o.decided_by).toBe('adherence_low')
    expect(o.recommendation).toBeNull()
    expect(o.alerts.map(a => a.type)).toContain('adherence_low')
    expect(o.alerts.every(a => a.context.action_taken === 'none')).toBe(true)
  })
  it('adherencia >85 % → alerta adherence_high; no es ajuste', () => {
    const o = evalWith(fullWindow(W, { w1: 120, w2: 119.2, food: 'almost' })) // 0.67 %/sem → F
    expect(o.alerts.map(a => a.type)).toContain('adherence_high')
    expect(o.decided_by).toBe('weight_loss_adequate')
    expect(o.recommendation).toBeNull()
  })
  it('B: >1 %/sem → +150 kcal; >1.5 %/sem → +200 kcal; evidencia estructurada', () => {
    const o1 = evalWith(fullWindow(W, { w1: 120, w2: 118.5 })) // 1.25 %
    expect(o1.recommendation).toMatchObject({ origin: 'rules', type: 'kcal', status: 'pending', rule_id: 'weight_loss_too_fast', proposed_change: { type: 'kcal', delta: 150 }, evaluation_period_start: W.start, evaluation_period_end: W.end })
    expect(o1.recommendation!.evidence![0]).toEqual({ rule_id: 'weight_loss_too_fast', metric: 'weight_loss_pct_week', observed: 1.25, threshold: 1, period_start: W.start, period_end: W.end })
    expect(o1.recommendation!.rationale).toContain('1.25 %')
    const o2 = evalWith(fullWindow(W, { w1: 120, w2: 118 })) // 1.67 %
    expect(o2.recommendation!.proposed_change).toEqual({ type: 'kcal', delta: 200 })
  })
  it('F: pérdida 0.5–1 %/sem → nada', () => {
    const o = evalWith(fullWindow(W, { w1: 120, w2: 119 })) // 0.83 %
    expect(o.decided_by).toBe('weight_loss_adequate')
    expect(o.recommendation).toBeNull()
  })
  it('D: hambre ≥4 en 5/7 últimos días con dato → +150 kcal; 4/7 no', () => {
    const spec = fullWindow(W, { w1: 120, w2: 119.9 }) // peso estable, pero sin cintura → E no
    for (const d of [8, 9, 10, 11, 12]) spec[addDays(W.start, d)]!.hunger = 4
    spec[addDays(W.start, 13)]!.hunger = 2
    const o = evalWith(spec)
    expect(o.results.D.fired).toBe(true)
    expect(o.recommendation).toMatchObject({ rule_id: 'hunger_sustained', proposed_change: { type: 'kcal', delta: 150 } })
    spec[addDays(W.start, 12)]!.hunger = 3
    expect(evalWith(spec).results.D.fired).toBe(false)
  })
  it('E: peso ±0.5 kg + cintura ±1 cm + adherencia ≥85 % → +2000 pasos si steps_avg < objetivo; −150 kcal si lo cumple; nunca ambos', () => {
    const spec = fullWindow(W, { w1: 120, w2: 119.8, extra: { steps_yesterday: 6000 } })
    const o = evalWith(spec, waist(104, 103.5))
    expect(o.results.E.fired).toBe(true)
    expect(o.recommendation).toMatchObject({ type: 'steps', proposed_change: { type: 'steps', delta: 2000 } })
    const spec2 = fullWindow(W, { w1: 120, w2: 119.8, extra: { steps_yesterday: 9500 } })
    expect(evalWith(spec2, waist(104, 103.5)).recommendation).toMatchObject({ type: 'kcal', proposed_change: { type: 'kcal', delta: -150 } })
    // cintura fuera de ±1 → no
    expect(evalWith(spec, waist(104, 102.5)).results.E.fired).toBe(false)
    // peso estable → alerta weight_flat
    expect(o.alerts.map(a => a.type)).toContain('weight_flat')
    // sin pasos registrados: una sola modificación (kcal), no las dos
    const o3 = evalWith(fullWindow(W, { w1: 120, w2: 119.8 }), waist(104, 103.5))
    expect(o3.recommendation!.proposed_change).toEqual({ type: 'kcal', delta: -150 })
  })
  it('E no se activa con adherencia 80–85 %', () => {
    const spec = fullWindow(W, { w1: 120, w2: 119.8 })
    for (const d of [0, 1]) spec[addDays(W.start, d)]!.food_yesterday = 'off' // 85.71 % → sí
    expect(ruleE(inputs(spec, waist(104, 104)), 9000).fired).toBe(true)
    spec[addDays(W.start, 2)]!.food_yesterday = 'off' // 78.6 % → A
    expect(ruleE(inputs(spec, waist(104, 104)), 9000).fired).toBe(false)
  })
})

describe('prioridad A > B > D > E > F — una sola Recommendation', () => {
  const hungry = (spec: Record<string, CI>) => { for (const d of [7, 8, 9, 10, 11]) spec[addDays(W.start, d)]!.hunger = 5; return spec }
  it('B sobre D', () => {
    const o = evalWith(hungry(fullWindow(W, { w1: 120, w2: 118.5 })))
    expect(o.results.B.fired && o.results.D.fired).toBe(true)
    expect(o.recommendation!.rule_id).toBe('weight_loss_too_fast')
  })
  it('D sobre E', () => {
    const o = evalWith(hungry(fullWindow(W, { w1: 120, w2: 119.8, extra: { steps_yesterday: 5000 } })), waist(104, 104))
    expect(o.results.D.fired && o.results.E.fired).toBe(true)
    expect(o.recommendation!.rule_id).toBe('hunger_sustained')
  })
  it('A sobre todas', () => {
    const spec = hungry(fullWindow(W, { w1: 120, w2: 118 }))
    for (const d of [0, 1, 2, 3]) spec[addDays(W.start, d)]!.food_yesterday = 'off'
    const o = evalWith(spec, waist(104, 104))
    expect(o.recommendation).toBeNull()
    expect(o.decided_by).toBe('adherence_low')
  })
  it('nunca load/deload: el tipo siempre es kcal o steps', () => {
    for (const o of [evalWith(fullWindow(W, { w1: 120, w2: 118 })), evalWith(hungry(fullWindow(W, { w1: 120, w2: 119 })))]) {
      expect(['kcal', 'steps']).toContain(o.recommendation!.type)
      expect(['load', 'deload']).not.toContain(o.recommendation!.type)
    }
  })
})

describe('alertas sueño / ánimo', () => {
  it('sleep_drop con <6 en ≥4 días de la ventana; 3 no', () => {
    const spec = fullWindow(W, { w1: 120, w2: 119 })
    for (const d of [1, 4, 7, 12]) spec[addDays(W.start, d)]!.sleep_bucket = '<6'
    expect(evalWith(spec).alerts.find(a => a.type === 'sleep_drop')).toMatchObject({ context: { under6_days: 4, action_taken: 'none' } })
    spec[addDays(W.start, 12)]!.sleep_bucket = '6-7'
    expect(evalWith(spec).alerts.some(a => a.type === 'sleep_drop')).toBe(false)
  })
  it('mood ≤2 en ≥4 de los últimos 7 días con dato; días fuera de los últimos 7 no cuentan', () => {
    const spec = fullWindow(W, { w1: 120, w2: 119 })
    for (const d of [7, 9, 11, 13]) spec[addDays(W.start, d)]!.mood = 2
    expect(evalWith(spec).alerts.some(a => a.type === 'mood')).toBe(true)
    spec[addDays(W.start, 13)]!.mood = 4
    spec[addDays(W.start, 2)]!.mood = 1 // fuera de los últimos 7
    const o = evalWith(spec)
    expect(o.alerts.some(a => a.type === 'mood')).toBe(false)
    expect(o.recommendation).toBeNull() // F; sueño/ánimo nunca proponen cambios
  })
})

describe('C: fuerza (solo alerta)', () => {
  const PREV = previousWindow(W)
  function lift(id: string, date: string, w: number, reps: number[], substituted = false) {
    const s = createCompletedSessionFixture({ date, ...(substituted ? { substitutions: [{ original_exercise_id: 'test_ex_other', substitute_exercise_id: id }] } : {}) })
    return { s, sets: createSetsFixture(s, id, reps.map(r => ({ w, reps: r }))) }
  }
  it('cae por carga menor o misma carga con menos reps; ≥2/4 activa; sets inválidos/warmups excluidos', () => {
    resetFixtureSequence()
    const a1 = lift('ex_squat', PREV.end, 100, [8, 8, 8]), a2 = lift('ex_squat', W.end, 95, [8, 8, 8])
    const b1 = lift('ex_bench', PREV.end, 60, [8, 8, 8]), b2 = lift('ex_bench', W.end, 60, [8, 7, 7])
    const c1 = lift('ex_deadlift', PREV.end, 120, [6, 6, 6]), c2 = lift('ex_deadlift', W.end, 122.5, [6, 6, 6])
    // warmup pesado y set con reps 0 en la actual no cuentan
    c2.sets.push(...createSetsFixture(c2.s, 'ex_deadlift', [{ w: 200, reps: 1, warmup: true }, { w: 200, reps: 0 }]).map((x, i) => ({ ...x, id: `${x.id}_x${i}` })))
    const sessions = [a1, a2, b1, b2, c1, c2].map(x => x.s), sets = [a1, a2, b1, b2, c1, c2].flatMap(x => x.sets)
    const st = strengthInput(sessions, sets, W)
    expect(st.lifts.map(l => (l.comparable ? l.falls : l.reason))).toEqual([true, true, false, 'no_current'])
    expect(st).toMatchObject({ comparable: 3, falling: 2 })
    const i = { ...inputs(fullWindow(W, { w1: 120, w2: 119 })), strength: st }
    expect(ruleC(i).fired).toBe(true)
    const o = evaluateAdjustment(i, SETTINGS, TODAY)
    expect(o.alerts.find(a => a.type === 'strength_drop')).toMatchObject({ context: { falling: 2, lifts: ['ex_squat', 'ex_bench'], action_taken: 'none' } })
    expect(o.recommendation).toBeNull() // C nunca recomienda; F decide
    expect(o.results.C.proposed_change).toBeUndefined()
  })
  it('fuerza estable → no; no comparable (sin sesión previa) → no_data; sustitución no cuenta como key lift', () => {
    resetFixtureSequence()
    const a1 = lift('ex_squat', PREV.end, 100, [8, 8, 8]), a2 = lift('ex_squat', W.end, 100, [8, 8, 8])
    const b2 = lift('ex_bench', W.end, 60, [8, 8, 8]) // sin previa
    const c1 = lift('ex_deadlift', PREV.end, 120, [6, 6, 6]), c2 = lift('ex_deadlift', W.end, 100, [6, 6, 6], true) // sustituida: no comparable
    const st = strengthInput([a1, a2, b2, c1, c2].map(x => x.s), [a1, a2, b2, c1, c2].flatMap(x => x.sets), W)
    expect(st.lifts[0]).toMatchObject({ comparable: true, falls: false })
    expect(st.lifts[1]).toMatchObject({ comparable: false, reason: 'no_previous' })
    expect(st.lifts[2]).toMatchObject({ comparable: false, reason: 'no_current' })
    expect(st.falling).toBe(0)
    expect(ruleC({ ...inputs({}), strength: st }).fired).toBe(false)
    expect(ruleC({ ...inputs({}), strength: strengthInput([], [], W) })).toMatchObject({ fired: false, no_data: true })
  })
})

describe('decisión pura', () => {
  const settings: Settings = {
    ...base, id: 'test_settings', kcal_target: 2400, protein_target_g: 180, protein_floor_g: 160, fat_g_range: [60, 80], carb_g_range: [200, 260],
    steps_target: 9000, schedule: { wake: '06:00', work_start: '09:00', work_end: '18:00' } as never, gym_slot: 'evening',
    increments: { barbell: 2.5, dumbbell: 2, machine: 5 } as never, rest_s: { basic: 150, accessory: 90 }, theme: 'system', units: 'metric',
    effective_from: FROM, change_origin: 'seed',
  }
  const rec = { ...base, id: 'test_rec', ...evalWith(fullWindow(W, { w1: 120, w2: 118 })).recommendation! }
  it('aceptar: decision + accepted + Settings nueva con origen/decision/effective_from; fila anterior intacta', () => {
    const r = acceptRecommendationPure({ recommendation: rec, current: settings, ids: { decision: 'test_dec', settings: 'test_set2' }, now: TEST_T0, today: TODAY })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.settings).toMatchObject({ id: 'test_set2', kcal_target: 2600, steps_target: 9000, effective_from: TODAY, change_origin: 'recommendation', recommendation_decision_id: 'test_dec' })
    expect(r.decision).toMatchObject({ recommendation_id: 'test_rec', decision: 'accepted', applied_settings_id: 'test_set2' })
    expect(r.recommendation.status).toBe('accepted')
    expect(settings.kcal_target).toBe(2400)
    // segundo intento sobre la ya aceptada → already_decided
    expect(acceptRecommendationPure({ recommendation: r.recommendation, current: settings, ids: { decision: 'x', settings: 'y' }, now: TEST_T0, today: TODAY })).toEqual({ ok: false, reason: 'already_decided' })
    expect(ignoreRecommendationPure({ recommendation: r.recommendation, ids: { decision: 'x' }, now: TEST_T0 })).toEqual({ ok: false, reason: 'already_decided' })
  })
  it('ignorar: decision + ignored, settings null; segundo intento bloqueado', () => {
    const r = ignoreRecommendationPure({ recommendation: rec, ids: { decision: 'test_dec' }, now: TEST_T0 })
    expect(r).toMatchObject({ ok: true, settings: null, decision: { decision: 'ignored' }, recommendation: { status: 'ignored' } })
    if (!r.ok) return
    expect(acceptRecommendationPure({ recommendation: r.recommendation, current: settings, ids: { decision: 'x', settings: 'y' }, now: TEST_T0, today: TODAY })).toEqual({ ok: false, reason: 'already_decided' })
  })
  it('sin proposed_change (p. ej. tipo load/deload) → unsupported_change, nada cambia', () => {
    const r = acceptRecommendationPure({ recommendation: { ...rec, type: 'deload', proposed_change: undefined }, current: settings, ids: { decision: 'a', settings: 'b' }, now: TEST_T0, today: TODAY })
    expect(r).toEqual({ ok: false, reason: 'unsupported_change' })
  })
})
