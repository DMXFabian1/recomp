/**
 * Proteína del día (Fase 8.7). Pura. Reutiliza calculateEstimatedProtein (cota inferior sobre los MealLog del día).
 *  - consumed_g: gramos conocidos (null si no hay registros o nada calculable → "sin datos suficientes").
 *  - remaining_to_target / remaining_to_floor: solo cuando consumed_g es número; null si no.
 *  - unknown_meals > 0 ⇒ la cifra es una cota inferior, y se dice.
 */
import type { Food, MealLog, Recipe } from '@domain/entities'
import { calculateEstimatedProtein, DEFAULT_PROTEIN_FLOOR_G, type ProteinEstimate } from './protein'

export const DEFAULT_PROTEIN_TARGET_G = 180

export interface DayProtein {
  consumed_g: number | null
  target_g: number
  floor_g: number
  remaining_to_target: number | null
  remaining_to_floor: number | null
  is_lower_bound: boolean
  estimate: ProteinEstimate
}

export function dayProtein(logs: MealLog[], recipes: Recipe[], foods: Food[], target_g = DEFAULT_PROTEIN_TARGET_G, floor_g = DEFAULT_PROTEIN_FLOOR_G): DayProtein {
  const estimate = calculateEstimatedProtein({ meal_logs: logs, recipes, foods }, floor_g)
  const known = estimate.known_meals > 0 ? estimate.grams_known : null
  return {
    consumed_g: known,
    target_g, floor_g,
    remaining_to_target: known === null ? null : Math.max(0, Math.round((target_g - known) * 10) / 10),
    remaining_to_floor: known === null ? null : Math.max(0, Math.round((floor_g - known) * 10) / 10),
    is_lower_bound: estimate.unknown_meals > 0,
    estimate,
  }
}
