/**
 * CoachReport — Fase 8.10. Tipos de la estructura del reporte quincenal. Solo lectura: nada aquí se persiste.
 * Convención: `null` = sin datos (nunca 0). Cada sección declara si sus números son OBSERVADOS (registros),
 * ESTIMADOS (proteína por receta) o RECOMENDADOS (Recommendation); las decisiones vienen de RecommendationDecision.
 */
import type {
  Alert, AlertType, BodyMeasurement, DayString, FoodYesterday, IsoDateTime, MealLogStatus, ProposedChange, Recommendation,
  RecommendationDecision, RecommendationEvidence, SessionVersion, SettingsChangeOrigin, SleepBucket,
} from '@domain/entities'

export const COACH_REPORT_VERSION = 1

export interface CoachReportPeriod {
  /** closed = ventana de 14 días cerrada (8.9); partial = ventana en curso hasta ayer; empty = sin días cerrados. */
  status: 'closed' | 'partial' | 'empty'
  start: DayString
  /** Último día incluido (siempre < hoy). null si status = empty. */
  end: DayString | null
  days: number
  /** Fin de la ventana de 14 días a la que pertenece el periodo. */
  window_end: DayString
  settings_effective_from: DayString
}

export interface CoachReportBody {
  latest_weight: { date: DayString; kg: number } | null
  avg7_kg: number | null
  avg7_points: number
  avg7_prev_kg: number | null
  avg7_prev_points: number
  avg7_change_kg: number | null
  loss_pct_week: number | null
  trend_kg_week: number | null
  weight_points_in_period: number
  waist_latest: { date: DayString; cm: number } | null
  waist_week1_cm: number | null
  waist_week2_cm: number | null
  waist_change_cm: number | null
  bia: BodyMeasurement[]
}

export interface ReportSession {
  date: DayString
  template: string
  status: 'completed' | 'abandoned' | 'cancelled' | 'open'
  version: SessionVersion
  substitutions: Array<{ original: string; substitute: string }>
}

export interface ReportLift {
  id: string
  name: string
  /** Sesiones del periodo con este ejercicio EXACTO (sustituciones marcadas, nunca fusionadas). */
  sessions: Array<{ date: DayString; load_kg: number; reps: number[]; substituted: boolean }>
  /** Comparación 8.9: última comparable del periodo vs última comparable de la ventana anterior. */
  comparison:
    | { comparable: false; reason: 'no_current' | 'no_previous' }
    | { comparable: true; previous: { date: DayString; load_kg: number; reps: number[] }; current: { date: DayString; load_kg: number; reps: number[] }; lower: boolean }
}

export interface CoachReportTraining {
  sessions: ReportSession[]
  counts: { completed: number; abandoned: number; cancelled: number; open: number; short: number; minimal: number }
  rotation: { names: string[]; next: string | null; cursor: number } | null
  key_lifts: ReportLift[]
  stalls: Array<{ date: DayString; message: string }>
}

export interface CoachReportCardio {
  sessions: Array<{ date: DayString; modality: string; preset: string | null; minutes: number; distance_m: number | null; split_s_per_500m: number | null; rpe: number }>
  total_minutes: number
  total_distance_m: number | null
  monthly_test: { date: DayString; distance_m: number; split_avg_s: number; distance_delta_m: number | null; split_delta_s: number | null } | null
}

export interface CoachReportNutrition {
  kcal_target: number
  protein_target_g: number
  protein_floor_g: number
  adherence: { answered: number; plan: number; almost: number; off: number; pct: number | null }
  meal_logs: number
  by_status: Record<MealLogStatus, number>
  off_plan_protein_unknown: number
  days: Array<{ date: DayString; logs: number; protein_g: number | null; lower_bound: boolean }>
  protein_days_with_data: number
  protein_avg_g: number | null
  protein_days_at_floor: number
  kcal_logged_meals: number
  foods_without_macros: string[]
}

export interface CoachReportHabits {
  days: Array<{ date: DayString; weight_kg: number | null; food_yesterday: FoodYesterday | null; sleep: SleepBucket | null; steps: number | null; energy: number | null; hunger: number | null; mood: number | null }>
  sleep: Record<SleepBucket | 'unknown', number>
  steps_avg: number | null
  steps_days: number
  energy_avg: number | null
  hunger_avg: number | null
  mood_avg: number | null
  hunger_ge4_last7: number
  mood_le2_last7: number
  checkin_days: number
}

export interface CoachReportGoals {
  baseline: { weight_avg_kg: number | null; waist_cm: number | null; bia_fat_pct: number | null; closed: boolean } | null
  months: Array<{
    month: string
    weight_goal_pct: [number, number]
    weight_goal_kg: [number, number] | null
    weight_real_kg: number | null
    waist_delta_goal_cm: [number, number]
    waist_goal_cm: [number, number] | null
    waist_real_cm: number | null
    strength_sessions_goal: number
    strength_sessions_real: number
    cardio_sessions_goal: number
    cardio_sessions_real: number
    steps_target: number
    focus: string
  }>
}

export interface ReportAlert {
  type: AlertType
  date: DayString
  message: string
  period_end: DayString | null
  action_taken: string
  acknowledged: boolean
}

export interface CoachReportAlerts { items: ReportAlert[] }

export interface ReportRecommendation {
  id: string
  date: DayString
  origin: Recommendation['origin']
  type: Recommendation['type']
  status: Recommendation['status']
  rule_id: string | null
  period_start: DayString | null
  period_end: DayString | null
  proposed_change: ProposedChange | null
  evidence: RecommendationEvidence[]
  rationale: string
  decision: { decision: RecommendationDecision['decision']; decided_at: IsoDateTime; applied_effective_from: DayString | null } | null
}

export interface CoachReportAdjustments {
  current: { effective_from: DayString; change_origin: SettingsChangeOrigin; kcal_target: number; steps_target: number; protein_target_g: number; protein_floor_g: number }
  history: Array<{ effective_from: DayString; change_origin: SettingsChangeOrigin; kcal_target: number; steps_target: number }>
  recommendations: ReportRecommendation[]
}

export interface CoachReportMissingData { items: string[] }

export interface CoachReport {
  version: number
  app_version: string
  generated_at: IsoDateTime
  today: DayString
  period: CoachReportPeriod
  body: CoachReportBody
  training: CoachReportTraining
  cardio: CoachReportCardio
  nutrition: CoachReportNutrition
  habits: CoachReportHabits
  goals: CoachReportGoals
  alerts: CoachReportAlerts
  adjustments: CoachReportAdjustments
  missing: CoachReportMissingData
}

export type { Alert }
