/**
 * Fase 8.7 — comida sobre IndexedDB real (fake-indexeddb) con el seed oficial.
 * 2026-10-07 es miércoles (weekday 3): desayuno licuado (ISO → proteína desconocida), comida pollo, snack ISO, cena tacos de pollo.
 */
import { describe, expect, it } from 'vitest'
import { DexieStorage } from '@infra/dexie/storage'
import { seedIfEmpty } from '@app/seed/seed'
import { SEED_IDS } from '@app/seed/ids'
import type { Storage } from '@repo/index'
import { saveCheckIn } from './checkin'
import { logOffPlan } from './meals'
import { equivalentOptions, loadDayFood, logMeal } from './nutrition'
import { removeInventory, setInventoryPortions, setInventoryStatus } from './inventory'
import { generateShoppingList, loadShopping, previewNeeds, toggleShoppingItem } from './shopping'
import { updateFood } from './food'
import { inventoryStatus } from '@domain/inventory/status'
import { adaptRecipeToInventory } from '@domain/inventory/adapt'
import { computeNeeds } from '@domain/shopping/needs'

const F = SEED_IDS.foods
const R = SEED_IDS.recipes
const D = '2026-10-07'
const ISO = (hhmm: string, d = D) => `${d}T${hhmm}:00.000Z`

async function fresh(name: string): Promise<Storage> {
  const s = new DexieStorage(name)
  await s.open()
  await seedIfEmpty(s)
  return s
}

describe('plan del día', () => {
  it('muestra el plan existente con estimación del plan y sin registros: planificado ≠ consumido', async () => {
    const s = await fresh('nu_plan')
    const v = await loadDayFood(s, D)
    expect(v.has_plan).toBe(true)
    expect(v.slots.map(x => x.slot)).toEqual(['breakfast', 'lunch', 'snack', 'dinner'])
    const lunch = v.slots[1]!
    expect(lunch.planned_recipe?.id).toBe(R.lunchChicken)
    expect(lunch.planned_estimate?.protein_g).toBeGreaterThan(50)
    expect(lunch.log).toBeNull()
    expect(lunch.consumed_estimate).toBeNull()
    // desayuno con ISO: proteína del plan desconocida, no 0
    const bf = v.slots[0]!
    expect(bf.planned_estimate?.protein_g).toBeNull()
    expect(bf.planned_estimate?.missing_protein).toContain(F.iso)
    expect(v.protein.consumed_g).toBeNull()
    expect(v.protein.target_g).toBe(180)
    expect(v.protein.floor_g).toBe(160)
    expect(v.kcal_target).toBe(2400)
    s.close()
  })
  it('día sin plan: no inventa comidas pero permite registrar fuera de plan / emergencia / omitida', async () => {
    const s = await fresh('nu_noplan')
    await s.run(['meal_plans'], async r => { for (const p of await r.meal_plans.getAll()) await r.meal_plans.softDelete(p.id, ISO('05:00')) })
    const v = await loadDayFood(s, D)
    expect(v.has_plan).toBe(false)
    expect(v.slots.every(x => x.plan === null && x.planned_recipe === null)).toBe(true)
    await expect(logMeal(s, { date: D, slot: 'lunch', status: 'planned' }, ISO('14:00'))).rejects.toMatchObject({ code: 'not_allowed' })
    await logOffPlan(s, { date: D, slot: 'lunch', protein_g: 40 }, ISO('14:01'))
    await logMeal(s, { date: D, slot: 'dinner', status: 'emergency', recipe_id: R.emergency }, ISO('20:00'))
    await logMeal(s, { date: D, slot: 'snack', status: 'skipped' }, ISO('17:00'))
    const v2 = await loadDayFood(s, D)
    expect(v2.slots.map(x => x.log?.status ?? null)).toEqual([null, 'off_plan', 'skipped', 'emergency'])
    s.close()
  })
})

describe('registro de comidas', () => {
  it('COMÍ ESTO: registra la receta del plan sin reconstruirla, con estimación y est_complete', async () => {
    const s = await fresh('nu_ate')
    const r = await logMeal(s, { date: D, slot: 'lunch', status: 'planned' }, ISO('14:10'))
    expect(r.created).toBe(true)
    expect(r.log.status).toBe('planned')
    expect(r.log.recipe_id).toBe(R.lunchChicken)
    expect(r.log.est_complete).toBe(true)
    expect(r.log.protein_g_est).toBeGreaterThan(50)
    const v = await loadDayFood(s, D)
    expect(v.slots[1]!.consumed_estimate?.protein_g).toBe(r.log.protein_g_est)
    expect(v.protein.consumed_g).toBe(r.log.protein_g_est)
    expect(v.protein.remaining_to_target).toBe(Math.round((180 - r.log.protein_g_est!) * 10) / 10)
    s.close()
  })
  it('substituted y adapted guardan las sustituciones; el plan original queda intacto', async () => {
    const s = await fresh('nu_sub')
    const plansBefore = await s.repos.meal_plans.getAll()
    const recipesBefore = await s.repos.recipes.getAll()
    const sub = [{ food_id: F.chicken, substitute_food_id: F.tuna, portions: 2 }]
    const a = await logMeal(s, { date: D, slot: 'lunch', status: 'substituted', substitutions: sub }, ISO('14:00'))
    expect(a.log.substitutions).toEqual(sub)
    const b = await logMeal(s, { date: D, slot: 'dinner', status: 'adapted', substitutions: [{ food_id: F.chicken, substitute_food_id: F.tuna, portions: 2 }] }, ISO('20:00'))
    expect(b.log.status).toBe('adapted')
    expect(await s.repos.meal_plans.getAll()).toEqual(plansBefore)
    expect(await s.repos.recipes.getAll()).toEqual(recipesBefore)
    const v = await loadDayFood(s, D)
    expect(v.slots[1]!.planned_recipe?.items.some(i => i.food_id === F.chicken)).toBe(true) // plan sigue diciendo pollo
    expect(v.slots[1]!.consumed_estimate?.items.find(i => i.substituted_for === F.chicken)?.food_id).toBe(F.tuna)
    await expect(logMeal(s, { date: D, slot: 'snack', status: 'substituted', substitutions: [{ food_id: F.chicken, substitute_food_id: F.tuna, portions: 1 }] }, ISO('17:00'))).rejects.toMatchObject({ code: 'not_allowed' })
    await expect(logMeal(s, { date: D, slot: 'snack', status: 'substituted', substitutions: [{ food_id: F.iso, substitute_food_id: 'food_nope', portions: 1 }] }, ISO('17:00'))).rejects.toMatchObject({ code: 'not_found' })
    s.close()
  })
  it('emergency (solo recetas de emergencia), skipped y upsert por slot; múltiples slots', async () => {
    const s = await fresh('nu_emerg')
    await expect(logMeal(s, { date: D, slot: 'dinner', status: 'emergency', recipe_id: R.lunchChicken }, ISO('20:00'))).rejects.toMatchObject({ code: 'not_allowed' })
    const e = await logMeal(s, { date: D, slot: 'dinner', status: 'emergency', recipe_id: R.emergency, note: 'llegué tarde' }, ISO('20:00'))
    expect(e.log.recipe_id).toBe(R.emergency)
    expect(e.log.note).toBe('llegué tarde')
    expect(e.log.est_complete).toBe(false) // lleva ISO
    const sk = await logMeal(s, { date: D, slot: 'snack', status: 'skipped' }, ISO('17:00'))
    expect(sk.log.recipe_id).toBeUndefined()
    const again = await logMeal(s, { date: D, slot: 'dinner', status: 'planned' }, ISO('21:00'))
    expect(again.log.id).toBe(e.log.id)
    expect(again.created).toBe(false)
    expect(await s.repos.meal_logs.count()).toBe(2)
    s.close()
  })
})

describe('proteína del día y de ayer', () => {
  it('suma solo lo calculable; ISO desconocido no es 0; completa ≥160; objetivo 180', async () => {
    const s = await fresh('nu_prot')
    await logMeal(s, { date: D, slot: 'breakfast', status: 'planned' }, ISO('06:40')) // licuado con ISO → desconocida
    await logMeal(s, { date: D, slot: 'lunch', status: 'planned' }, ISO('14:10')) // pollo ≈ 66
    let v = await loadDayFood(s, D)
    expect(v.protein.is_lower_bound).toBe(true)
    expect(v.protein.estimate.unknown_meals).toBe(1)
    expect(v.protein.consumed_g).toBe(v.slots[1]!.consumed_estimate!.protein_g)
    expect(v.protein.estimate.status).toBe('unknown')
    await logOffPlan(s, { date: D, slot: 'snack', protein_g: 50 }, ISO('17:00'))
    await logOffPlan(s, { date: D, slot: 'dinner', protein_g: 60 }, ISO('20:00'))
    v = await loadDayFood(s, D)
    expect(v.protein.consumed_g).toBeGreaterThanOrEqual(160)
    expect(v.protein.estimate.status).toBe('complete')
    expect(v.protein.remaining_to_floor).toBe(0)
    expect(v.protein.remaining_to_target).toBeGreaterThan(0)
    s.close()
  })
  it('null ≠ 0: Me salí sin proteína deja la comida desconocida; con cifra se cuenta', async () => {
    const s = await fresh('nu_null')
    await logOffPlan(s, { date: D, slot: 'lunch', protein_g: null, note: 'tacos' }, ISO('14:00'))
    let v = await loadDayFood(s, D)
    expect(v.protein.consumed_g).toBeNull()
    expect(v.slots[1]!.log?.off_plan_protein_g).toBeNull()
    expect(v.slots[1]!.log?.note).toBe('tacos')
    await logOffPlan(s, { date: D, slot: 'dinner', protein_g: 35 }, ISO('20:00'))
    v = await loadDayFood(s, D)
    expect(v.protein.consumed_g).toBe(35)
    expect(v.protein.is_lower_bound).toBe(true)
    s.close()
  })
  it('adherencia (check-in) y proteína (MealLog) son independientes en la vista de ayer', async () => {
    const s = await fresh('nu_adh')
    await saveCheckIn(s, D, { food_yesterday: 'off' }, ISO('06:30'))
    await logOffPlan(s, { date: '2026-10-06', slot: 'lunch', protein_g: 100 }, ISO('14:00', '2026-10-06'))
    await logOffPlan(s, { date: '2026-10-06', slot: 'dinner', protein_g: 70 }, ISO('20:00', '2026-10-06'))
    const v = await loadDayFood(s, D)
    expect(v.yesterday.adherence).toBe('low')
    expect(v.yesterday.protein_complete).toBe(true)
    s.close()
  })
})

describe('equivalentes', () => {
  it('devuelve solo equivalentes registrados, por prioridad; sin registro → vacío', async () => {
    const s = await fresh('nu_eq')
    const opts = await equivalentOptions(s, F.chicken)
    expect(opts.map(o => o.food.id)).toEqual([F.porkLoin, F.chickenCan, F.tuna, F.beefSteak])
    expect(opts[0]!.equivalent.ratio).toBe(1)
    expect(await equivalentOptions(s, F.creatine)).toEqual([])
    expect(await equivalentOptions(s, 'food_inventado')).toEqual([])
    s.close()
  })
})

describe('inventario', () => {
  it('estados por porciones: >2 disponible, ≤2 queda poco, ≤0 agotado', () => {
    expect(inventoryStatus(3)).toBe('available')
    expect(inventoryStatus(2.5)).toBe('available')
    expect(inventoryStatus(2)).toBe('low')
    expect(inventoryStatus(0.5)).toBe('low')
    expect(inventoryStatus(0)).toBe('out')
    expect(inventoryStatus(-1)).toBe('out')
  })
  it('fijar porciones y estado; consumo coherente al registrar; no toca alimentos sin inventario', async () => {
    const s = await fresh('nu_inv')
    const a = await setInventoryPortions(s, F.chicken, 13, ISO('08:00'), true)
    expect(a.status).toBe('available')
    expect(a.last_restock_at).toBe(ISO('08:00'))
    const low = await setInventoryStatus(s, F.rice, 'low', ISO('08:01'))
    expect(low.portions_left).toBe(2)
    const out = await setInventoryStatus(s, F.beans, 'out', ISO('08:02'))
    expect(out.portions_left).toBe(0)
    // registrar la comida (pollo 1, arroz 1, frijoles 1, ensalada 1, aguacate 1)
    const r = await logMeal(s, { date: D, slot: 'lunch', status: 'planned' }, ISO('14:00'))
    const upd = Object.fromEntries(r.inventory_updated.map(i => [i.food_id, i.portions_left]))
    expect(upd[F.chicken]).toBe(12)
    expect(upd[F.rice]).toBe(1)
    expect(upd[F.beans]).toBe(0) // no baja de 0
    expect(r.inventory_untracked).toEqual(expect.arrayContaining([F.salad, F.avocado]))
    expect(await s.repos.inventory_items.count()).toBe(3) // no se crearon
    // re-registrar el mismo slot no vuelve a descontar
    await logMeal(s, { date: D, slot: 'lunch', status: 'planned' }, ISO('14:30'))
    expect((await s.repos.inventory_items.whereEquals('food_id', F.chicken))[0]!.portions_left).toBe(12)
    // omitir no consume
    await setInventoryPortions(s, F.tuna, 5, ISO('16:00'))
    await logMeal(s, { date: D, slot: 'dinner', status: 'skipped' }, ISO('20:00'))
    expect((await s.repos.inventory_items.whereEquals('food_id', F.tuna))[0]!.portions_left).toBe(5)
    await removeInventory(s, F.tuna, ISO('21:00'))
    expect((await s.repos.inventory_items.getLive()).some(i => i.food_id === F.tuna)).toBe(false)
    await expect(setInventoryPortions(s, 'food_nope', 1, ISO('21:00'))).rejects.toMatchObject({ code: 'not_found' })
    s.close()
  })
})

describe('adaptación según inventario', () => {
  it('propone equivalente solo si el inventario registrado dice que falta; marca ADAPTADA al registrar; plan intacto', async () => {
    const s = await fresh('nu_adapt')
    await setInventoryStatus(s, F.chicken, 'out', ISO('08:00'))
    await setInventoryPortions(s, F.porkLoin, 4, ISO('08:00'))
    const v = await loadDayFood(s, D)
    const lunch = v.slots[1]!
    expect(lunch.adaptation).not.toBeNull()
    expect(lunch.adaptation!.missing).toEqual([F.chicken])
    expect(lunch.adaptation!.substitutions).toEqual([{ food_id: F.chicken, substitute_food_id: F.porkLoin, portions: 1 }])
    expect(lunch.adaptation!.unresolved).toEqual([])
    // sin inventario de arroz etc. no se toca nada más
    const r = await logMeal(s, { date: D, slot: 'lunch', status: 'adapted', substitutions: lunch.adaptation!.substitutions }, ISO('14:00'))
    expect(r.log.status).toBe('adapted')
    expect((await s.repos.inventory_items.whereEquals('food_id', F.porkLoin))[0]!.portions_left).toBe(3)
    expect((await s.repos.meal_plans.getLive()).find(p => p.weekday === 3 && p.slot === 'lunch')!.recipe_id).toBe(R.lunchChicken)
    expect((await s.repos.recipes.get(R.lunchChicken))!.items[0]!.food_id).toBe(F.chicken)
    s.close()
  })
  it('sin equivalente válido → unresolved (no inventa); alimento sin inventario registrado no se adapta', () => {
    const foods = [{ id: 'a' }, { id: 'b' }].map(f => ({ ...f, name: f.id, category: 'protein', portion_label: 'x', nutrition_status: 'missing', store: 'super', purchase_unit: 'u', portions_per_unit: 1, lactose_free: true, created_at: '', updated_at: '', source: 'system' }) as never)
    const inv = [{ id: 'i', food_id: 'a', portions_left: 0, status: 'out', created_at: '', updated_at: '', source: 'user' }] as never
    const r1 = adaptRecipeToInventory({ items: [{ food_id: 'a', portions: 1 }, { food_id: 'b', portions: 1 }] }, inv, [], foods)
    expect(r1.missing).toEqual(['a'])
    expect(r1.unresolved).toEqual(['a'])
    expect(r1.substitutions).toEqual([])
    const eq = [{ id: 'e', food_id: 'a', substitute_food_id: 'zzz', ratio: 1, priority: 1, created_at: '', updated_at: '', source: 'system' }] as never
    expect(adaptRecipeToInventory({ items: [{ food_id: 'a', portions: 1 }] }, inv, eq, foods).unresolved).toEqual(['a']) // sustituto inexistente
  })
})

describe('lista de compras', () => {
  it('necesario − inventario por horizonte (Costco 30 / súper 14 / mercado 7) con reserva; sin productos ficticios', async () => {
    const s = await fresh('nu_shop')
    await setInventoryPortions(s, F.chicken, 10, ISO('08:00'))
    const needs = await previewNeeds(s)
    const chicken = needs.find(n => n.food_id === F.chicken)!
    expect(chicken.store).toBe('costco')
    expect(chicken.horizon_days).toBe(30)
    // pollo: comida lun/mié/vie (3) + cena mié/vie (2) = 5 porciones/semana → 5 × 30/7 × 1.1 = 23.57 → 24
    expect(chicken.weekly_portions).toBe(5)
    expect(chicken.needed_portions).toBe(24)
    expect(chicken.have_portions).toBe(10)
    expect(chicken.missing_portions).toBe(14)
    expect(chicken.buy_units).toBe(2) // bolsa de 13 porciones
    expect(chicken.have_known).toBe(true)
    const tortilla = needs.find(n => n.food_id === F.tortilla)!
    expect(tortilla.store).toBe('market')
    expect(tortilla.horizon_days).toBe(7)
    expect(tortilla.have_known).toBe(false)
    expect(tortilla.reason).toContain('sin inventario registrado')
    const iso = needs.find(n => n.food_id === F.iso)!
    expect(iso.horizon_days).toBe(14) // súper
    expect(needs.every(n => n.weekly_portions > 0)).toBe(true) // solo alimentos del plan
    expect(needs.some(n => n.food_id === F.apple)).toBe(false) // la manzana no está en ningún plan: no se inventa compra
    expect(needs.some(n => n.food_id === F.tostadas)).toBe(true)
    s.close()
  })
  it('genera la lista persistida, cierra la anterior, permite marcar; necesidad cubierta no aparece', async () => {
    const s = await fresh('nu_list')
    await setInventoryPortions(s, F.chicken, 100, ISO('08:00'))
    const v1 = await generateShoppingList(s, ISO('09:00'))
    expect(v1.list?.status).toBe('open')
    expect(v1.list?.horizons).toEqual({ costco: 30, super: 14, market: 7 })
    expect(v1.items.some(i => i.food.id === F.chicken)).toBe(false)
    expect(v1.items.length).toBeGreaterThan(10)
    await toggleShoppingItem(s, v1.items[0]!.item.id, true, ISO('10:00'))
    expect((await loadShopping(s)).items.find(i => i.item.id === v1.items[0]!.item.id)!.item.checked).toBe(true)
    const v2 = await generateShoppingList(s, ISO('11:00'))
    expect(v2.list!.id).not.toBe(v1.list!.id)
    expect((await s.repos.shopping_lists.whereEquals('status', 'open'))).toHaveLength(1)
    s.close()
  })
  it('reserva y horizontes puros', () => {
    const foods = [{ id: 'x', store: 'super', portions_per_unit: 4, purchase_unit: 'u' }] as never
    const recipes = [{ id: 'r', items: [{ food_id: 'x', portions: 1 }] }] as never
    const plans = [0, 1, 2, 3, 4, 5, 6].map(w => ({ id: `p${w}`, weekday: w, slot: 'lunch', recipe_id: 'r' })) as never
    const n = computeNeeds({ mealPlans: plans, recipes, foods, inventory: [], horizons: { costco: 30, super: 14, market: 7 }, reserve_pct: 0 })[0]!
    expect(n.needed_portions).toBe(14)
    expect(n.buy_units).toBe(4)
    const n2 = computeNeeds({ mealPlans: plans, recipes, foods, inventory: [], horizons: { costco: 30, super: 14, market: 7 }, reserve_pct: 50 })[0]!
    expect(n2.needed_portions).toBe(21)
  })
})

describe('alimentos', () => {
  it('Mutant ISO sin datos: estimaciones desconocidas; con etiqueta capturada por Dany pasa a verified y se calcula', async () => {
    const s = await fresh('nu_iso')
    const iso = (await s.repos.foods.get(F.iso))!
    expect(iso.nutrition_status).toBe('missing')
    expect(iso.protein_g).toBeUndefined()
    await logMeal(s, { date: D, slot: 'snack', status: 'planned' }, ISO('17:00')) // shaker ISO
    let v = await loadDayFood(s, D)
    expect(v.slots[2]!.consumed_estimate?.protein_g).toBeNull()
    expect(v.protein.consumed_g).toBeNull()
    const upd = await updateFood(s, F.iso, { protein_g: 27, kcal: 120, carb_g: 2, fat_g: 1, nutrition_status: 'verified' }, ISO('18:00'))
    expect(upd.nutrition_status).toBe('verified')
    expect(upd.source).toBe('user')
    v = await loadDayFood(s, D)
    expect(v.slots[2]!.consumed_estimate?.protein_g).toBeGreaterThan(27)
    expect(v.protein.consumed_g).toBe(v.slots[2]!.consumed_estimate?.protein_g)
    s.close()
  })
  it('edición con validación; quitar la proteína vuelve a desconocido (nunca 0)', async () => {
    const s = await fresh('nu_food')
    const e = await updateFood(s, F.egg, { protein_g: 6.3, kcal: 72 }, ISO('08:00'))
    expect(e.protein_g).toBe(6.3)
    expect(e.nutrition_status).toBe('estimated') // no cambió el estado existente
    await expect(updateFood(s, F.egg, { protein_g: -1 }, ISO('08:01'))).rejects.toMatchObject({ code: 'validation' })
    await expect(updateFood(s, F.egg, { portions_per_unit: 0 }, ISO('08:01'))).rejects.toMatchObject({ code: 'validation' })
    const unknown = await updateFood(s, F.egg, { protein_g: undefined }, ISO('08:02'))
    expect(unknown.nutrition_status).toBe('missing')
    expect(unknown.protein_g).toBeUndefined()
    expect(unknown.kcal).toBeUndefined()
    await expect(updateFood(s, 'food_nope', { name: 'x' }, ISO('08:03'))).rejects.toMatchObject({ code: 'not_found' })
    s.close()
  })
})

describe('ME SALÍ', () => {
  it('varias comidas fuera de plan en el día; slot, proteína estimada o null y nota', async () => {
    const s = await fresh('nu_off')
    await logOffPlan(s, { date: D, slot: 'breakfast', protein_g: null, note: 'pan dulce' }, ISO('07:00'))
    await logOffPlan(s, { date: D, slot: 'lunch', protein_g: 45, note: 'carnitas' }, ISO('14:30'))
    await logOffPlan(s, { date: D, slot: 'dinner', protein_g: 30 }, ISO('21:00'))
    const v = await loadDayFood(s, D)
    expect(v.slots.filter(x => x.log?.status === 'off_plan')).toHaveLength(3)
    expect(v.protein.consumed_g).toBe(75)
    expect(v.protein.is_lower_bound).toBe(true)
    expect(v.slots[0]!.log?.note).toBe('pan dulce')
    // registrar "comí esto" después NO pisa un off_plan de otro slot
    await logMeal(s, { date: D, slot: 'snack', status: 'planned' }, ISO('17:00'))
    const v2 = await loadDayFood(s, D)
    expect(v2.slots[1]!.log?.status).toBe('off_plan')
    expect(v2.slots[1]!.log?.off_plan_protein_g).toBe(45)
    s.close()
  })
})
