/**
 * Alimentos — Fase 8.7. Edición de datos nutricionales con validación Zod.
 * Lo que Dany captura queda con source 'user' (BaseEntity) y nutrition_status 'verified' si viene de la etiqueta
 * o 'estimated' si es aproximado; sin macros → 'missing' (Mutant ISO hasta que haya etiqueta).
 */
import type { Food } from '@domain/entities'
import { validateEntity } from '@domain/validation/entities'
import { AppError } from '@domain/errors'
import type { Storage } from '@repo/index'

export type FoodPatch = Partial<Pick<Food, 'name' | 'portion_label' | 'portion_g' | 'protein_g' | 'kcal' | 'fat_g' | 'carb_g' | 'fiber_g' | 'nutrition_status' | 'store' | 'purchase_unit' | 'portions_per_unit' | 'perishable_days' | 'lactose_free' | 'category'>>

export async function updateFood(storage: Storage, foodId: string, patch: FoodPatch, now: string): Promise<Food> {
  return storage.run(['foods'], async repos => {
    const cur = await repos.foods.get(foodId)
    if (!cur || cur.deleted_at) throw new AppError('not_found', 'El alimento no existe.')
    const row: Food = { ...cur, updated_at: now, source: 'user' }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (row as unknown as Record<string, unknown>)[k]
      else (row as unknown as Record<string, unknown>)[k] = v
    }
    // Sin proteína o kcal no hay macros conocidos: el estado vuelve a 'missing' y se borran restos.
    if (row.protein_g === undefined || row.kcal === undefined) {
      row.nutrition_status = 'missing'
      delete row.protein_g; delete row.kcal; delete row.fat_g; delete row.carb_g; delete row.fiber_g
    } else if (row.nutrition_status === 'missing') {
      row.nutrition_status = patch.nutrition_status ?? 'verified'
    }
    const v = validateEntity('foods', row)
    if (!v.ok) throw new AppError('validation', `Alimento inválido: ${v.issues.map(i => `${i.path}: ${i.message}`).join('; ')}`)
    await repos.foods.put(row)
    return row
  })
}

export const NUTRITION_LABEL: Record<Food['nutrition_status'], string> = { verified: 'etiqueta', estimated: 'estimado', missing: 'desconocido' }
