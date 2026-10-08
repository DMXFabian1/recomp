/**
 * buildCoachReport — Fase 8.10. Función PURA y determinista: recibe un snapshot de datos y devuelve la estructura del
 * reporte. No escribe, no hace red, no importa React ni Dexie. No crea ni decide Recommendations.
 *
 * Autoridades reutilizadas (no se duplican cálculos):
 *  - Ventana: domain/adjustments/window (evaluationWindow, WINDOW_DAYS).
 *  - Peso/cintura/adherencia/fuerza comparada/hambre-ánimo 7 d: domain/adjustments/inputs (buildInputs), que a su vez usa 8.8.
 *  - Series, promedios, tendencia, key lifts, cardio, hábitos, metas: domain/metrics (8.8).
 * Periodo: la última ventana cerrada (closed). Si aún no hay ninguna cerrada con los Settings vigentes, la ventana en curso
 * hasta AYER (partial). Si los Settings cambiaron hoy, no hay días cerrados (empty). Hoy nunca entra.
 */
import type {
  Alert, Baseline, BodyMeasurement, CardioSession, DailyCheckIn, DayString, Exercise, ExerciseSet, Food, IsoDateTime, MealLog,
  MealLogStatus, MonthlyGoal, MonthlyTest, Program, Recipe, Recommendation, RecommendationDecision, Settings, WorkoutSession, WorkoutTemplate,
} from '@domain/entities'
import { addDays, diffDays } from '@domain/time/day'
import { buildInputs, evaluationWindow, WINDOW_DAYS, type AdjustmentInputs } from '@domain/adjustments'
import {
  average7, biaRecords, goalVsReal, habitSummary, inWindow, KEY_LIFT_IDS, keyLiftHistories, monthlyTestComparison, trendPerWeek,
  waistSeries, weightSeries,
} from '@domain/metrics'
import {
  COACH_REPORT_VERSION, type CoachReport, type CoachReportPeriod, type ReportAlert, type ReportLift, type ReportRecommendation, type ReportSession,
} from './types'

export interface CoachReportInput {
  today: DayString
  generated_at: IsoDateTime
  app_version: string
  settings: Settings[]
  program: Program | null
  templates: WorkoutTemplate[]
  exercises: Pick<Exercise, 'id' | 'name'>[]
  checkIns: DailyCheckIn[]
  measurements: BodyMeasurement[]
  sessions: WorkoutSession[]
  sets: ExerciseSet[]
  cardio: CardioSession[]
  tests: MonthlyTest[]
  mealLogs: MealLog[]
  recipes: Recipe[]
  foods: Food[]
  goals: MonthlyGoal[]
  baselines: Baseline[]
  recommendations: Recommendation[]
  decisions: RecommendationDecision[]
  alerts: Alert[]
}

const live = <T extends { deleted_at?: string }>(xs: T[]) => xs.filter(x => !x.deleted_at)
const byStr = <T>(f: (x: T) => string) => (a: T, b: T) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0)
const dayOf = (iso: string) => iso.slice(0, 10)
const round1 = (n: number) => Math.round(n * 10) / 10

/** Settings vigentes: mayor effective_from (convención existente); empate → el creado más tarde. */
export function currentSettings(rows: Settings[]): Settings | null {
  return [...live(rows)].sort((a, b) => (a.effective_from !== b.effective_from ? (a.effective_from < b.effective_from ? 1 : -1) : a.created_at < b.created_at ? 1 : -1))[0] ?? null
}

export function reportPeriod(settings: Settings, today: DayString): CoachReportPeriod {
  const w = evaluationWindow(settings.effective_from, today)
  if (w.kind === 'ready') return { status: 'closed', start: w.window.start, end: w.window.end, days: WINDOW_DAYS, window_end: w.window.end, settings_effective_from: settings.effective_from }
  const start = addDays(w.next_end, -(WINDOW_DAYS - 1))
  const end = addDays(today, -1)
  if (end < start) return { status: 'empty', start, end: null, days: 0, window_end: w.next_end, settings_effective_from: settings.effective_from }
  return { status: 'partial', start, end, days: diffDays(start, end) + 1, window_end: w.next_end, settings_effective_from: settings.effective_from }
}

export function buildCoachReport(input: CoachReportInput): CoachReport {
  const settings = currentSettings(input.settings)
  if (!settings) throw new Error('buildCoachReport: no hay Settings')
  const period = reportPeriod(settings, input.today)
  const { start } = period
  const end = period.end
  const inPeriod = (d: string) => end !== null && d >= start && d <= end
  const missing: string[] = []
  const exName = new Map(input.exercises.map(e => [e.id, e.name]))
  const tplName = new Map(input.templates.map(t => [t.id, t.name]))
  const name = (id: string) => exName.get(id) ?? id

  const checkIns = live(input.checkIns)
  const inputs: AdjustmentInputs | null = end === null ? null
    : buildInputs({ window: { start, end, index: 0 }, checkIns, measurements: input.measurements, sessions: input.sessions, sets: input.sets })
  if (period.status === 'empty') missing.push('Periodo sin días cerrados: los Settings cambiaron hoy; el reporte solo describe ajustes y alertas.')
  if (period.status === 'partial') missing.push(`Ventana de 14 días aún abierta: solo ${period.days} días cerrados (cierra ${period.window_end}).`)

  // ── Cuerpo ──
  const series = weightSeries(checkIns)
  const avgEnd = end ? average7(series, end) : null
  const avgPrev = end ? average7(series, addDays(end, -7)) : null
  const periodSeries = end ? inWindow(series, end, period.days) : []
  const latest = end ? series.filter(p => p.date <= end).at(-1) ?? null : null
  const waist = waistSeries(input.measurements)
  const waistLatest = end ? waist.filter(p => p.date <= end).at(-1) ?? null : null
  const bias = biaRecords(input.measurements)
  const biaInPeriod = bias.filter(b => inPeriod(b.date))
  const biaShown = biaInPeriod.length > 0 ? biaInPeriod : end ? bias.filter(b => b.date <= end).slice(-1) : []
  const body = {
    latest_weight: latest ? { date: latest.date, kg: latest.kg } : null,
    avg7_kg: avgEnd?.kg ?? null, avg7_points: avgEnd?.points ?? 0,
    avg7_prev_kg: avgPrev?.kg ?? null, avg7_prev_points: avgPrev?.points ?? 0,
    avg7_change_kg: inputs?.weight.delta_kg ?? null,
    loss_pct_week: inputs?.weight.loss_pct_week ?? null,
    trend_kg_week: trendPerWeek(periodSeries),
    weight_points_in_period: periodSeries.length,
    waist_latest: waistLatest ? { date: waistLatest.date, cm: waistLatest.cm } : null,
    waist_week1_cm: inputs?.waist.week1_cm ?? null, waist_week2_cm: inputs?.waist.week2_cm ?? null, waist_change_cm: inputs?.waist.delta_cm ?? null,
    bia: biaShown,
  }
  if (end && body.avg7_kg === null) missing.push(`Peso: menos de 4 registros en los 7 días que terminan ${end}; sin promedio.`)
  if (end && body.avg7_prev_kg === null) missing.push('Peso: sin promedio de 7 días de la semana anterior; no se puede calcular cambio ni %/semana.')
  if (end && body.trend_kg_week === null) missing.push('Peso: datos insuficientes para tendencia (≥4 registros y ≥7 días de separación).')
  if (end && body.waist_change_cm === null) missing.push('Cintura: falta una medición en alguna de las dos semanas; sin cambio.')
  if (biaShown.length === 0) missing.push('BIA: sin registros.')

  // ── Entrenamiento ──
  const allSessions = input.sessions.filter(s => inPeriod(s.date)).sort(byStr(s => `${s.date}|${s.started_at}`))
  const sessions: ReportSession[] = allSessions.map(s => ({
    date: s.date, template: tplName.get(s.template_id) ?? s.template_id,
    status: s.deleted_at ? 'cancelled' : s.status,
    version: s.version,
    substitutions: (s.substitutions ?? []).map(x => ({ original: name(x.original_exercise_id), substitute: name(x.substitute_exercise_id) })),
  }))
  const counts = {
    completed: sessions.filter(s => s.status === 'completed').length,
    abandoned: sessions.filter(s => s.status === 'abandoned').length,
    cancelled: sessions.filter(s => s.status === 'cancelled').length,
    open: sessions.filter(s => s.status === 'open').length,
    short: sessions.filter(s => s.status === 'completed' && s.version === 'short').length,
    minimal: sessions.filter(s => s.status === 'completed' && s.version === 'minimal').length,
  }
  const histories = keyLiftHistories(input.sessions, input.sets)
  const key_lifts: ReportLift[] = KEY_LIFT_IDS.map(id => {
    const cmp = inputs?.strength.lifts.find(l => l.exercise_id === id)
    const pick = (p: { date: DayString; load_kg: number; reps: number[] }) => ({ date: p.date, load_kg: p.load_kg, reps: p.reps })
    return {
      id, name: name(id),
      sessions: histories[id].filter(p => inPeriod(p.date)).map(p => ({ date: p.date, load_kg: p.load_kg, reps: p.reps, substituted: p.substituted })),
      comparison: !cmp ? { comparable: false, reason: 'no_current' }
        : cmp.comparable ? { comparable: true, previous: pick(cmp.previous), current: pick(cmp.current), lower: cmp.falls }
        : { comparable: false, reason: cmp.reason },
    }
  })
  const alertsLive = live(input.alerts)
  const stalls = alertsLive.filter(a => a.type === 'stall' && inPeriod(dayOf(a.created_at))).sort(byStr(a => a.created_at)).map(a => ({ date: dayOf(a.created_at), message: a.message }))
  const program = input.program
  const training = {
    sessions, counts, key_lifts, stalls,
    rotation: program ? { names: program.rotation.map(t => tplName.get(t) ?? t), cursor: program.rotation_cursor, next: tplName.get(program.rotation[program.rotation_cursor] ?? '') ?? null } : null,
  }
  if (end && counts.completed === 0) missing.push('Entrenamiento: sin sesiones completadas en el periodo.')
  missing.push('Entrenamiento: los avisos de sesión fuera de orden no se guardan; no hay historial de out-of-order.')

  // ── Cardio ──
  const cardioIn = live(input.cardio).filter(c => inPeriod(c.date)).sort(byStr(c => `${c.date}|${c.created_at}`))
  const withDistance = cardioIn.filter(c => typeof c.distance_m === 'number')
  const testsUpTo = end ? live(input.tests).filter(t => t.date <= end) : []
  const cmpTests = monthlyTestComparison(testsUpTo)
  const lastTest = cmpTests.find(c => c.test.date === [...testsUpTo].sort(byStr(t => t.date)).at(-1)?.date) ?? null
  const cardio = {
    sessions: cardioIn.map(c => ({ date: c.date, modality: c.modality, preset: c.preset ?? null, minutes: round1(c.duration_s / 60), distance_m: c.distance_m ?? null, split_s_per_500m: c.split_s_per_500m ?? null, rpe: c.rpe })),
    total_minutes: round1(cardioIn.reduce((a, c) => a + c.duration_s, 0) / 60),
    total_distance_m: withDistance.length > 0 ? withDistance.reduce((a, c) => a + c.distance_m!, 0) : null,
    monthly_test: lastTest ? { date: lastTest.test.date, distance_m: lastTest.test.distance_m, split_avg_s: lastTest.test.split_avg_s, distance_delta_m: lastTest.distance_delta_m, split_delta_s: lastTest.split_delta_s } : null,
  }
  if (end && cardioIn.length === 0) missing.push('Cardio: sin sesiones registradas en el periodo.')
  if (!cardio.monthly_test) missing.push('Prueba mensual de remo: sin registros.')
  missing.push('Cardio: el talk test no se registra en la app.')

  // ── Nutrición y hábitos ──
  const habits = end ? habitSummary({ checkIns, mealLogs: input.mealLogs, recipes: input.recipes, foods: input.foods, endDate: end, days: period.days, target_g: settings.protein_target_g, floor_g: settings.protein_floor_g }) : null
  const logsIn = live(input.mealLogs).filter(l => inPeriod(l.date))
  const by_status: Record<MealLogStatus, number> = { planned: 0, substituted: 0, adapted: 0, off_plan: 0, emergency: 0, skipped: 0 }
  for (const l of logsIn) by_status[l.status]++
  const foods_without_macros = live(input.foods).filter(f => f.nutrition_status === 'missing').map(f => f.name).sort()
  const nutrition = {
    kcal_target: settings.kcal_target, protein_target_g: settings.protein_target_g, protein_floor_g: settings.protein_floor_g,
    adherence: inputs ? { answered: inputs.adherence.answered, plan: inputs.adherence.plan, almost: inputs.adherence.almost, off: inputs.adherence.off, pct: inputs.adherence.pct } : { answered: 0, plan: 0, almost: 0, off: 0, pct: null },
    meal_logs: logsIn.length, by_status,
    off_plan_protein_unknown: logsIn.filter(l => (l.status === 'off_plan' || l.status === 'emergency') && (l.off_plan_protein_g === null || l.off_plan_protein_g === undefined)).length,
    days: (habits?.days ?? []).map(d => ({ date: d.date, logs: logsIn.filter(l => l.date === d.date).length, protein_g: d.protein_g, lower_bound: d.protein_lower_bound })),
    protein_days_with_data: habits?.protein_days ?? 0, protein_avg_g: habits?.protein_avg ?? null, protein_days_at_floor: habits?.protein_days_at_floor ?? 0,
    kcal_logged_meals: logsIn.filter(l => typeof l.kcal_est === 'number').length,
    foods_without_macros,
  }
  if (end && logsIn.length === 0) missing.push('Nutrición: sin comidas registradas en el periodo; proteína no disponible.')
  if (end && nutrition.adherence.pct === null) missing.push(`Adherencia: ${nutrition.adherence.answered} de 14 check-ins respondidos (mínimo 10); sin porcentaje.`)
  if (foods_without_macros.length > 0) missing.push(`Macros desconocidos (no se cuentan en proteína): ${foods_without_macros.join(', ')}.`)
  if (nutrition.off_plan_protein_unknown > 0) missing.push(`Comidas fuera de plan con proteína "no sé": ${nutrition.off_plan_protein_unknown}.`)
  missing.push('Calorías consumidas: no se calculan; solo existe el objetivo.')

  const ciByDate = new Map(checkIns.map(c => [c.date, c]))
  const habitsOut = {
    days: (habits?.days ?? []).map(d => ({ date: d.date, weight_kg: ciByDate.get(d.date)?.weight_kg ?? null, food_yesterday: d.food_yesterday, sleep: d.sleep, steps: d.steps, energy: d.energy, hunger: d.hunger, mood: d.mood })),
    sleep: habits?.sleep ?? { '<6': 0, '6-7': 0, '7-8': 0, '8+': 0, unknown: 0 },
    steps_avg: habits?.steps_avg ?? null, steps_days: habits?.steps_days ?? 0,
    energy_avg: habits?.energy_avg ?? null, hunger_avg: habits?.hunger_avg ?? null, mood_avg: habits?.mood_avg ?? null,
    hunger_ge4_last7: inputs?.recent.hunger_high_days ?? 0, mood_le2_last7: inputs?.recent.mood_low_days ?? 0,
    checkin_days: (habits?.days ?? []).filter(d => ciByDate.has(d.date)).length,
  }
  if (end && habitsOut.checkin_days === 0) missing.push('Check-in: ningún día registrado en el periodo.')

  // ── Metas ──
  const baseline = live(input.baselines)[0] ?? null
  const months = end ? [...new Set([start.slice(0, 7), end.slice(0, 7)])] : []
  const goals = {
    baseline: baseline ? { weight_avg_kg: baseline.weight_avg_kg ?? null, waist_cm: baseline.waist_cm ?? null, bia_fat_pct: baseline.bia_fat_pct ?? null, closed: baseline.closed } : null,
    months: live(input.goals).filter(g => months.includes(g.month)).sort(byStr(g => g.month)).map(goal => {
      const r = goalVsReal({ goal, baseline, weight: series, measurements: input.measurements, sessions: input.sessions, cardio: input.cardio, today: end! })
      return {
        month: r.month, weight_goal_pct: r.weight_goal_pct, weight_goal_kg: r.weight_goal_kg, weight_real_kg: r.weight_real_kg,
        waist_delta_goal_cm: r.waist_delta_goal_cm, waist_goal_cm: r.waist_goal_cm, waist_real_cm: r.waist_real_cm,
        strength_sessions_goal: goal.strength_sessions, strength_sessions_real: r.strength_sessions_real,
        cardio_sessions_goal: goal.cardio_sessions, cardio_sessions_real: r.cardio_sessions_real, steps_target: r.steps_target, focus: goal.focus_text,
      }
    }),
  }
  if (!baseline || baseline.weight_avg_kg === undefined) missing.push('Baseline: sin peso promedio; las metas de peso solo existen en %.')

  // ── Alertas (8.9 + stall) ──
  const alertRelevant = (a: Alert) => {
    const pe = typeof a.context.period_end === 'string' ? a.context.period_end : null
    if (pe) return pe >= start && pe <= input.today
    const d = dayOf(a.created_at)
    return d >= start && d <= input.today
  }
  const alerts: ReportAlert[] = alertsLive.filter(alertRelevant).sort(byStr(a => `${a.created_at}|${a.type}`)).map(a => ({
    type: a.type, date: dayOf(a.created_at), message: a.message,
    period_end: typeof a.context.period_end === 'string' ? a.context.period_end : null,
    action_taken: typeof a.context.action_taken === 'string' ? a.context.action_taken : 'none',
    acknowledged: !!a.acknowledged_at,
  }))

  // ── Ajustes: Settings + Recommendations + Decisions (solo lectura) ──
  const settingsRows = [...live(input.settings)].sort(byStr(s => `${s.effective_from}|${s.created_at}`))
  const decisions = live(input.decisions)
  const recRelevant = (r: Recommendation) => r.status === 'pending' || dayOf(r.created_at) >= start || (r.evaluation_period_end ?? '') >= start
  const recommendations: ReportRecommendation[] = live(input.recommendations).filter(recRelevant).sort(byStr(r => r.created_at)).map(r => {
    const d = decisions.filter(x => x.recommendation_id === r.id).sort(byStr(x => x.decided_at))[0]
    const applied = d?.applied_settings_id ? settingsRows.find(s => s.id === d.applied_settings_id) : undefined
    return {
      id: r.id, date: r.date, origin: r.origin, type: r.type, status: r.status, rule_id: r.rule_id ?? null,
      period_start: r.evaluation_period_start ?? null, period_end: r.evaluation_period_end ?? null,
      proposed_change: r.proposed_change ?? null, evidence: r.evidence ?? [], rationale: r.rationale,
      decision: d ? { decision: d.decision, decided_at: d.decided_at, applied_effective_from: applied?.effective_from ?? null } : null,
    }
  })
  const adjustments = {
    current: { effective_from: settings.effective_from, change_origin: settings.change_origin, kcal_target: settings.kcal_target, steps_target: settings.steps_target, protein_target_g: settings.protein_target_g, protein_floor_g: settings.protein_floor_g },
    history: settingsRows.map(s => ({ effective_from: s.effective_from, change_origin: s.change_origin, kcal_target: s.kcal_target, steps_target: s.steps_target })),
    recommendations,
  }

  return {
    version: COACH_REPORT_VERSION, app_version: input.app_version, generated_at: input.generated_at, today: input.today,
    period, body, training, cardio, nutrition, habits: habitsOut, goals, alerts: { items: alerts }, adjustments, missing: { items: missing },
  }
}
