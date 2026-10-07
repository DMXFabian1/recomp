/**
 * Estimación de macros de una receta (Fase 8.7). Pura. Única fuente para proteína y kcal de una comida:
 * la usan calculateEstimatedProtein (ayer) y el plan de hoy.
 *  - Sustituciones (MealSubstitution) reemplazan un alimento de la receta por otro con sus porciones.
 *  - Un alimento ausente, o con nutrition_status 'missing' / sin protein_g, hace la estimación DESCONOCIDA
 *    para ese macro: nunca se cuenta como 0.
 */
import type { Food, MealSubstitution, Recipe, RecipeItem } from '@domain/entities'

export interface RecipeEstimate {
  protein_g: number | null
  kcal: number | null
  /** true si TODOS los alimentos tienen datos para proteína y kcal. */
  complete: boolean
  /** Alimentos (id) sin datos de proteína. */
  missing_protein: string[]
  missing_kcal: string[]
  /** Alimentos que no existen en el catálogo. */
  missing_foods: string[]
  items: Array<{ food_id: string; portions: number; substituted_for?: string }>
}

export function applySubstitutions(items: RecipeItem[], subs: MealSubstitution[] | undefined): RecipeEstimate['items'] {
  return items.map(it => {
    const sub = subs?.find(s => s.food_id === it.food_id)
    return sub ? { food_id: sub.substitute_food_id, portions: sub.portions, substituted_for: it.food_id } : { food_id: it.food_id, portions: it.portions }
  })
}

export function estimateRecipe(recipe: Pick<Recipe, 'items'>, foods: Map<string, Food>, subs?: MealSubstitution[]): RecipeEstimate {
  const items = applySubstitutions(recipe.items, subs)
  let protein = 0, kcal = 0
  const missingP: string[] = [], missingK: string[] = [], missingF: string[] = []
  for (const it of items) {
    const f = foods.get(it.food_id)
    if (!f || f.deleted_at) { missingF.push(it.food_id); continue }
    if (f.nutrition_status === 'missing' || f.protein_g === undefined) missingP.push(f.id)
    else protein += f.protein_g * it.portions
    if (f.nutrition_status === 'missing' || f.kcal === undefined) missingK.push(f.id)
    else kcal += f.kcal * it.portions
  }
  const pOk = missingP.length === 0 && missingF.length === 0
  const kOk = missingK.length === 0 && missingF.length === 0
  return {
    protein_g: pOk ? round1(protein) : null,
    kcal: kOk ? Math.round(kcal) : null,
    complete: pOk && kOk,
    missing_protein: missingP, missing_kcal: missingK, missing_foods: missingF, items,
  }
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}
