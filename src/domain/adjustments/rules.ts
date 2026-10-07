/**
 * Reglas de ajuste — Fase 8.9. Funciones puras. Cada regla recibe las entradas y devuelve si se activa,
 * con evidencia estructurada y (solo B, D, E) el cambio propuesto. Ninguna regla escribe nada.
 *
 *  A adherence_low        <80 % → bloquea ajustes; solo alerta/evidencia.
 *  B weight_loss_too_fast >1 %/sem → +150 kcal; >1.5 %/sem → +200 kcal.
 *  C strength_drop        ≥2 de 4 key lifts caen → SOLO alerta (nunca Recommendation; nunca carga/deload/volumen/template).
 *  D hunger_sustained     hunger ≥4 en ≥5 de los últimos 7 días con dato → +150 kcal.
 *  E weight_waist_stable  |Δpeso| ≤0.5 kg y |Δcintura| ≤1 cm y adherencia ≥85 % → +2000 pasos si steps_avg < steps_target, si no −150 kcal. Nunca ambos.
 *  F weight_loss_adequate 0.5–1 %/sem → nada.
 * Datos faltantes (null) → la regla NO puede activarse (missing ≠ zero).
 */
import type { AdjustmentRuleId, ProposedChange, RecommendationEvidence } from '@domain/entities'
import type { AdjustmentInputs } from './inputs'

export const THRESHOLDS = {
  adherence_low_pct: 80,
  adherence_high_pct: 85,
  loss_fast_pct: 1,
  loss_very_fast_pct: 1.5,
  loss_adequate_min_pct: 0.5,
  strength_lifts_min: 2,
  hunger_level: 4,
  hunger_days: 5,
  weight_stable_kg: 0.5,
  waist_stable_cm: 1,
  kcal_up_small: 150,
  kcal_up_large: 200,
  kcal_down: 150,
  steps_up: 2000,
} as const

export interface RuleResult {
  rule_id: AdjustmentRuleId
  /** true = condición cumplida con datos suficientes. */
  fired: boolean
  /** true = faltan datos para decidir (nunca cuenta como fired). */
  no_data: boolean
  evidence: RecommendationEvidence[]
  proposed_change?: ProposedChange
}

function ev(i: AdjustmentInputs, rule_id: AdjustmentRuleId, metric: string, observed: number | null, threshold: number | null): RecommendationEvidence {
  return { rule_id, metric, observed, threshold, period_start: i.window.start, period_end: i.window.end }
}

export function ruleA(i: AdjustmentInputs): RuleResult {
  const pct = i.adherence.pct
  return {
    rule_id: 'adherence_low', no_data: pct === null, fired: pct !== null && pct < THRESHOLDS.adherence_low_pct,
    evidence: [ev(i, 'adherence_low', 'adherence_pct', pct, THRESHOLDS.adherence_low_pct), ev(i, 'adherence_low', 'checkins_answered', i.adherence.answered, 10)],
  }
}

export function ruleB(i: AdjustmentInputs): RuleResult {
  const loss = i.weight.loss_pct_week
  const fired = loss !== null && loss > THRESHOLDS.loss_fast_pct
  const delta = loss !== null && loss > THRESHOLDS.loss_very_fast_pct ? THRESHOLDS.kcal_up_large : THRESHOLDS.kcal_up_small
  return {
    rule_id: 'weight_loss_too_fast', no_data: loss === null, fired,
    evidence: [
      ev(i, 'weight_loss_too_fast', 'weight_loss_pct_week', loss, THRESHOLDS.loss_fast_pct),
      ev(i, 'weight_loss_too_fast', 'weight_avg7_week1_kg', i.weight.week1_avg, null),
      ev(i, 'weight_loss_too_fast', 'weight_avg7_week2_kg', i.weight.week2_avg, null),
    ],
    ...(fired ? { proposed_change: { type: 'kcal', delta } as ProposedChange } : {}),
  }
}

export function ruleC(i: AdjustmentInputs): RuleResult {
  const s = i.strength
  return {
    rule_id: 'strength_drop', no_data: s.comparable === 0, fired: s.falling >= THRESHOLDS.strength_lifts_min,
    evidence: [
      ev(i, 'strength_drop', 'key_lifts_falling', s.comparable === 0 ? null : s.falling, THRESHOLDS.strength_lifts_min),
      ev(i, 'strength_drop', 'key_lifts_comparable', s.comparable, null),
    ],
  }
}

export function ruleD(i: AdjustmentInputs): RuleResult {
  const r = i.recent
  const fired = r.hunger_high_days >= THRESHOLDS.hunger_days
  return {
    rule_id: 'hunger_sustained', no_data: r.days_with_data === 0, fired,
    evidence: [ev(i, 'hunger_sustained', 'hunger_ge4_days_last7', r.days_with_data === 0 ? null : r.hunger_high_days, THRESHOLDS.hunger_days)],
    ...(fired ? { proposed_change: { type: 'kcal', delta: THRESHOLDS.kcal_up_small } as ProposedChange } : {}),
  }
}

export function ruleE(i: AdjustmentInputs, stepsTarget: number): RuleResult {
  const dw = i.weight.delta_kg, dc = i.waist.delta_cm, adh = i.adherence.pct, steps = i.steps.avg
  const no_data = dw === null || dc === null || adh === null
  const fired = !no_data && Math.abs(dw!) <= THRESHOLDS.weight_stable_kg && Math.abs(dc!) <= THRESHOLDS.waist_stable_cm && adh! >= THRESHOLDS.adherence_high_pct
  // Una sola modificación: pasos primero si hay dato y está por debajo del objetivo; si no, kcal.
  const change: ProposedChange = steps !== null && steps < stepsTarget ? { type: 'steps', delta: THRESHOLDS.steps_up } : { type: 'kcal', delta: -THRESHOLDS.kcal_down }
  return {
    rule_id: 'weight_waist_stable', no_data, fired,
    evidence: [
      ev(i, 'weight_waist_stable', 'weight_delta_kg', dw, THRESHOLDS.weight_stable_kg),
      ev(i, 'weight_waist_stable', 'waist_delta_cm', dc, THRESHOLDS.waist_stable_cm),
      ev(i, 'weight_waist_stable', 'adherence_pct', adh, THRESHOLDS.adherence_high_pct),
      ev(i, 'weight_waist_stable', 'steps_avg', steps, stepsTarget),
    ],
    ...(fired ? { proposed_change: change } : {}),
  }
}

export function ruleF(i: AdjustmentInputs): RuleResult {
  const loss = i.weight.loss_pct_week
  return {
    rule_id: 'weight_loss_adequate', no_data: loss === null,
    fired: loss !== null && loss >= THRESHOLDS.loss_adequate_min_pct && loss <= THRESHOLDS.loss_fast_pct,
    evidence: [ev(i, 'weight_loss_adequate', 'weight_loss_pct_week', loss, THRESHOLDS.loss_adequate_min_pct)],
  }
}
