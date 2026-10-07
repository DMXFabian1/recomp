/**
 * Lista de compras — Fase 8.7. NECESARIO − INVENTARIO = COMPRAR, por horizonte de tienda.
 * generateShoppingList crea una ShoppingList 'open' (cerrando la anterior abierta) con un item por alimento faltante.
 */
import { ulid } from 'ulid'
import type { Food, ShoppingList, ShoppingListItem, Store } from '@domain/entities'
import { computeNeeds, type Need } from '@domain/shopping/needs'
import type { Storage } from '@repo/index'

export const DEFAULT_HORIZONS: ShoppingList['horizons'] = { costco: 30, super: 14, market: 7 }
export const DEFAULT_RESERVE_PCT = 10
export const STORE_LABEL: Record<Store, string> = { costco: 'Costco · 30 d', super: 'Súper · 14 d', market: 'Mercado · 7 d' }

export interface ShoppingView {
  list: ShoppingList | null
  items: Array<{ item: ShoppingListItem; food: Food; need: Need | null }>
  needs: Need[]
}

export async function previewNeeds(storage: Storage, horizons = DEFAULT_HORIZONS, reserve_pct = DEFAULT_RESERVE_PCT): Promise<Need[]> {
  const r = storage.repos
  const [mealPlans, recipes, foods, inventory] = await Promise.all([r.meal_plans.getLive(), r.recipes.getLive(), r.foods.getLive(), r.inventory_items.getLive()])
  return computeNeeds({ mealPlans, recipes, foods, inventory, horizons, reserve_pct })
}

export async function generateShoppingList(storage: Storage, now: string, horizons = DEFAULT_HORIZONS, reserve_pct = DEFAULT_RESERVE_PCT): Promise<ShoppingView> {
  const needs = await previewNeeds(storage, horizons, reserve_pct)
  await storage.run(['shopping_lists', 'shopping_list_items'], async repos => {
    const open = (await repos.shopping_lists.whereEquals('status', 'open')).filter(l => !l.deleted_at)
    for (const l of open) await repos.shopping_lists.put({ ...l, status: 'done', updated_at: now })
    const list: ShoppingList = { id: ulid(), created_at: now, updated_at: now, source: 'user', horizons, reserve_pct, status: 'open' }
    await repos.shopping_lists.put(list)
    const items: ShoppingListItem[] = needs.filter(n => n.missing_portions > 0).map(n => ({
      id: ulid(), created_at: now, updated_at: now, source: 'user', list_id: list.id, food_id: n.food_id,
      needed_portions: n.needed_portions, have_portions: n.have_portions, buy_units: n.buy_units, store: n.store, checked: false,
    }))
    if (items.length > 0) await repos.shopping_list_items.bulkPut(items)
  })
  return loadShopping(storage)
}

export async function loadShopping(storage: Storage): Promise<ShoppingView> {
  const r = storage.repos
  const list = (await r.shopping_lists.whereEquals('status', 'open')).filter(l => !l.deleted_at).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null
  const needs = list ? await previewNeeds(storage, list.horizons, list.reserve_pct) : await previewNeeds(storage)
  if (!list) return { list: null, items: [], needs }
  const [items, foods] = await Promise.all([r.shopping_list_items.whereEquals('list_id', list.id), r.foods.getLive()])
  const byId = new Map(foods.map(f => [f.id, f]))
  return {
    list, needs,
    items: items.filter(i => !i.deleted_at).flatMap(item => { const food = byId.get(item.food_id); return food ? [{ item, food, need: needs.find(n => n.food_id === item.food_id) ?? null }] : [] })
      .sort((a, b) => a.item.store.localeCompare(b.item.store) || Number(a.item.checked) - Number(b.item.checked)),
  }
}

export async function toggleShoppingItem(storage: Storage, itemId: string, checked: boolean, now: string): Promise<void> {
  await storage.run(['shopping_list_items'], async repos => {
    const it = await repos.shopping_list_items.get(itemId)
    if (it) await repos.shopping_list_items.put({ ...it, checked, updated_at: now })
  })
}

export async function closeShoppingList(storage: Storage, listId: string, now: string): Promise<void> {
  await storage.run(['shopping_lists'], async repos => {
    const l = await repos.shopping_lists.get(listId)
    if (l) await repos.shopping_lists.put({ ...l, status: 'done', updated_at: now })
  })
}
