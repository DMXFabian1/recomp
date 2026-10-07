/**
 * Adaptación del menú según inventario (Fase 8.7). Pura.
 * Solo adapta un alimento cuando su InventoryItem registrado dice que NO alcanza (agotado o porciones < necesarias).
 * Un alimento sin inventario registrado no se toca (no se sabe; no se inventa).
 * El sustituto sale EXCLUSIVAMENTE de FoodEquivalent (por prioridad) y debe: existir, tener inventario suficiente
 * si está registrado (si no está registrado, se acepta: desconocido ≠ agotado) y no estar él mismo agotado.
 * Si no hay equivalente válido → unresolved. El plan original nunca se modifica: se devuelven MealSubstitution.
 */
import type { Food, FoodEquivalent, InventoryItem, MealSubstitution, Recipe } from '@domain/entities'

export interface AdaptResult {
  substitutions: MealSubstitution[]
  /** Alimentos que faltan y no tienen equivalente válido. */
  unresolved: string[]
  /** Alimentos que faltan según inventario (resueltos o no). */
  missing: string[]
}

export function equivalentsFor(foodId: string, equivalents: FoodEquivalent[]): FoodEquivalent[] {
  return equivalents.filter(e => e.food_id === foodId && !e.deleted_at).sort((a, b) => a.priority - b.priority)
}

export function adaptRecipeToInventory(recipe: Pick<Recipe, 'items'>, inventory: InventoryItem[], equivalents: FoodEquivalent[], foods: Food[]): AdaptResult {
  const inv = new Map(inventory.filter(i => !i.deleted_at).map(i => [i.food_id, i]))
  const foodIds = new Set(foods.filter(f => !f.deleted_at).map(f => f.id))
  const enough = (foodId: string, portions: number) => {
    const i = inv.get(foodId)
    return i === undefined ? true : i.status !== 'out' && i.portions_left >= portions
  }
  const substitutions: MealSubstitution[] = []
  const unresolved: string[] = []
  const missing: string[] = []
  for (const it of recipe.items) {
    if (enough(it.food_id, it.portions)) continue
    missing.push(it.food_id)
    const option = equivalentsFor(it.food_id, equivalents).find(e => {
      const portions = Math.round(it.portions * e.ratio * 100) / 100
      return foodIds.has(e.substitute_food_id) && enough(e.substitute_food_id, portions)
    })
    if (!option) { unresolved.push(it.food_id); continue }
    substitutions.push({ food_id: it.food_id, substitute_food_id: option.substitute_food_id, portions: Math.round(it.portions * option.ratio * 100) / 100 })
  }
  return { substitutions, unresolved, missing }
}
