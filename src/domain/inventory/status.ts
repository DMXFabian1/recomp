/**
 * Inventario (Fase 8.7). Pura. Estado derivado de porciones: > 2 disponible · ≤ 2 queda poco · ≤ 0 agotado.
 * No existe "cantidad desconocida": si un alimento no tiene InventoryItem, simplemente no se sabe y no se inventa.
 */
import type { InventoryItem, InventoryStatus, RecipeItem } from '@domain/entities'

export const LOW_THRESHOLD_PORTIONS = 2

export function inventoryStatus(portions_left: number): InventoryStatus {
  if (portions_left <= 0) return 'out'
  if (portions_left <= LOW_THRESHOLD_PORTIONS) return 'low'
  return 'available'
}

/** Porciones representativas al fijar un estado a mano (sin cantidad conocida): no es una medida, es un marcador. */
export function portionsForStatus(status: InventoryStatus, current?: number): number {
  if (status === 'out') return 0
  if (status === 'low') return current !== undefined && current > 0 && current <= LOW_THRESHOLD_PORTIONS ? current : LOW_THRESHOLD_PORTIONS
  return current !== undefined && current > LOW_THRESHOLD_PORTIONS ? current : LOW_THRESHOLD_PORTIONS + 1
}

export interface ConsumeResult {
  updated: InventoryItem[]
  /** Alimentos de la comida sin inventario registrado: no se tocan ni se crean. */
  untracked: string[]
}

/** Descuenta porciones de los alimentos que SÍ tienen inventario. Devuelve copias; no muta. */
export function consumeInventory(items: InventoryItem[], consumed: RecipeItem[], at: string): ConsumeResult {
  const byFood = new Map(items.filter(i => !i.deleted_at).map(i => [i.food_id, i]))
  const updated: InventoryItem[] = []
  const untracked: string[] = []
  for (const c of consumed) {
    const inv = byFood.get(c.food_id)
    if (!inv) { untracked.push(c.food_id); continue }
    const left = Math.max(0, Math.round((inv.portions_left - c.portions) * 100) / 100)
    updated.push({ ...inv, portions_left: left, status: inventoryStatus(left), updated_at: at })
  }
  return { updated, untracked }
}
