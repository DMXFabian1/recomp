/**
 * getYesterdayNutritionStatus — Fase 8.3. Servicio PURO.
 *
 * Dos ejes INDEPENDIENTES, nunca derivados uno del otro:
 *  - ADHERENCIA: viene del check-in de hoy (`food_yesterday`: plan/almost/off). Sin check-in → 'unknown'.
 *  - PROTEÍNA COMPLETA: viene de calculateEstimatedProtein sobre los MealLog de ayer (≥ piso).
 *
 * Además describe los registros: comidas planeadas (MealPlan del día de la semana de ayer),
 * consumidas (MealLog no 'skipped') y estimadas (consumidas con est_complete === false).
 * Sin datos suficientes se devuelve explícitamente 'unknown' / 'no_data'; nunca se rellena.
 */
import type { DailyCheckIn, DayString, Food, FoodYesterday, MealLog, MealPlan, Recipe } from '@domain/entities'
import { addDays, weekdayOf } from '@domain/time/day'
import { calculateEstimatedProtein, DEFAULT_PROTEIN_FLOOR_G, type ProteinEstimate } from './protein'

export type AdherenceStatus = 'high' | 'medium' | 'low' | 'unknown'

export interface YesterdayNutritionInput {
  today: DayString
  /** Check-in de HOY (contiene food_yesterday). */
  today_check_in: DailyCheckIn | null | undefined
  meal_plans: MealPlan[]
  /** MealLog de cualquier día; se filtran los de ayer. */
  meal_logs: MealLog[]
  recipes: Recipe[]
  foods: Food[]
  protein_floor_g?: number
}

export interface YesterdayNutritionStatus {
  date: DayString
  planned_meals: number
  logged_meals: number
  consumed_meals: number
  estimated_meals: number
  skipped_meals: number
  /** Valor crudo del check-in, si existe. */
  food_yesterday: FoodYesterday | null
  adherence: AdherenceStatus
  protein: ProteinEstimate
  estimated_protein_g: number | null
  /** true/false solo cuando se pudo determinar; null si 'unknown' o 'no_data'. */
  protein_complete: boolean | null
}

export function adherenceFromFoodYesterday(v: FoodYesterday | undefined | null): AdherenceStatus {
  switch (v) {
    case 'plan': return 'high'
    case 'almost': return 'medium'
    case 'off': return 'low'
    default: return 'unknown'
  }
}

export function getYesterdayNutritionStatus(input: YesterdayNutritionInput): YesterdayNutritionStatus {
  const date = addDays(input.today, -1)
  const floor = input.protein_floor_g ?? DEFAULT_PROTEIN_FLOOR_G
  const logs = input.meal_logs.filter(l => l.date === date && !l.deleted_at)
  const planned = input.meal_plans.filter(p => p.weekday === weekdayOf(date) && !p.deleted_at).length
  const consumed = logs.filter(l => l.status !== 'skipped')
  const estimated = consumed.filter(l => !l.est_complete).length
  const skipped = logs.length - consumed.length

  const checkIn = input.today_check_in && !input.today_check_in.deleted_at && input.today_check_in.date === input.today
    ? input.today_check_in : null
  const foodYesterday = checkIn?.food_yesterday ?? null

  const protein = calculateEstimatedProtein({ meal_logs: logs, recipes: input.recipes, foods: input.foods }, floor)
  const proteinComplete = protein.status === 'complete' ? true : protein.status === 'incomplete' ? false : null

  return {
    date,
    planned_meals: planned,
    logged_meals: logs.length,
    consumed_meals: consumed.length,
    estimated_meals: estimated,
    skipped_meals: skipped,
    food_yesterday: foodYesterday,
    adherence: adherenceFromFoodYesterday(foodYesterday),
    protein,
    estimated_protein_g: protein.grams_known,
    protein_complete: proteinComplete,
  }
}
