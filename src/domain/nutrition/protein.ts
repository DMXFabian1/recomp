/**
 * calculateEstimatedProtein — Fase 8.3. Servicio PURO.
 *
 * Trabaja SOLO con los datos de comida de ayer que ya existen (MealLog del día + recetas y alimentos
 * a los que apuntan). Nunca inventa alimentos ni cantidades.
 *
 * Por comida registrada:
 *  - 'skipped'                         → 0 g, conocido.
 *  - 'off_plan'                        → off_plan_protein_g si es número; null/ausente = "no sé" → desconocido.
 *  - planned/substituted/adapted/emergency:
 *       · si trae protein_g_est y est_complete → se usa ese valor (lo calculó la app al registrar);
 *       · si no, se recalcula desde la receta (aplicando sustituciones);
 *       · receta ausente, alimento ausente o sin protein_g (nutrition_status 'missing') → desconocido.
 *
 * Resultado:
 *  - grams_known: suma de lo que SÍ se pudo calcular (cota inferior).
 *  - status: 'no_data' (sin registros) · 'complete' (grams_known ≥ floor; vale aunque haya desconocidos,
 *    porque la cota inferior ya supera el piso) · 'incomplete' (todo conocido y < floor) ·
 *    'unknown' (hay comidas desconocidas y la cota inferior no llega al piso: no se fabrica un número).
 */
import type { Food, MealLog, MealSlot, Recipe } from '@domain/entities'

export const DEFAULT_PROTEIN_FLOOR_G = 160

export interface FoodYesterdayData {
  meal_logs: MealLog[]
  recipes: Recipe[]
  foods: Food[]
}

export type ProteinStatus = 'no_data' | 'complete' | 'incomplete' | 'unknown'

export interface MealProtein {
  slot: MealSlot
  status: MealLog['status']
  grams: number | null
  reason?: 'no_recipe' | 'food_missing' | 'food_without_protein' | 'off_plan_unknown'
}

export interface ProteinEstimate {
  status: ProteinStatus
  /** Gramos conocidos (cota inferior). null solo en 'no_data'. */
  grams_known: number | null
  floor_g: number
  meals: MealProtein[]
  known_meals: number
  unknown_meals: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function proteinOfRecipe(log: MealLog, recipes: Map<string, Recipe>, foods: Map<string, Food>): { grams: number } | { reason: MealProtein['reason'] } {
  if (!log.recipe_id) return { reason: 'no_recipe' }
  const recipe = recipes.get(log.recipe_id)
  if (!recipe) return { reason: 'no_recipe' }
  // Sustituciones: reemplazan un alimento de la receta por otro con sus porciones.
  const items = recipe.items.map(it => {
    const sub = log.substitutions?.find(s => s.food_id === it.food_id)
    return sub ? { food_id: sub.substitute_food_id, portions: sub.portions } : it
  })
  let total = 0
  for (const it of items) {
    const f = foods.get(it.food_id)
    if (!f) return { reason: 'food_missing' }
    if (f.protein_g === undefined || f.nutrition_status === 'missing') return { reason: 'food_without_protein' }
    total += f.protein_g * it.portions
  }
  return { grams: total }
}

export function calculateEstimatedProtein(data: FoodYesterdayData, floor_g = DEFAULT_PROTEIN_FLOOR_G): ProteinEstimate {
  const logs = data.meal_logs.filter(l => !l.deleted_at)
  if (logs.length === 0) return { status: 'no_data', grams_known: null, floor_g, meals: [], known_meals: 0, unknown_meals: 0 }

  const recipes = new Map(data.recipes.filter(r => !r.deleted_at).map(r => [r.id, r]))
  const foods = new Map(data.foods.filter(f => !f.deleted_at).map(f => [f.id, f]))

  const meals: MealProtein[] = logs.map(log => {
    const m: MealProtein = { slot: log.slot, status: log.status, grams: null }
    if (log.status === 'skipped') { m.grams = 0; return m }
    if (log.status === 'off_plan') {
      if (typeof log.off_plan_protein_g === 'number') m.grams = log.off_plan_protein_g
      else m.reason = 'off_plan_unknown'
      return m
    }
    if (log.protein_g_est !== undefined && log.est_complete) { m.grams = log.protein_g_est; return m }
    const r = proteinOfRecipe(log, recipes, foods)
    if ('grams' in r) m.grams = r.grams
    else m.reason = r.reason
    return m
  })

  const known = meals.filter(m => m.grams !== null)
  const unknown = meals.length - known.length
  const grams = round1(known.reduce((acc, m) => acc + (m.grams ?? 0), 0))

  let status: ProteinStatus
  if (grams >= floor_g) status = 'complete'
  else if (unknown > 0) status = 'unknown'
  else status = 'incomplete'

  return { status, grams_known: grams, floor_g, meals, known_meals: known.length, unknown_meals: unknown }
}
