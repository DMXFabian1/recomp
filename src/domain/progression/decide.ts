/**
 * decideProgression — Fase 8.4. Doble progresión con bloqueos, −10 % y detección de estancamiento.
 * Pura: mismos inputs → misma decisión. No lee la hora. No modifica el historial.
 *
 * Reglas:
 *  SUBIR     : la sesión relevante más reciente alcanzó reps_max en todas las series con RIR ≥ target y sin bloqueo
 *              → current + increment_kg.
 *  −10 %     : SESSIONS_UNDER_FLOOR_FOR_DELOAD (2) sesiones relevantes consecutivas bajo reps_min, a la MISMA carga y
 *              con los MISMOS objetivos → current × 0.9, redondeado al incremento (ver rounding.ts).
 *  MANTENER  : en cualquier otro caso. Un bloqueo NUNCA se convierte en descarga ni en subida.
 *  STALL     : SESSIONS_WITHOUT_PROGRESS_FOR_STALL (3) sesiones relevantes consecutivas sin progreso → solo flag.
 *
 * "Relevante" = completada, con series de trabajo válidas y SIN bloqueo. Las bloqueadas y no evaluables son
 * transparentes: no cuentan ni rompen rachas. Una sesión relevante con otros objetivos o distinta carga es
 * 'incomparable': rompe la racha de bajo piso (no son comparables) y no suma a ninguna.
 * Progreso = alcanzó el máximo, o subió de carga respecto a la relevante anterior.
 */
import type { ProgressionDecision, ProgressionInput, SessionEvaluation } from './types'
import { DELOAD_FACTOR, SESSIONS_UNDER_FLOOR_FOR_DELOAD, SESSIONS_WITHOUT_PROGRESS_FOR_STALL } from './types'
import { evaluateSession } from './evaluate'
import { roundDeload, roundToIncrement } from './rounding'

function sameTargets(a: SessionEvaluation, b: SessionEvaluation): boolean {
  return a.targets.reps_min === b.targets.reps_min && a.targets.reps_max === b.targets.reps_max && a.targets.target_rir === b.targets.target_rir
}

export function decideProgression(input: ProgressionInput): ProgressionDecision {
  const { exercise, history, increment_kg } = input
  const evaluations = history.map(h => evaluateSession(exercise, h))
  const relevant = evaluations.filter(e => e.outcome !== 'not_evaluable' && e.outcome !== 'blocked')

  // Marcar progreso/incomparabilidad con contexto (comparando cada relevante con la relevante ANTERIOR en el tiempo).
  for (let i = 0; i < relevant.length; i++) {
    const cur = relevant[i]!
    const older = relevant[i + 1]
    const loadUp = older !== undefined && cur.load_kg !== null && older.load_kg !== null && cur.load_kg > older.load_kg && sameTargets(cur, older)
    cur.outcome = cur.reached_max || loadUp ? 'progressed' : 'no_progress'
  }

  const latestAny = evaluations.find(e => e.outcome !== 'not_evaluable')
  const latest = relevant[0]
  const base: ProgressionDecision = {
    exercise_id: exercise.id, action: 'hold', suggested_weight_kg: null, current_weight_kg: null,
    blocked_by: [], progression_blocked: false, sessions_under_floor: 0, sessions_without_progress: 0, stalled: false,
    evaluations, rationale: '',
  }

  if (!latestAny) {
    return { ...base, blocked_by: ['no_history'], progression_blocked: true, rationale: 'Sin historial evaluable: usa la carga de la plantilla o la que decidas.' }
  }

  // Rachas sobre relevantes (desde la más reciente). Solo cuentan sesiones comparables con la más reciente
  // (misma carga y mismos objetivos); la primera incomparable cierra ambas rachas y se etiqueta como tal.
  let underFloor = 0
  let noProgress = 0
  let floorChainOpen = true
  let progressChainOpen = true
  for (let i = 0; i < relevant.length; i++) {
    const cur = relevant[i]!
    const comparable = latest !== undefined && cur.load_kg === latest.load_kg && sameTargets(cur, latest)
    if (!comparable) {
      floorChainOpen = false
      progressChainOpen = false
      if (cur.outcome === 'no_progress') cur.outcome = 'incomparable'
      continue
    }
    if (floorChainOpen && cur.performance_below_floor) underFloor++
    else floorChainOpen = false
    if (progressChainOpen && cur.outcome === 'no_progress') noProgress++
    else progressChainOpen = false
  }
  const stalled = noProgress >= SESSIONS_WITHOUT_PROGRESS_FOR_STALL

  // La sesión más reciente (evaluable) está bloqueada → mantener, aunque haya racha previa.
  if (latestAny.outcome === 'blocked') {
    const current = latestAny.load_kg ?? latest?.load_kg ?? null
    return {
      ...base, action: 'hold', suggested_weight_kg: current, current_weight_kg: current,
      blocked_by: latestAny.blocked_by, progression_blocked: true,
      sessions_under_floor: underFloor, sessions_without_progress: noProgress, stalled,
      rationale: `Última sesión bloqueada (${latestAny.blocked_by.join(', ')}): se mantiene la carga; no cuenta como progreso ni como bajo rendimiento.`,
    }
  }
  if (!latest || latest.load_kg === null) {
    return { ...base, blocked_by: ['no_history'], progression_blocked: true, rationale: 'Sin sesión relevante.' }
  }

  const current = latest.load_kg
  if (underFloor >= SESSIONS_UNDER_FLOOR_FOR_DELOAD) {
    const next = roundDeload(current * DELOAD_FACTOR, increment_kg, current)
    return {
      ...base, action: 'decrease_10pct', suggested_weight_kg: next, current_weight_kg: current,
      sessions_under_floor: underFloor, sessions_without_progress: noProgress, stalled,
      rationale: `${underFloor} sesiones seguidas bajo ${latest.targets.reps_min} reps a ${current} kg: −10 % → ${next} kg.`,
    }
  }
  if (latest.reached_max) {
    const next = roundToIncrement(current + increment_kg, increment_kg)
    return {
      ...base, action: 'increase', suggested_weight_kg: next, current_weight_kg: current,
      sessions_under_floor: 0, sessions_without_progress: 0, stalled: false,
      rationale: `Todas las series a ${latest.targets.reps_max} reps con RIR ≥ ${latest.targets.target_rir}: +${increment_kg} kg → ${next} kg.`,
    }
  }
  return {
    ...base, action: 'hold', suggested_weight_kg: current, current_weight_kg: current,
    sessions_under_floor: underFloor, sessions_without_progress: noProgress, stalled,
    rationale: stalled
      ? `${noProgress} sesiones relevantes sin progreso a ${current} kg: estancamiento. Solo se reporta; nada cambia.`
      : `Aún no se alcanza ${latest.targets.reps_max} reps en todas las series: se mantiene ${current} kg.`,
  }
}
