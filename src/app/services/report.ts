/**
 * Reporte quincenal — Fase 8.10. SOLO LECTURA: lee repos fuera de transacción, llama a domain/report y devuelve
 * estructura + texto. No escribe, no crea Recommendations, no evalúa reglas, no hace red. Fotos nunca se leen.
 */
import type { DayString, IsoDateTime } from '@domain/entities'
import { AppError } from '@domain/errors'
import { APP_VERSION } from '@domain/backup/schema'
import { buildCoachReport, renderCoachReportText, type CoachReport } from '@domain/report'
import type { Storage } from '@repo/index'

export type { CoachReport }
export interface CoachReportView { report: CoachReport; text: string }

export async function loadCoachReport(storage: Storage, today: DayString, generatedAt: IsoDateTime): Promise<CoachReportView> {
  const r = storage.repos
  const [settings, programs, templates, exercises, checkIns, measurements, sessions, sets, cardio, tests, mealLogs, recipes, foods, goals, baselines, recommendations, decisions, alerts] = await Promise.all([
    r.settings.getLive(), r.programs.getLive(), r.workout_templates.getLive(), r.exercises.getLive(), r.daily_check_ins.getLive(),
    r.body_measurements.getLive(), r.workout_sessions.getAll(), r.exercise_sets.getLive(), r.cardio_sessions.getLive(), r.monthly_tests.getLive(),
    r.meal_logs.getLive(), r.recipes.getLive(), r.foods.getLive(), r.monthly_goals.getLive(), r.baselines.getLive(),
    r.recommendations.getLive(), r.recommendation_decisions.getLive(), r.alerts.getLive(),
  ])
  if (settings.length === 0) throw new AppError('not_found', 'No hay Settings.')
  const report = buildCoachReport({
    today, generated_at: generatedAt, app_version: APP_VERSION,
    settings, program: programs.find(p => p.active) ?? null, templates, exercises: exercises.map(e => ({ id: e.id, name: e.name })),
    checkIns, measurements, sessions, sets, cardio, tests, mealLogs, recipes, foods, goals, baselines, recommendations, decisions, alerts,
  })
  return { report, text: renderCoachReportText(report) }
}
