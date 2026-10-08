/**
 * Texto para Claude — Fase 8.10. Puro y determinista: misma estructura → mismo texto, byte a byte.
 * Formato estable `CLAVE: valor` por secciones, con un bloque de instrucciones al inicio.
 * `no_data` = no hay registros suficientes (nunca 0). Sin URLs, sin imágenes, sin ids internos.
 */
import type { CoachReport, ReportLift } from './types'

export const COACH_INSTRUCTIONS = [
  'Actúa como coach analítico de recomposición corporal.',
  'Analiza exclusivamente los datos de este reporte. No inventes datos faltantes: no_data significa que no hay registros suficientes, nunca cero.',
  'Distingue entre datos OBSERVADOS (registros), ESTIMADOS (proteína calculada por receta; es cota inferior si hay comidas sin dato) y RECOMENDADOS (Recommendation de las reglas de la app).',
  'No asumas que una Recommendation fue aceptada si su STATUS no es accepted. Las alertas son solo reportes: action_taken=none significa que la app no cambió nada.',
  'No sugieras cambios de medicación.',
  'Evalúa: 1) adherencia; 2) evolución corporal; 3) entrenamiento; 4) recuperación; 5) nutrición; 6) cardio; 7) señales de riesgo; 8) recomendaciones previas y su efecto.',
  'Sé crítico y específico. Sin motivación vacía. Si los datos no permiten una conclusión, dilo explícitamente.',
  'No sustituyas las reglas de la app: tus recomendaciones son orientación externa y no modifican la app.',
]

const v = (x: number | string | null | undefined, unit = '') => (x === null || x === undefined ? 'no_data' : `${x}${unit}`)
const range = (r: [number, number] | null, unit = '') => (r ? `${r[0]}–${r[1]}${unit}` : 'no_data')
const signed = (n: number | null, unit = '') => (n === null ? 'no_data' : `${n > 0 ? '+' : ''}${n}${unit}`)
const reps = (r: number[]) => r.join('/')

function liftLine(l: ReportLift): string[] {
  const out = [`- ${l.name} [${l.id}]`]
  if (l.sessions.length === 0) out.push('  periodo: sin sesiones')
  for (const s of l.sessions) out.push(`  ${s.date}: ${s.load_kg} kg × ${reps(s.reps)}${s.substituted ? ' (sesión con sustitución)' : ''}`)
  const c = l.comparison
  out.push(c.comparable
    ? `  comparación vs ventana anterior: ${c.previous.date} ${c.previous.load_kg} kg × ${reps(c.previous.reps)} → ${c.current.date} ${c.current.load_kg} kg × ${reps(c.current.reps)}; menor: ${c.lower ? 'sí' : 'no'}`
    : `  comparación vs ventana anterior: no comparable (${c.reason === 'no_current' ? 'sin sesión válida en el periodo' : 'sin sesión válida en la ventana anterior'})`)
  return out
}

export function renderCoachReportText(r: CoachReport): string {
  const L: string[] = []
  const p = r.period
  L.push('RECOMP COACH REPORT', `VERSION: ${r.version}`, `APP_VERSION: ${r.app_version}`)
  L.push(`PERIOD_STATUS: ${p.status}`, `PERIOD_START: ${p.start}`, `PERIOD_END: ${v(p.end)}`, `PERIOD_DAYS: ${p.days}`, `WINDOW_END: ${p.window_end}`)
  L.push(`GENERATED_AT: ${r.generated_at.slice(0, 10)}`, '')
  L.push('INSTRUCTIONS', ...COACH_INSTRUCTIONS.map(x => `- ${x}`), '')

  const b = r.body
  L.push('BODY (observado)')
  L.push(`latest_weight: ${b.latest_weight ? `${b.latest_weight.kg} kg (${b.latest_weight.date})` : 'no_data'}`)
  L.push(`avg7_kg: ${v(b.avg7_kg)} (${b.avg7_points} registros)`, `avg7_prev_kg: ${v(b.avg7_prev_kg)} (${b.avg7_prev_points} registros)`)
  L.push(`avg7_change_kg: ${signed(b.avg7_change_kg)}`, `loss_pct_week: ${v(b.loss_pct_week)} (positivo = pérdida)`, `trend_kg_week: ${signed(b.trend_kg_week)}`)
  L.push(`weight_records_in_period: ${b.weight_points_in_period}`)
  L.push(`waist_latest: ${b.waist_latest ? `${b.waist_latest.cm} cm (${b.waist_latest.date})` : 'no_data'}`)
  L.push(`waist_week1_cm: ${v(b.waist_week1_cm)}`, `waist_week2_cm: ${v(b.waist_week2_cm)}`, `waist_change_cm: ${signed(b.waist_change_cm)}`)
  if (b.bia.length === 0) L.push('bia: no_data')
  for (const x of b.bia) L.push(`bia ${x.date}: peso ${v(x.bia_weight_kg, ' kg')}, grasa ${v(x.bia_fat_pct, ' %')}, músculo ${v(x.bia_muscle_kg, ' kg')}, masa libre de grasa ${v(x.bia_ffm_kg, ' kg')}, visceral ${v(x.bia_visceral)}`)
  L.push('')

  const t = r.training
  L.push('TRAINING (observado)')
  L.push(`sessions: completed ${t.counts.completed}, abandoned ${t.counts.abandoned}, cancelled ${t.counts.cancelled}, open ${t.counts.open}; short ${t.counts.short}, minimal ${t.counts.minimal}`)
  for (const s of t.sessions) L.push(`- ${s.date} ${s.template} · ${s.status} · ${s.version}${s.substitutions.length ? ` · sustituciones: ${s.substitutions.map(x => `${x.original} → ${x.substitute}`).join('; ')}` : ''}`)
  L.push(`rotation: ${t.rotation ? `${t.rotation.names.join(' → ')}; siguiente: ${v(t.rotation.next)}` : 'no_data'}`)
  L.push('key_lifts (solo el ejercicio exacto; las sustituciones no se fusionan):')
  for (const l of t.key_lifts) L.push(...liftLine(l))
  L.push(`stalls: ${t.stalls.length === 0 ? 'ninguno' : ''}`)
  for (const s of t.stalls) L.push(`- ${s.date}: ${s.message}`)
  L.push('')

  const c = r.cardio
  L.push('CARDIO (observado)')
  L.push(`sessions: ${c.sessions.length}`, `total_minutes: ${c.total_minutes}`, `total_distance_m: ${v(c.total_distance_m)}`)
  for (const s of c.sessions) L.push(`- ${s.date} ${s.modality}${s.preset ? ` ${s.preset}` : ''}: ${s.minutes} min, ${v(s.distance_m, ' m')}, split ${v(s.split_s_per_500m, ' s/500m')}, RPE ${s.rpe}`)
  L.push(`monthly_test: ${c.monthly_test ? `${c.monthly_test.date} ${c.monthly_test.distance_m} m, split ${c.monthly_test.split_avg_s} s/500m; vs anterior: distancia ${signed(c.monthly_test.distance_delta_m, ' m')}, split ${signed(c.monthly_test.split_delta_s, ' s')}` : 'no_data'}`)
  L.push('')

  const n = r.nutrition
  L.push('NUTRITION')
  L.push(`targets (Settings vigentes): kcal ${n.kcal_target}, protein ${n.protein_target_g} g, protein_floor ${n.protein_floor_g} g`)
  L.push(`adherence (check-in food_yesterday, autoreportado): ${n.adherence.pct === null ? 'no_data' : `${n.adherence.pct} %`} (${n.adherence.answered}/14 respondidos; plan ${n.adherence.plan}, almost ${n.adherence.almost}, off ${n.adherence.off})`)
  L.push(`meal_logs: ${n.meal_logs} (planned ${n.by_status.planned}, substituted ${n.by_status.substituted}, adapted ${n.by_status.adapted}, off_plan ${n.by_status.off_plan}, emergency ${n.by_status.emergency}, skipped ${n.by_status.skipped})`)
  L.push(`protein (ESTIMADO por receta): días con dato ${n.protein_days_with_data}, promedio ${v(n.protein_avg_g, ' g')}, días ≥ piso ${n.protein_days_at_floor}`)
  for (const d of n.days) L.push(`- ${d.date}: comidas ${d.logs}, proteína ${d.protein_g === null ? 'no_data' : `${d.protein_g} g${d.lower_bound ? ' (cota inferior)' : ''}`}`)
  L.push(`off_plan_protein_unknown: ${n.off_plan_protein_unknown}`, `kcal_estimated_meals: ${n.kcal_logged_meals}`)
  L.push(`foods_without_macros: ${n.foods_without_macros.length ? n.foods_without_macros.join(', ') : 'ninguno'}`)
  L.push('')

  const h = r.habits
  L.push('HABITS (check-in diario; cada dimensión por separado)')
  L.push(`checkin_days: ${h.checkin_days}/${p.days}`)
  L.push(`sleep_buckets: <6 ${h.sleep['<6']}, 6-7 ${h.sleep['6-7']}, 7-8 ${h.sleep['7-8']}, 8+ ${h.sleep['8+']}, sin dato ${h.sleep.unknown}`)
  L.push(`steps_avg: ${v(h.steps_avg)} (${h.steps_days} días)`, `energy_avg: ${v(h.energy_avg)}`, `hunger_avg: ${v(h.hunger_avg)}`, `mood_avg: ${v(h.mood_avg)} (escala 1–5)`)
  L.push(`hunger_ge4_last7: ${h.hunger_ge4_last7}`, `mood_le2_last7: ${h.mood_le2_last7}`)
  L.push('days (fecha | peso | food_yesterday | sueño | pasos | energía | hambre | ánimo):')
  for (const d of h.days) L.push(`- ${d.date} | ${v(d.weight_kg)} | ${v(d.food_yesterday)} | ${v(d.sleep)} | ${v(d.steps)} | ${v(d.energy)} | ${v(d.hunger)} | ${v(d.mood)}`)
  L.push('')

  const g = r.goals
  L.push('GOALS')
  L.push(`baseline: ${g.baseline ? `peso ${v(g.baseline.weight_avg_kg, ' kg')}, cintura ${v(g.baseline.waist_cm, ' cm')}, grasa BIA ${v(g.baseline.bia_fat_pct, ' %')}, cerrado ${g.baseline.closed ? 'sí' : 'no'}` : 'no_data'}`)
  if (g.months.length === 0) L.push('months: no_data')
  for (const m of g.months) {
    L.push(`- ${m.month}: peso meta ${range(m.weight_goal_kg, ' kg')} (${range(m.weight_goal_pct, ' %')}), real ${v(m.weight_real_kg, ' kg')}; cintura meta ${range(m.waist_goal_cm, ' cm')} (Δ ${range(m.waist_delta_goal_cm, ' cm')}), real ${v(m.waist_real_cm, ' cm')}; fuerza ${m.strength_sessions_real}/${m.strength_sessions_goal}; cardio ${m.cardio_sessions_real}/${m.cardio_sessions_goal}; pasos objetivo ${m.steps_target}`)
    if (m.focus) L.push(`  foco: ${m.focus}`)
  }
  L.push('')

  L.push('ALERTS (solo reporte; ninguna cambió nada)')
  if (r.alerts.items.length === 0) L.push('ninguna')
  for (const a of r.alerts.items) L.push(`- ${a.date} ${a.type}: ${a.message} [action_taken=${a.action_taken}${a.period_end ? `, period_end=${a.period_end}` : ''}${a.acknowledged ? ', vista' : ''}]`)
  L.push('')

  const ad = r.adjustments
  L.push('ADJUSTMENTS')
  L.push(`settings_current: desde ${ad.current.effective_from} (${ad.current.change_origin}); kcal ${ad.current.kcal_target}, pasos ${ad.current.steps_target}, proteína ${ad.current.protein_target_g} g (piso ${ad.current.protein_floor_g} g)`)
  L.push('settings_history:')
  for (const s of ad.history) L.push(`- desde ${s.effective_from} (${s.change_origin}): kcal ${s.kcal_target}, pasos ${s.steps_target}`)
  L.push(`recommendations: ${ad.recommendations.length === 0 ? 'ninguna' : ''}`)
  for (const x of ad.recommendations) {
    const ch = x.proposed_change ? `${x.proposed_change.type} ${x.proposed_change.delta > 0 ? '+' : ''}${x.proposed_change.delta}` : x.type
    L.push(`- RECOMMENDATION ${x.date} · origin ${x.origin} · rule ${v(x.rule_id)} · ventana ${v(x.period_start)} → ${v(x.period_end)}`)
    L.push(`  proposed_change: ${ch}`, `  STATUS: ${x.status}`)
    L.push(`  DECISION: ${x.decision ? `${x.decision.decision} (${x.decision.decided_at.slice(0, 10)})${x.decision.applied_effective_from ? `; effective_from ${x.decision.applied_effective_from}` : ''}` : 'sin decisión'}`)
    for (const e of x.evidence) L.push(`  evidence: ${e.metric} = ${v(e.observed)}${e.threshold !== null ? ` (umbral ${e.threshold})` : ''}`)
    L.push(`  rationale: ${x.rationale}`)
  }
  L.push('')

  L.push('MISSING_DATA')
  if (r.missing.items.length === 0) L.push('ninguno')
  for (const m of r.missing.items) L.push(`- ${m}`)
  L.push('', 'END REPORT')
  return L.join('\n')
}
