/**
 * Evaluación de una ventana — Fase 8.9. Puro. Aplica la prioridad congelada A > B > D > E > F y devuelve como máximo
 * UN borrador de Recommendation (pending, origin 'rules') más los borradores de Alert que correspondan.
 * C (fuerza) no entra en la cadena: solo produce Alert. Nunca toca Settings ni escribe nada.
 */
import type { Alert, DayString, Recommendation, Settings } from '@domain/entities'
import { buildAdjustmentAlerts, type AlertDraft } from './alerts'
import type { AdjustmentInputs } from './inputs'
import { ruleA, ruleB, ruleC, ruleD, ruleE, ruleF, type RuleResult } from './rules'

export type RecommendationDraft = Omit<Recommendation, 'id' | 'created_at' | 'updated_at' | 'source'>

export interface EvaluationOutcome {
  results: { A: RuleResult; B: RuleResult; C: RuleResult; D: RuleResult; E: RuleResult; F: RuleResult }
  /** Regla que decidió el resultado de la cadena de ajustes (A bloquea; F mantiene; null = ninguna aplicable). */
  decided_by: RuleResult['rule_id'] | null
  recommendation: RecommendationDraft | null
  alerts: AlertDraft[]
}

const fmt = (n: number | null, unit = '') => (n === null ? 'sin datos' : `${n}${unit}`)

function rationaleFor(rule: RuleResult, i: AdjustmentInputs): string {
  const w = `${i.window.start} → ${i.window.end}`
  switch (rule.rule_id) {
    case 'weight_loss_too_fast':
      return `Pérdida de ${fmt(i.weight.loss_pct_week, ' %')}/semana (promedio 7 d ${fmt(i.weight.week1_avg, ' kg')} → ${fmt(i.weight.week2_avg, ' kg')}) en ${w}; umbral 1 %/semana. Adherencia ${fmt(i.adherence.pct, ' %')}.`
    case 'hunger_sustained':
      return `Hambre ≥4 en ${i.recent.hunger_high_days} de los últimos 7 días con dato (${i.window.end}); umbral 5. Pérdida ${fmt(i.weight.loss_pct_week, ' %')}/semana.`
    case 'weight_waist_stable':
      return `Peso ${fmt(i.weight.delta_kg, ' kg')} y cintura ${fmt(i.waist.delta_cm, ' cm')} de cambio en ${w} con adherencia ${fmt(i.adherence.pct, ' %')}; pasos promedio ${fmt(i.steps.avg)}.`
    default:
      return w
  }
}

export function evaluateAdjustment(i: AdjustmentInputs, settings: Pick<Settings, 'steps_target'>, today: DayString): EvaluationOutcome {
  const results = { A: ruleA(i), B: ruleB(i), C: ruleC(i), D: ruleD(i), E: ruleE(i, settings.steps_target), F: ruleF(i) }
  let decided_by: EvaluationOutcome['decided_by'] = null
  let winner: RuleResult | null = null
  if (results.A.fired) decided_by = 'adherence_low'
  else if (results.B.fired) { decided_by = 'weight_loss_too_fast'; winner = results.B }
  else if (results.D.fired) { decided_by = 'hunger_sustained'; winner = results.D }
  else if (results.E.fired) { decided_by = 'weight_waist_stable'; winner = results.E }
  else if (results.F.fired) decided_by = 'weight_loss_adequate'

  let recommendation: RecommendationDraft | null = null
  if (winner?.proposed_change) {
    const change = winner.proposed_change
    recommendation = {
      date: today, origin: 'rules', type: change.type, status: 'pending',
      payload: { rule_id: winner.rule_id, proposed_change: change, period_start: i.window.start, period_end: i.window.end },
      rationale: rationaleFor(winner, i),
      rule_id: winner.rule_id, evaluation_period_start: i.window.start, evaluation_period_end: i.window.end,
      evidence: winner.evidence, proposed_change: change,
    }
  }
  return { results, decided_by, recommendation, alerts: buildAdjustmentAlerts(i, results) }
}

/** Clave lógica de idempotencia de una Recommendation de reglas. */
export function recommendationKey(r: Pick<Recommendation, 'rule_id' | 'evaluation_period_end'>): string | null {
  return r.rule_id && r.evaluation_period_end ? `${r.rule_id}|${r.evaluation_period_end}` : null
}

/** Clave lógica de idempotencia de una Alert de reglas (tipo + fin de ventana). */
export function alertKey(a: Pick<Alert, 'type' | 'context'>): string | null {
  const end = a.context.period_end
  return typeof end === 'string' ? `${a.type}|${end}` : null
}
