/**
 * Estado de AHORA — Fase 8.5. Lee repos y delega TODA la regla al dominio:
 *   getToday (rotación, solo lectura) · getYesterdayNutritionStatus (adherencia ≠ proteína) · decideNowAction.
 * No escribe nada. No toca rotation_cursor.
 */
import type { DailyCheckIn, Program, Settings, WorkoutSession, WorkoutTemplate } from '@domain/entities'
import { getToday, type TodayState } from '@domain/rotation/getToday'
import { getYesterdayNutritionStatus, type YesterdayNutritionStatus } from '@domain/nutrition/yesterday'
import { localDay } from '@domain/time/day'
import type { Storage } from '@repo/index'
import { getCheckIn } from './checkin'
import { decideNowAction, type NowAction } from './nowAction'

export interface NowState {
  today: string
  now_hhmm: string
  settings: Settings | null
  program: Program | null
  templates: WorkoutTemplate[]
  check_in: DailyCheckIn | null
  today_state: TodayState
  open_session: WorkoutSession | null
  yesterday: YesterdayNutritionStatus
  action: NowAction
}

function latestSettings(rows: Settings[]): Settings | null {
  return rows.filter(s => !s.deleted_at).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] ?? null
}

export async function loadNowState(storage: Storage, nowDate: Date): Promise<NowState> {
  const today = localDay(nowDate)
  const hh = String(nowDate.getHours()).padStart(2, '0'), mm = String(nowDate.getMinutes()).padStart(2, '0')
  const r = storage.repos
  const [settingsRows, programs, templates, sessions, checkIn, mealPlans, mealLogs, recipes, foods] = await Promise.all([
    r.settings.getLive(), r.programs.getLive(), r.workout_templates.getLive(), r.workout_sessions.getLive(),
    getCheckIn(storage, today), r.meal_plans.getLive(), r.meal_logs.getLive(), r.recipes.getLive(), r.foods.getLive(),
  ])
  const settings = latestSettings(settingsRows)
  const program = programs.find(p => p.active) ?? null
  const todayState = getToday({ today, effective_from: settings?.effective_from ?? today, program, templates, sessions })
  const yesterday = getYesterdayNutritionStatus({
    today, today_check_in: checkIn, meal_plans: mealPlans, meal_logs: mealLogs, recipes, foods,
    ...(settings ? { protein_floor_g: settings.protein_floor_g } : {}),
  })
  return {
    today, now_hhmm: `${hh}:${mm}`, settings, program, templates, check_in: checkIn, today_state: todayState,
    open_session: todayState.open_session, yesterday, action: decideNowAction(checkIn, todayState),
  }
}
