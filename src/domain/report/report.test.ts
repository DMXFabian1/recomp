/** Fase 8.10 — buildCoachReport / renderCoachReportText puros. Fixtures sintéticos (2001, ids test_*). */
import { describe, expect, it } from 'vitest'
import type { Alert, DailyCheckIn, Food, Recommendation, RecommendationDecision, Settings } from '@domain/entities'
import { addDays } from '@domain/time/day'
import { average7, weightSeries } from '@domain/metrics'
import { buildInputs } from '@domain/adjustments'
import { createCompletedSessionFixture, createSetsFixture, resetFixtureSequence, TEST_T0 } from '@test/fixtures/training'
import { buildCoachReport, currentSettings, renderCoachReportText, reportPeriod, type CoachReportInput } from './index'

const base = { created_at: TEST_T0, updated_at: TEST_T0, source: 'user' as const }
const FROM = '2001-03-01'
const TODAY = '2001-03-15' // ventana 0 cerrada: 03-01 → 03-14
const SETTINGS: Settings = {
  ...base, id: 'test_settings', kcal_target: 2400, protein_target_g: 180, protein_floor_g: 160, fat_g_range: [60, 80], carb_g_range: [200, 260],
  steps_target: 9000, schedule: {} as never, gym_slot: 'evening', increments: {} as never, rest_s: { basic: 150, accessory: 90 }, theme: 'system', units: 'metric',
  effective_from: FROM, change_origin: 'seed',
}
const ISO_FOOD: Food = { ...base, id: 'test_food_iso', name: 'TEST proteína sin etiqueta', category: 'supplement', unit: '1 scoop', nutrition_status: 'missing' } as never

function input(over: Partial<CoachReportInput> = {}): CoachReportInput {
  return {
    today: TODAY, generated_at: '2001-03-15T13:00:00.000Z', app_version: '0.0.0-test',
    settings: [SETTINGS], program: null, templates: [], exercises: [], checkIns: [], measurements: [], sessions: [], sets: [], cardio: [], tests: [],
    mealLogs: [], recipes: [], foods: [ISO_FOOD], goals: [], baselines: [], recommendations: [], decisions: [], alerts: [], ...over,
  }
}
function checkIns(n: number, f: (d: number) => Partial<DailyCheckIn>): DailyCheckIn[] {
  return Array.from({ length: n }, (_, d) => ({ ...base, id: `test_ci_${d}`, date: addDays(FROM, d), irregular: false, ...f(d) }))
}

describe('periodo (misma ventana que 8.9)', () => {
  it('closed / partial / empty; hoy nunca entra', () => {
    expect(reportPeriod(SETTINGS, TODAY)).toMatchObject({ status: 'closed', start: FROM, end: '2001-03-14', days: 14 })
    expect(reportPeriod(SETTINGS, '2001-03-29')).toMatchObject({ status: 'closed', start: '2001-03-15', end: '2001-03-28' })
    expect(reportPeriod(SETTINGS, '2001-03-08')).toMatchObject({ status: 'partial', start: FROM, end: '2001-03-07', days: 7, window_end: '2001-03-14' })
    expect(reportPeriod(SETTINGS, FROM)).toMatchObject({ status: 'empty', end: null, days: 0 })
  })
  it('Settings vigentes: mayor effective_from', () => {
    const newer = { ...SETTINGS, id: 'test_s2', effective_from: '2001-03-10', change_origin: 'recommendation' as const, kcal_target: 2550 }
    expect(currentSettings([SETTINGS, newer])!.id).toBe('test_s2')
  })
})

describe('datos faltantes: no_data, nunca 0', () => {
  const r = buildCoachReport(input())
  const text = renderCoachReportText(r)
  it('estructura con null y listas vacías; faltantes explícitos', () => {
    expect(r.body.avg7_kg).toBeNull()
    expect(r.body.loss_pct_week).toBeNull()
    expect(r.body.latest_weight).toBeNull()
    expect(r.nutrition.protein_avg_g).toBeNull()
    expect(r.nutrition.adherence.pct).toBeNull()
    expect(r.cardio.sessions).toEqual([])
    expect(r.cardio.total_distance_m).toBeNull()
    expect(r.habits.steps_avg).toBeNull()
    expect(r.missing.items.join('\n')).toMatch(/Cardio: sin sesiones registradas/)
    expect(r.missing.items.join('\n')).toMatch(/proteína no disponible/)
    expect(r.missing.items.join('\n')).toMatch(/TEST proteína sin etiqueta/)
  })
  it('texto: no_data, sin "0 g" de proteína ni "0 %" de adherencia inventados', () => {
    expect(text).toContain('avg7_kg: no_data')
    expect(text).toContain('loss_pct_week: no_data')
    expect(text).toContain('promedio no_data')
    expect(text).toContain('adherence (check-in food_yesterday, autoreportado): no_data')
    expect(text).toContain('total_distance_m: no_data')
    expect(text).not.toMatch(/proteína 0 g|promedio 0 g|adherence[^\n]*: 0 %/)
    expect(text).toContain('foods_without_macros: TEST proteína sin etiqueta')
  })
})

describe('autoridades reutilizadas', () => {
  it('peso: average7 (8.8) y %/semana de buildInputs (8.9)', () => {
    const cis = checkIns(14, d => ({ weight_kg: d < 7 ? 120 : 118.5, food_yesterday: 'plan', hunger: 3 }))
    const r = buildCoachReport(input({ checkIns: cis }))
    const series = weightSeries(cis)
    expect(r.body.avg7_kg).toBe(average7(series, '2001-03-14').kg)
    expect(r.body.avg7_prev_kg).toBe(average7(series, '2001-03-07').kg)
    const inp = buildInputs({ window: { start: FROM, end: '2001-03-14', index: 0 }, checkIns: cis, measurements: [], sessions: [], sets: [] })
    expect(r.body.loss_pct_week).toBe(inp.weight.loss_pct_week)
    expect(r.body.avg7_change_kg).toBe(-1.5)
    expect(r.nutrition.adherence.pct).toBe(100)
    expect(r.habits.days).toHaveLength(14)
    expect(r.habits.days[0]).toMatchObject({ date: FROM, weight_kg: 120, food_yesterday: 'plan', hunger: 3, sleep: null })
    expect(r.body.trend_kg_week).not.toBeNull()
  })
  it('fuerza: 4 key lifts exactos; sustitución marcada, nunca fusionada; comparación con ventana anterior', () => {
    resetFixtureSequence()
    const prev = createCompletedSessionFixture({ date: '2001-02-26', template_id: 'test_tpl' })
    const cur = createCompletedSessionFixture({ date: '2001-03-05', template_id: 'test_tpl' })
    const sub = createCompletedSessionFixture({ date: '2001-03-12', template_id: 'test_tpl', substitutions: [{ original_exercise_id: 'ex_squat', substitute_exercise_id: 'test_goblet' }] })
    const sets = [
      ...createSetsFixture(prev, 'ex_squat', [{ w: 100, reps: 8 }, { w: 100, reps: 8 }]),
      ...createSetsFixture(cur, 'ex_squat', [{ w: 95, reps: 8 }, { w: 95, reps: 8 }, { w: 140, reps: 3, warmup: true }]),
      ...createSetsFixture(sub, 'test_goblet', [{ w: 40, reps: 12 }]),
    ]
    const r = buildCoachReport(input({
      sessions: [prev, cur, sub], sets, templates: [{ ...base, id: 'test_tpl', name: 'Pierna TEST', order_in_rotation: 0, exercises: [] }],
      exercises: [{ id: 'ex_squat', name: 'Sentadilla' }, { id: 'test_goblet', name: 'Goblet' }],
    }))
    expect(r.training.key_lifts.map(l => l.id)).toEqual(['ex_squat', 'ex_bench', 'ex_deadlift', 'ex_chest_supported_row'])
    const sq = r.training.key_lifts[0]!
    expect(sq.sessions).toEqual([{ date: '2001-03-05', load_kg: 95, reps: [8, 8], substituted: false }]) // sin warmup, sin goblet
    expect(sq.comparison).toEqual({ comparable: true, previous: { date: '2001-02-26', load_kg: 100, reps: [8, 8] }, current: { date: '2001-03-05', load_kg: 95, reps: [8, 8] }, lower: true })
    expect(r.training.key_lifts[1]!.comparison).toEqual({ comparable: false, reason: 'no_current' })
    expect(r.training.counts.completed).toBe(2) // la previa queda fuera del periodo
    expect(r.training.sessions.find(s => s.date === '2001-03-12')!.substitutions).toEqual([{ original: 'Sentadilla', substitute: 'Goblet' }])
    const text = renderCoachReportText(r)
    expect(text).toContain('sustituciones: Sentadilla → Goblet')
    expect(text).not.toMatch(/Sentadilla[^\n]*40 kg/)
  })
})

describe('alertas y ajustes (solo lectura)', () => {
  const rec = (id: string, status: Recommendation['status']): Recommendation => ({
    ...base, id, created_at: '2001-03-15T09:00:00.000Z', date: TODAY, origin: 'rules', type: 'kcal', payload: {}, rationale: `TEST ${id}`, status,
    rule_id: 'weight_loss_too_fast', evaluation_period_start: FROM, evaluation_period_end: '2001-03-14', proposed_change: { type: 'kcal', delta: 150 },
    evidence: [{ rule_id: 'weight_loss_too_fast', metric: 'weight_loss_pct_week', observed: 1.25, threshold: 1, period_start: FROM, period_end: '2001-03-14' }],
  })
  it('sin alertas → "ninguna"; con alertas → listadas con action_taken', () => {
    expect(renderCoachReportText(buildCoachReport(input()))).toContain('ALERTS (solo reporte; ninguna cambió nada)\nninguna')
    const alert: Alert = { ...base, id: 'test_al', created_at: '2001-03-15T09:00:00.000Z', type: 'sleep_drop', message: 'Sueño <6 h en 4 días', context: { period_end: '2001-03-14', action_taken: 'none' } }
    const r = buildCoachReport(input({ alerts: [alert] }))
    expect(r.alerts.items).toEqual([{ type: 'sleep_drop', date: TODAY, message: 'Sueño <6 h en 4 días', period_end: '2001-03-14', action_taken: 'none', acknowledged: false }])
    expect(renderCoachReportText(r)).toContain('sleep_drop: Sueño <6 h en 4 días [action_taken=none, period_end=2001-03-14]')
  })
  it('pending / accepted / ignored con su Decision; nunca crea nada nuevo', () => {
    const newSettings: Settings = { ...SETTINGS, id: 'test_s2', effective_from: TODAY, change_origin: 'recommendation', kcal_target: 2550, recommendation_decision_id: 'test_dec_a' }
    const decisions: RecommendationDecision[] = [
      { ...base, id: 'test_dec_a', recommendation_id: 'test_rec_a', decided_at: '2001-03-15T10:00:00.000Z', decision: 'accepted', applied_settings_id: 'test_s2' },
      { ...base, id: 'test_dec_i', recommendation_id: 'test_rec_i', decided_at: '2001-03-15T10:00:00.000Z', decision: 'ignored' },
    ]
    const recs = [rec('test_rec_p', 'pending'), rec('test_rec_a', 'accepted'), rec('test_rec_i', 'ignored')]
    const inp = input({ settings: [SETTINGS, newSettings], recommendations: recs, decisions, today: '2001-03-16' })
    const r = buildCoachReport(inp)
    expect(r.adjustments.recommendations.map(x => [x.id, x.status, x.decision?.decision ?? null, x.decision?.applied_effective_from ?? null])).toEqual([
      ['test_rec_p', 'pending', null, null], ['test_rec_a', 'accepted', 'accepted', TODAY], ['test_rec_i', 'ignored', 'ignored', null],
    ])
    expect(r.adjustments.current).toMatchObject({ effective_from: TODAY, change_origin: 'recommendation', kcal_target: 2550 })
    expect(r.adjustments.history.map(h => h.kcal_target)).toEqual([2400, 2550])
    expect(inp.recommendations).toHaveLength(3) // entrada intacta
    expect(recs.map(x => x.status)).toEqual(['pending', 'accepted', 'ignored'])
    const text = renderCoachReportText(r)
    expect(text).toContain('STATUS: pending\n  DECISION: sin decisión')
    expect(text).toContain(`STATUS: accepted\n  DECISION: accepted (2001-03-15); effective_from ${TODAY}`)
    expect(text).toContain('STATUS: ignored\n  DECISION: ignored (2001-03-15)')
    expect(text).toContain('evidence: weight_loss_pct_week = 1.25 (umbral 1)')
  })
})

describe('texto determinista y limpio', () => {
  it('mismo snapshot → mismo texto; instrucciones; sin URLs ni binarios; empieza y termina fijo', () => {
    const inp = input({ checkIns: checkIns(14, d => ({ weight_kg: 120 - d * 0.1, food_yesterday: d % 3 ? 'plan' : 'almost', sleep_bucket: '7-8', steps_yesterday: 8000 })) })
    const a = renderCoachReportText(buildCoachReport(inp)), b = renderCoachReportText(buildCoachReport(inp))
    expect(a).toBe(b)
    expect(a.startsWith('RECOMP COACH REPORT\nVERSION: 1\n')).toBe(true)
    expect(a.endsWith('END REPORT')).toBe(true)
    for (const s of ['PERIOD_START: 2001-03-01', 'PERIOD_END: 2001-03-14', 'GENERATED_AT: 2001-03-15', 'INSTRUCTIONS', 'No sugieras cambios de medicación', 'BODY', 'TRAINING', 'CARDIO', 'NUTRITION', 'HABITS', 'GOALS', 'ALERTS', 'ADJUSTMENTS', 'MISSING_DATA']) expect(a).toContain(s)
    expect(a).not.toMatch(/https?:|data:|blob:|base64|<[a-z]+[ >]/i)
    expect(a).not.toMatch(/test_ci_|test_settings/) // sin ids internos
  })
})
