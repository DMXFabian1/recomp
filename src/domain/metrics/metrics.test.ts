import { describe, expect, it } from 'vitest'
import type { BodyMeasurement, CardioSession, DailyCheckIn, MonthlyGoal, MonthlyTest } from '@domain/entities'
import { average7, latestWeight, previousAverage7, trendPerWeek, weightSeries, MIN_POINTS_FOR_AVG } from './weight'
import { biaRecords, latestWaist, waistSeries } from './body'
import { KEY_LIFT_IDS, keyLiftHistories, liftHistory, sessionTonnage, tonnageHistory, workingSets } from './strength'
import { formatSplit, monthlyTestComparison, weekStart, weeklyCardio } from './cardio'
import { habitSummary } from './habits'
import { goalVsReal } from './goals'
import { createCompletedSessionFixture, createSessionFixture, createSetsFixture, resetFixtureSequence } from '@test/fixtures/training'

const T0 = '2001-01-01T00:00:00.000Z'
const base = { created_at: T0, updated_at: T0, source: 'user' as const }
const ci = (date: string, over: Partial<DailyCheckIn> = {}): DailyCheckIn => ({ ...base, id: `ci_${date}`, date, irregular: false, ...over })

describe('peso', () => {
  const pts = (days: Array<[string, number]>) => weightSeries(days.map(([d, w]) => ci(d, { weight_kg: w })))
  it('serie ordenada, solo registros con peso; último registro ≠ promedio', () => {
    const s = pts([['2026-10-03', 120.2], ['2026-10-01', 121], ['2026-10-02', 120.6]])
    expect(s.map(p => p.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(weightSeries([ci('2026-10-04')])).toEqual([]) // sin peso no cuenta
    expect(latestWeight(s)?.kg).toBe(120.2)
  })
  it('promedio 7 días: media de registros reales de la ventana; ≥4 registros; sin interpolar', () => {
    const s = pts([['2026-10-01', 121], ['2026-10-02', 120.6], ['2026-10-04', 120.2], ['2026-10-07', 119.8]])
    const a = average7(s, '2026-10-07')
    expect(a.points).toBe(4)
    expect(a.kg).toBe(120.4) // (121+120.6+120.2+119.8)/4 — los días sin registro no se rellenan
    expect(a.window_start).toBe('2026-10-01')
    expect(average7(s, '2026-10-06').kg).toBeNull() // 3 puntos → sin datos suficientes
    expect(average7(s, '2026-10-06').points).toBe(3)
    expect(MIN_POINTS_FOR_AVG).toBe(4)
  })
  it('un solo registro: se muestra el registro, el promedio no existe', () => {
    const s = pts([['2026-10-07', 119.4]])
    expect(latestWeight(s)?.kg).toBe(119.4)
    expect(average7(s, '2026-10-07').kg).toBeNull()
    expect(trendPerWeek(s)).toBeNull()
  })
  it('promedio anterior y tendencia (pendiente kg/semana) como aritmética', () => {
    const days = Array.from({ length: 14 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, 121 - i * 0.1] as [string, number])
    const s = pts(days)
    expect(average7(s, '2026-10-14').kg).toBe(120.0)
    expect(previousAverage7(s, '2026-10-14').kg).toBe(120.7)
    expect(trendPerWeek(s)).toBe(-0.7)
    expect(trendPerWeek(pts(days.slice(0, 4)))).toBeNull() // < 7 días de separación
    expect(trendPerWeek(pts([['2026-10-01', 120], ['2026-10-01', 120], ['2026-10-01', 120], ['2026-10-01', 120]]))).toBeNull()
  })
  it('sin datos: todo null, nada inventado', () => {
    expect(average7([], '2026-10-07')).toEqual({ kg: null, points: 0, window_start: '2026-10-01', window_end: '2026-10-07' })
    expect(latestWeight([])).toBeNull()
  })
})

describe('cuerpo', () => {
  const m = (date: string, over: Partial<BodyMeasurement>): BodyMeasurement => ({ ...base, id: `m_${date}_${over.type}`, date, type: 'waist', ...over })
  it('cintura: histórico ordenado y último registro; BIA aparte; sin datos → null', () => {
    const ms = [m('2026-10-07', { type: 'waist', waist_cm: 103 }), m('2026-10-01', { type: 'waist', waist_cm: 105 }), m('2026-10-03', { type: 'bia', bia_fat_pct: 36.5, bia_weight_kg: 120.4 })]
    expect(waistSeries(ms).map(w => w.cm)).toEqual([105, 103])
    expect(latestWaist(ms)).toEqual({ date: '2026-10-07', cm: 103 })
    expect(biaRecords(ms)).toHaveLength(1)
    expect(biaRecords(ms)[0]!.bia_fat_pct).toBe(36.5)
    expect(latestWaist([])).toBeNull()
    expect(biaRecords([])).toEqual([])
    const deleted = { ...ms[0]!, deleted_at: T0 }
    expect(latestWaist([deleted, ms[1]!])?.cm).toBe(105)
  })
})

describe('fuerza', () => {
  it('solo completed; excluye open, abandoned, cancelada (deleted), calentamientos, reps 0 e inválidas; tonelaje = Σ peso × reps', () => {
    resetFixtureSequence()
    const done = createCompletedSessionFixture({ date: '2026-10-06' })
    const open = createSessionFixture({ date: '2026-10-07' })
    const abandoned = createCompletedSessionFixture({ date: '2026-10-08', status: 'abandoned' })
    const cancelled = createCompletedSessionFixture({ date: '2026-10-09', deleted_at: T0 })
    const sets = [
      ...createSetsFixture(done, 'ex_squat', [{ w: 40, reps: 8, warmup: true }, { w: 60, reps: 8 }, { w: 60, reps: 8 }, { w: 60, reps: 0 }, { w: -1, reps: 8 }]),
      ...createSetsFixture(open, 'ex_squat', [{ w: 100, reps: 10 }]),
      ...createSetsFixture(abandoned, 'ex_squat', [{ w: 100, reps: 10 }]),
      ...createSetsFixture(cancelled, 'ex_squat', [{ w: 100, reps: 10 }]),
    ]
    expect(workingSets(sets.filter(s => s.session_id === done.id))).toHaveLength(2)
    expect(sessionTonnage(sets.filter(s => s.session_id === done.id))).toBe(960)
    const hist = tonnageHistory([done, open, abandoned, cancelled], sets)
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ session_id: done.id, tonnage_kg: 960, work_sets: 2 })
    const squat = liftHistory('ex_squat', [done, open, abandoned, cancelled], sets)
    expect(squat).toEqual([{ date: '2026-10-06', session_id: done.id, load_kg: 60, reps: [8, 8], substituted: false }])
  })
  it('key lifts exactos y sustituciones no mezcladas', () => {
    resetFixtureSequence()
    expect([...KEY_LIFT_IDS]).toEqual(['ex_squat', 'ex_bench', 'ex_deadlift', 'ex_chest_supported_row'])
    const s1 = createCompletedSessionFixture({ date: '2026-10-06', substitutions: [{ original_exercise_id: 'ex_squat', substitute_exercise_id: 'ex_leg_press' }] })
    const s2 = createCompletedSessionFixture({ date: '2026-10-13' })
    const sets = [...createSetsFixture(s1, 'ex_leg_press', [{ w: 150, reps: 10 }]), ...createSetsFixture(s2, 'ex_squat', [{ w: 62.5, reps: 8 }])]
    const k = keyLiftHistories([s1, s2], sets)
    expect(k.ex_squat).toHaveLength(1) // la prensa no cuenta como sentadilla
    expect(k.ex_squat[0]!.load_kg).toBe(62.5)
    expect(k.ex_bench).toEqual([])
    expect(liftHistory('ex_leg_press', [s1, s2], sets)[0]).toMatchObject({ load_kg: 150, substituted: true })
    expect(Object.keys(k)).toHaveLength(4)
  })
})

describe('cardio', () => {
  const c = (date: string, over: Partial<CardioSession> = {}): CardioSession => ({ ...base, id: `c_${date}_${over.modality ?? 'row'}`, date, modality: 'row', duration_s: 1200, rpe: 4, ...over })
  it('semanas lunes–domingo con sesiones, minutos, distancia (null si nadie la registró) y RPE medio', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-05') // miércoles → lunes
    expect(weekStart('2026-10-04')).toBe('2026-09-28') // domingo → lunes anterior
    const w = weeklyCardio([c('2026-10-05', { distance_m: 4000 }), c('2026-10-07', { duration_s: 1800, rpe: 6 }), c('2026-09-30', { modality: 'walk', distance_m: 3000, rpe: 3 })], '2026-10-07', 2)
    expect(w[0]).toEqual({ week_start: '2026-10-05', week_end: '2026-10-11', sessions: 2, minutes: 50, distance_m: 4000, rpe_avg: 5 })
    expect(w[1]).toEqual({ week_start: '2026-09-28', week_end: '2026-10-04', sessions: 1, minutes: 20, distance_m: 3000, rpe_avg: 3 })
    expect(weeklyCardio([c('2026-10-05')], '2026-10-07', 1)[0]!.distance_m).toBeNull()
    expect(weeklyCardio([], '2026-10-07', 1)[0]).toMatchObject({ sessions: 0, minutes: 0, distance_m: null, rpe_avg: null })
  })
  it('prueba mensual: comparación descriptiva con deltas; sin anterior → null', () => {
    const t = (month: string, distance_m: number, split: number): MonthlyTest => ({ ...base, id: `t_${month}`, date: `${month}-15`, month, duration_s: 600, distance_m, split_avg_s: split })
    const cmp = monthlyTestComparison([t('2026-10', 2300, 130.4), t('2026-09', 2200, 136.3)])
    expect(cmp[0]!.test.month).toBe('2026-10')
    expect(cmp[0]!.distance_delta_m).toBe(100)
    expect(cmp[0]!.split_delta_s).toBe(-5.9)
    expect(cmp[1]!.distance_delta_m).toBeNull()
    expect(formatSplit(130.4)).toBe('2:10.4 /500 m')
    expect(monthlyTestComparison([])).toEqual([])
  })
})

describe('hábitos', () => {
  it('adherencia declarada por tramos, sueño por tramos (sin media inventada), pasos, 1–5 y proteína independientes', () => {
    const checkIns = [
      ci('2026-10-05', { food_yesterday: 'plan', sleep_bucket: '<6', steps_yesterday: 8000, energy: 3, hunger: 4, mood: 3 }),
      ci('2026-10-06', { food_yesterday: 'off', sleep_bucket: '7-8', steps_yesterday: 10000, energy: 4, hunger: 2, mood: 4 }),
      ci('2026-10-07', { food_yesterday: 'plan' }),
    ]
    const logs = [{ ...base, id: 'l1', date: '2026-10-06', slot: 'lunch' as const, status: 'off_plan' as const, est_complete: false, off_plan_protein_g: 170, logged_at: T0 }]
    const h = habitSummary({ checkIns, mealLogs: logs, recipes: [], foods: [], endDate: '2026-10-07', days: 7, target_g: 180, floor_g: 160 })
    expect(h.days).toHaveLength(7)
    expect(h.adherence).toEqual({ plan: 2, almost: 0, off: 1, unknown: 4 })
    expect(h.sleep).toEqual({ '<6': 1, '6-7': 0, '7-8': 1, '8+': 0, unknown: 5 })
    expect(h.steps_avg).toBe(9000)
    expect(h.steps_days).toBe(2)
    expect(h.energy_avg).toBe(3.5)
    expect(h.hunger_avg).toBe(3)
    expect(h.mood_avg).toBe(3.5)
    // 6 oct: adherencia declarada "off" y proteína 170 ≥ 160 → columnas separadas, sin mezclar
    const d6 = h.days.find(d => d.date === '2026-10-06')!
    expect(d6.food_yesterday).toBe('off')
    expect(d6.protein_g).toBe(170)
    expect(h.protein_days).toBe(1)
    expect(h.protein_days_at_floor).toBe(1)
    expect(h.days.find(d => d.date === '2026-10-05')!.protein_g).toBeNull() // sin registros → null, no 0
    const empty = habitSummary({ checkIns: [], mealLogs: [], recipes: [], foods: [], endDate: '2026-10-07', days: 7, target_g: 180, floor_g: 160 })
    expect(empty.steps_avg).toBeNull()
    expect(empty.protein_avg).toBeNull()
    expect(Object.keys(h)).not.toContain('score')
  })
})

describe('metas', () => {
  const goal: MonthlyGoal = { ...base, id: 'mg', month: '2026-10', weight_pct_range: [-4, -1.5], waist_delta_cm_range: [-4, -2], steps_target: 9000, strength_sessions: 4, cardio_sessions: 2, focus_text: '' }
  it('meta vs real como datos; sin baseline solo %; sin registros → null', () => {
    const r0 = goalVsReal({ goal, baseline: null, weight: [], measurements: [], sessions: [], cardio: [], today: '2026-10-07' })
    expect(r0.weight_goal_kg).toBeNull()
    expect(r0.weight_goal_pct).toEqual([-4, -1.5])
    expect(r0.weight_real_kg).toBeNull()
    expect(r0.waist_real_cm).toBeNull()
    expect(r0.strength_sessions_real).toBe(0)
    const baseline = { ...base, id: 'b', weight_avg_kg: 120, waist_cm: 105, weight_samples: [], closed: true, photos_complete: false }
    const weight = Array.from({ length: 5 }, (_, i) => ({ date: `2026-10-0${i + 3}`, kg: 119 }))
    const r = goalVsReal({ goal, baseline, weight, measurements: [{ ...base, id: 'w', date: '2026-10-06', type: 'waist', waist_cm: 103 }], sessions: [], cardio: [], today: '2026-10-07' })
    expect(r.weight_goal_kg).toEqual([115.2, 118.2])
    expect(r.weight_real_kg).toBe(119)
    expect(r.weight_real_points).toBe(5)
    expect(r.waist_goal_cm).toEqual([101, 103])
    expect(r.waist_real_cm).toBe(103)
    expect(r.goal).toBe(goal) // no se modifica
  })
})
