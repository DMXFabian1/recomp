/**
 * Comida — Fase 8.7. Coordina repos + dominio (nutrition / inventory). Sin reglas propias.
 * PLANIFICADO (MealPlan) ≠ CONSUMIDO/ESTIMADO (MealLog) ≠ RECOMENDADO (adaptación propuesta, no persistida hasta registrar).
 */
import { ulid } from 'ulid'
import type { DayString, Food, FoodEquivalent, InventoryItem, MealLog, MealPlan, MealSlot, MealSubstitution, Recipe, Settings } from '@domain/entities'
import { AppError } from '@domain/errors'
import { validateEntity } from '@domain/validation/entities'
import { weekdayOf } from '@domain/time/day'
import { estimateRecipe, type RecipeEstimate } from '@domain/nutrition/estimate'
import { dayProtein, type DayProtein } from '@domain/nutrition/today'
import { getYesterdayNutritionStatus, type YesterdayNutritionStatus } from '@domain/nutrition/yesterday'
import { adaptRecipeToInventory, equivalentsFor, type AdaptResult } from '@domain/inventory/adapt'
import { applySubstitutions } from '@domain/nutrition/estimate'
import { consumeInventory } from '@domain/inventory/status'
import type { Repos, Storage } from '@repo/index'
import { getCheckIn } from './checkin'

export type { DayProtein, RecipeEstimate, AdaptResult }
export const MEAL_SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner']

export interface SlotView {
  slot: MealSlot
  plan: MealPlan | null
  planned_recipe: Recipe | null
  /** Estimación del PLAN (lo que debería comerse). */
  planned_estimate: RecipeEstimate | null
  log: MealLog | null
  /** Receta realmente registrada (puede diferir: emergencia). */
  logged_recipe: Recipe | null
  /** Estimación de lo CONSUMIDO según el registro (null si no hay registro o es off_plan/skipped sin receta). */
  consumed_estimate: RecipeEstimate | null
  /** Adaptación PROPUESTA según inventario (recomendación; no es un hecho). */
  adaptation: AdaptResult | null
}

export interface DayFoodView {
  date: DayString
  weekday: number
  has_plan: boolean
  slots: SlotView[]
  protein: DayProtein
  kcal_target: number
  yesterday: YesterdayNutritionStatus
  foods: Food[]
  recipes: Recipe[]
  emergency_recipes: Recipe[]
  inventory: InventoryItem[]
  equivalents: FoodEquivalent[]
}

async function latestSettings(repos: Repos): Promise<Settings | null> {
  return (await repos.settings.getLive()).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] ?? null
}

export async function loadDayFood(storage: Storage, date: DayString): Promise<DayFoodView> {
  const r = storage.repos
  const [settings, plans, logsAll, recipes, foods, inventory, equivalents, checkInToday] = await Promise.all([
    latestSettings(r), r.meal_plans.getLive(), r.meal_logs.getLive(), r.recipes.getLive(), r.foods.getLive(),
    r.inventory_items.getLive(), r.food_equivalents.getLive(), getCheckIn(storage, date),
  ])
  const weekday = weekdayOf(date)
  const foodMap = new Map(foods.map(f => [f.id, f]))
  const recipeMap = new Map(recipes.map(x => [x.id, x]))
  const dayPlans = plans.filter(p => p.weekday === weekday)
  const logs = logsAll.filter(l => l.date === date)
  const slots: SlotView[] = MEAL_SLOT_ORDER.map(slot => {
    const plan = dayPlans.find(p => p.slot === slot) ?? null
    const plannedRecipe = plan ? recipeMap.get(plan.recipe_id) ?? null : null
    const log = logs.find(l => l.slot === slot) ?? null
    const loggedRecipe = log?.recipe_id ? recipeMap.get(log.recipe_id) ?? null : null
    const consumed = log && loggedRecipe && log.status !== 'skipped' ? estimateRecipe(loggedRecipe, foodMap, log.substitutions) : null
    const adaptation = plannedRecipe && !log ? adaptRecipeToInventory(plannedRecipe, inventory, equivalents, foods) : null
    return {
      slot, plan, planned_recipe: plannedRecipe,
      planned_estimate: plannedRecipe ? estimateRecipe(plannedRecipe, foodMap) : null,
      log, logged_recipe: loggedRecipe, consumed_estimate: consumed,
      adaptation: adaptation && adaptation.missing.length > 0 ? adaptation : null,
    }
  })
  const target = settings?.protein_target_g, floor = settings?.protein_floor_g
  return {
    date, weekday, has_plan: dayPlans.length > 0, slots,
    protein: dayProtein(logs, recipes, foods, target, floor),
    kcal_target: settings?.kcal_target ?? 0,
    yesterday: getYesterdayNutritionStatus({ today: date, today_check_in: checkInToday, meal_plans: plans, meal_logs: logsAll, recipes, foods, ...(floor !== undefined ? { protein_floor_g: floor } : {}) }),
    foods, recipes, emergency_recipes: recipes.filter(x => x.emergency), inventory, equivalents,
  }
}

// ───────────────────────── Registro ─────────────────────────

export type LogMealInput =
  | { date: DayString; slot: MealSlot; status: 'planned'; note?: string } // COMÍ ESTO: tal como estaba planificado
  | { date: DayString; slot: MealSlot; status: 'substituted' | 'adapted'; substitutions: MealSubstitution[]; note?: string }
  | { date: DayString; slot: MealSlot; status: 'emergency'; recipe_id: string; note?: string }
  | { date: DayString; slot: MealSlot; status: 'skipped'; note?: string }

export interface LogMealResult {
  log: MealLog
  inventory_updated: InventoryItem[]
  inventory_untracked: string[]
  created: boolean
}

/**
 * Registra una comida en una transacción. Inventario: se descuentan solo los alimentos con inventario registrado y
 * SOLO al crear el registro del slot (un re-registro del mismo slot no vuelve a descontar).
 * planned/substituted/adapted usan la receta del PLAN del día; emergency la receta indicada; skipped no consume.
 */
export async function logMeal(storage: Storage, input: LogMealInput, now: string): Promise<LogMealResult> {
  return storage.run(['meal_plans', 'meal_logs', 'recipes', 'foods', 'inventory_items'], async repos => {
    const weekday = weekdayOf(input.date)
    const plan = (await repos.meal_plans.getLive()).find(p => p.weekday === weekday && p.slot === input.slot)
    let recipeId: string | undefined
    if (input.status === 'emergency') recipeId = input.recipe_id
    else if (input.status !== 'skipped') {
      if (!plan) throw new AppError('not_allowed', 'No hay plan para esta comida; registra "Me salí", emergencia u omitida.')
      recipeId = plan.recipe_id
    }
    const recipe = recipeId ? await repos.recipes.get(recipeId) : undefined
    if (recipeId && (!recipe || recipe.deleted_at)) throw new AppError('not_found', 'La receta no existe.')
    if (input.status === 'emergency' && !recipe!.emergency) throw new AppError('not_allowed', 'Esa receta no es de emergencia.')

    const foods = new Map((await repos.foods.getLive()).map(f => [f.id, f]))
    const subs = input.status === 'substituted' || input.status === 'adapted' ? input.substitutions : undefined
    if (subs) {
      for (const s of subs) {
        if (!recipe!.items.some(i => i.food_id === s.food_id)) throw new AppError('not_allowed', `El alimento ${s.food_id} no está en la receta.`)
        if (!foods.has(s.substitute_food_id)) throw new AppError('not_found', `El sustituto ${s.substitute_food_id} no existe.`)
      }
    }
    const est = recipe ? estimateRecipe(recipe, foods, subs) : null
    const existing = (await repos.meal_logs.whereEquals('date', input.date)).find(l => l.slot === input.slot && !l.deleted_at)
    const row: MealLog = {
      id: existing?.id ?? ulid(), created_at: existing?.created_at ?? now, updated_at: now, source: 'user',
      date: input.date, slot: input.slot, status: input.status, logged_at: now,
      est_complete: est?.complete ?? false,
      ...(recipeId ? { recipe_id: recipeId } : {}),
      ...(subs && subs.length > 0 ? { substitutions: subs } : {}),
      ...(est?.protein_g !== null && est?.protein_g !== undefined ? { protein_g_est: est.protein_g } : {}),
      ...(est?.kcal !== null && est?.kcal !== undefined ? { kcal_est: est.kcal } : {}),
      ...(input.note ? { note: input.note } : {}),
    }
    const v = validateEntity('meal_logs', row)
    if (!v.ok) throw new AppError('validation', `Registro inválido: ${v.issues.map(i => `${i.path}: ${i.message}`).join('; ')}`)
    await repos.meal_logs.put(row)

    let updated: InventoryItem[] = [], untracked: string[] = []
    if (!existing && recipe && input.status !== 'skipped') {
      const consumed = applySubstitutions(recipe.items, subs).map(i => ({ food_id: i.food_id, portions: i.portions }))
      const r = consumeInventory(await repos.inventory_items.getLive(), consumed, now)
      updated = r.updated; untracked = r.untracked
      if (updated.length > 0) await repos.inventory_items.bulkPut(updated)
    }
    return { log: row, inventory_updated: updated, inventory_untracked: untracked, created: !existing }
  })
}

/** Equivalentes de un alimento (solo los registrados en FoodEquivalent, por prioridad). Vacío = "Sin equivalente disponible". */
export async function equivalentOptions(storage: Storage, foodId: string): Promise<Array<{ equivalent: FoodEquivalent; food: Food }>> {
  const [eqs, foods] = await Promise.all([storage.repos.food_equivalents.getLive(), storage.repos.foods.getLive()])
  const byId = new Map(foods.map(f => [f.id, f]))
  return equivalentsFor(foodId, eqs).flatMap(e => { const f = byId.get(e.substitute_food_id); return f ? [{ equivalent: e, food: f }] : [] })
}
