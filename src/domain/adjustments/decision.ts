/**
 * Decisión sobre una Recommendation — Fase 8.9. Puro: devuelve las entidades nuevas/actualizadas; el service persiste
 * en UNA transacción. Solo una Recommendation `pending` puede decidirse; cualquier otro estado → `already_decided`.
 *  - accept: RecommendationDecision + Recommendation→accepted + Settings NUEVA (fila aparte, effective_from = hoy,
 *    change_origin 'recommendation', recommendation_decision_id). Solo kcal/steps; otro tipo → `unsupported_change`.
 *  - ignore: RecommendationDecision + Recommendation→ignored. Settings intacto.
 */
import type { DayString, IsoDateTime, Recommendation, RecommendationDecision, Settings } from '@domain/entities'

export type DecisionResult =
  | { ok: true; decision: RecommendationDecision; recommendation: Recommendation; settings: Settings | null }
  | { ok: false; reason: 'already_decided' | 'unsupported_change' }

export function acceptRecommendationPure(input: {
  recommendation: Recommendation; current: Settings; ids: { decision: string; settings: string }; now: IsoDateTime; today: DayString
}): DecisionResult {
  const { recommendation: rec, current, ids, now, today } = input
  if (rec.status !== 'pending' || rec.deleted_at) return { ok: false, reason: 'already_decided' }
  const change = rec.proposed_change
  if (!change || (change.type !== 'kcal' && change.type !== 'steps')) return { ok: false, reason: 'unsupported_change' }
  const settings: Settings = {
    ...current,
    id: ids.settings, created_at: now, updated_at: now, source: 'system',
    kcal_target: change.type === 'kcal' ? current.kcal_target + change.delta : current.kcal_target,
    steps_target: change.type === 'steps' ? current.steps_target + change.delta : current.steps_target,
    effective_from: today, change_origin: 'recommendation', recommendation_decision_id: ids.decision,
  }
  delete settings.deleted_at
  const decision: RecommendationDecision = {
    id: ids.decision, created_at: now, updated_at: now, source: 'user',
    recommendation_id: rec.id, decided_at: now, decision: 'accepted', applied_settings_id: ids.settings,
  }
  return { ok: true, decision, recommendation: { ...rec, status: 'accepted', updated_at: now }, settings }
}

export function ignoreRecommendationPure(input: { recommendation: Recommendation; ids: { decision: string }; now: IsoDateTime }): DecisionResult {
  const { recommendation: rec, ids, now } = input
  if (rec.status !== 'pending' || rec.deleted_at) return { ok: false, reason: 'already_decided' }
  const decision: RecommendationDecision = {
    id: ids.decision, created_at: now, updated_at: now, source: 'user',
    recommendation_id: rec.id, decided_at: now, decision: 'ignored',
  }
  return { ok: true, decision, recommendation: { ...rec, status: 'ignored', updated_at: now }, settings: null }
}
