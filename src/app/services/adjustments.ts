/**
 * Ajustes — Fase 8.9. Orquesta: lee repos → domain/adjustments → persiste Recommendation/Alerts (evaluación) o
 * Decision + Settings (aceptar) en UNA transacción. Sin reglas de negocio aquí.
 *
 * Invariantes:
 *  - La evaluación NUNCA escribe Settings.
 *  - Como máximo una Recommendation por (rule_id, evaluation_period_end); nunca una nueva si existe una pending.
 *  - Alerts idempotentes por (type, period_end). `stall` no se toca.
 *  - Aceptar/ignorar solo sobre pending; segundo intento → already_decided sin modificar nada.
 */
import { ulid } from 'ulid'
import type { Alert, DayString, Recommendation, RecommendationDecision, Settings } from '@domain/entities'
import { AppError } from '@domain/errors'
import { validateEntity } from '@domain/validation/entities'
import {
  alertKey, buildInputs, evaluateAdjustment, evaluationWindow, recommendationKey, acceptRecommendationPure, ignoreRecommendationPure,
  type AdjustmentInputs, type EvaluationOutcome, type EvaluationWindow, type WindowResult,
} from '@domain/adjustments'
import type { Repos, Storage } from '@repo/index'

export type { AdjustmentInputs, EvaluationOutcome, EvaluationWindow }

export interface EvaluationReport {
  today: DayString
  settings: Settings
  window: WindowResult
  inputs: AdjustmentInputs | null
  outcome: EvaluationOutcome | null
  /** Por qué no se creó Recommendation (null = se creó ahora). */
  skipped: 'window_incomplete' | 'no_change' | 'pending_exists' | 'duplicate' | null
  recommendation_id: string | null
  alerts_created: number
}

function latest(rows: Settings[]): Settings | null {
  return rows.filter(s => !s.deleted_at).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] ?? null
}

async function requireSettings(repos: Repos): Promise<Settings> {
  const s = latest(await repos.settings.getLive())
  if (!s) throw new AppError('not_found', 'No hay Settings.')
  return s
}

/** Evalúa la última ventana cerrada. Idempotente: repetir no cambia el estado persistido. */
export async function evaluateAdjustmentWindow(storage: Storage, today: DayString, now: string): Promise<EvaluationReport> {
  return storage.run(['settings', 'daily_check_ins', 'body_measurements', 'workout_sessions', 'exercise_sets', 'recommendations', 'alerts'], async repos => {
    const settings = await requireSettings(repos)
    const window = evaluationWindow(settings.effective_from, today)
    const base = { today, settings, window, inputs: null, outcome: null, recommendation_id: null, alerts_created: 0 }
    if (window.kind === 'window_incomplete') return { ...base, skipped: 'window_incomplete' }

    const [checkIns, measurements, sessions, sets, recs, alerts] = await Promise.all([
      repos.daily_check_ins.getLive(), repos.body_measurements.getLive(), repos.workout_sessions.getLive(), repos.exercise_sets.getLive(),
      repos.recommendations.getLive(), repos.alerts.getLive(),
    ])
    const inputs = buildInputs({ window: window.window, checkIns, measurements, sessions, sets })
    const outcome = evaluateAdjustment(inputs, settings, today)

    // Alertas: solo reporte; una por (type, period_end).
    const existingAlertKeys = new Set(alerts.map(alertKey).filter((k): k is string => k !== null))
    let alerts_created = 0
    for (const d of outcome.alerts) {
      const key = alertKey(d)
      if (key && existingAlertKeys.has(key)) continue
      const alert: Alert = { id: ulid(), created_at: now, updated_at: now, source: 'system', ...d }
      const v = validateEntity('alerts', alert)
      if (!v.ok) throw new AppError('validation', 'Alerta inválida.')
      await repos.alerts.put(alert)
      alerts_created++
    }

    if (!outcome.recommendation) return { ...base, inputs, outcome, alerts_created, skipped: 'no_change' }
    const key = recommendationKey(outcome.recommendation)
    const dup = recs.find(r => recommendationKey(r) === key)
    if (dup) return { ...base, inputs, outcome, alerts_created, skipped: 'duplicate', recommendation_id: dup.id }
    const pending = recs.find(r => r.status === 'pending')
    if (pending) return { ...base, inputs, outcome, alerts_created, skipped: 'pending_exists', recommendation_id: pending.id }

    const rec: Recommendation = { id: ulid(), created_at: now, updated_at: now, source: 'system', ...outcome.recommendation }
    const v = validateEntity('recommendations', rec)
    if (!v.ok) throw new AppError('validation', 'Recomendación inválida.')
    await repos.recommendations.put(rec)
    return { ...base, inputs, outcome, alerts_created, skipped: null, recommendation_id: rec.id }
  })
}

export async function loadPendingRecommendation(storage: Storage): Promise<Recommendation | null> {
  const rows = await storage.repos.recommendations.whereEquals('status', 'pending')
  return rows.filter(r => !r.deleted_at).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null
}

export async function listDecisions(storage: Storage): Promise<Array<{ decision: RecommendationDecision; recommendation: Recommendation | null }>> {
  const [ds, recs] = await Promise.all([storage.repos.recommendation_decisions.getLive(), storage.repos.recommendations.getLive()])
  return ds.sort((a, b) => (a.decided_at < b.decided_at ? 1 : -1)).map(decision => ({ decision, recommendation: recs.find(r => r.id === decision.recommendation_id) ?? null }))
}

export type DecideResult =
  | { ok: true; decision: RecommendationDecision; settings: Settings | null }
  | { ok: false; reason: 'already_decided' | 'unsupported_change' }

/** Transacción atómica: Decision + Recommendation→accepted + Settings nueva. Nada se persiste si algo falla. */
export async function acceptRecommendation(storage: Storage, recommendationId: string, today: DayString, now: string): Promise<DecideResult> {
  return storage.run(['recommendations', 'recommendation_decisions', 'settings'], async repos => {
    const rec = await repos.recommendations.get(recommendationId)
    if (!rec) throw new AppError('not_found', 'La recomendación no existe.')
    const current = await requireSettings(repos)
    const r = acceptRecommendationPure({ recommendation: rec, current, ids: { decision: ulid(), settings: ulid() }, now, today })
    if (!r.ok) return r
    for (const [c, e] of [['recommendation_decisions', r.decision], ['recommendations', r.recommendation], ['settings', r.settings!]] as const) {
      const v = validateEntity(c, e)
      if (!v.ok) throw new AppError('validation', `Entidad inválida: ${c}.`)
    }
    await repos.recommendation_decisions.put(r.decision)
    await repos.recommendations.put(r.recommendation)
    await repos.settings.put(r.settings!)
    return { ok: true, decision: r.decision, settings: r.settings }
  })
}

/** Decision + Recommendation→ignored. Settings intacto. */
export async function ignoreRecommendation(storage: Storage, recommendationId: string, now: string): Promise<DecideResult> {
  return storage.run(['recommendations', 'recommendation_decisions'], async repos => {
    const rec = await repos.recommendations.get(recommendationId)
    if (!rec) throw new AppError('not_found', 'La recomendación no existe.')
    const r = ignoreRecommendationPure({ recommendation: rec, ids: { decision: ulid() }, now })
    if (!r.ok) return r
    await repos.recommendation_decisions.put(r.decision)
    await repos.recommendations.put(r.recommendation)
    return { ok: true, decision: r.decision, settings: null }
  })
}
