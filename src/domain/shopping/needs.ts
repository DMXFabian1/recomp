/**
 * Lista de compras (Fase 8.7). Pura. COMPRAR = NECESARIO − INVENTARIO.
 *  - Necesario por alimento = porciones semanales según el MealPlan (7 días × 4 slots) × (horizonte de su tienda / 7)
 *    × (1 + reserva). Horizontes por tienda (ShoppingList.horizons): costco 30 · super 14 · market 7.
 *  - Inventario = portions_left del InventoryItem; sin inventario registrado se toma 0 y se dice en el motivo
 *    ("sin inventario registrado"): es la única suposición, explícita, nunca una cantidad inventada.
 *  - Solo alimentos que aparecen en el plan: no se crean productos ficticios.
 *  - buy_units = ceil(faltante / portions_per_unit).
 */
import type { Food, InventoryItem, MealPlan, Recipe, ShoppingList, Store } from '@domain/entities'

export interface Need {
  food_id: string
  store: Store
  horizon_days: number
  weekly_portions: number
  needed_portions: number
  have_portions: number
  have_known: boolean
  missing_portions: number
  buy_units: number
  purchase_unit: string
  reason: string
}

export function weeklyPortions(mealPlans: MealPlan[], recipes: Recipe[]): Map<string, number> {
  const byId = new Map(recipes.filter(r => !r.deleted_at).map(r => [r.id, r]))
  const out = new Map<string, number>()
  for (const mp of mealPlans) {
    if (mp.deleted_at) continue
    const r = byId.get(mp.recipe_id)
    if (!r) continue
    for (const it of r.items) out.set(it.food_id, (out.get(it.food_id) ?? 0) + it.portions)
  }
  return out
}

export function computeNeeds(input: { mealPlans: MealPlan[]; recipes: Recipe[]; foods: Food[]; inventory: InventoryItem[]; horizons: ShoppingList['horizons']; reserve_pct: number }): Need[] {
  const weekly = weeklyPortions(input.mealPlans, input.recipes)
  const inv = new Map(input.inventory.filter(i => !i.deleted_at).map(i => [i.food_id, i]))
  const needs: Need[] = []
  for (const f of input.foods) {
    if (f.deleted_at) continue
    const wp = weekly.get(f.id)
    if (!wp) continue
    const horizon = input.horizons[f.store]
    const needed = Math.ceil(wp * (horizon / 7) * (1 + input.reserve_pct / 100))
    const item = inv.get(f.id)
    const have = item ? Math.max(0, item.portions_left) : 0
    const missing = Math.max(0, needed - have)
    const buy = missing > 0 ? Math.ceil(missing / f.portions_per_unit) : 0
    const reason = missing === 0
      ? `cubierto: ${have} porciones ≥ ${needed} necesarias`
      : `${needed} porciones para ${horizon} d (${wp}/semana${input.reserve_pct ? ` + ${input.reserve_pct} % reserva` : ''}) − ${item ? `${have} en inventario` : 'sin inventario registrado'}`
    needs.push({ food_id: f.id, store: f.store, horizon_days: horizon, weekly_portions: Math.round(wp * 10) / 10, needed_portions: needed, have_portions: have, have_known: item !== undefined, missing_portions: missing, buy_units: buy, purchase_unit: f.purchase_unit, reason })
  }
  return needs.sort((a, b) => a.store.localeCompare(b.store) || b.missing_portions - a.missing_portions)
}
