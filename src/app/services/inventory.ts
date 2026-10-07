/**
 * Inventario — Fase 8.7. Un InventoryItem por alimento (índice único &food_id). Estado derivado de porciones.
 * Marcar DISPONIBLE / QUEDA POCO / AGOTADO sin cantidad fija un marcador (3 / 2 / 0 porciones), nunca una medida inventada.
 */
import { ulid } from 'ulid'
import type { InventoryItem, InventoryStatus } from '@domain/entities'
import { inventoryStatus, portionsForStatus } from '@domain/inventory/status'
import { validateEntity } from '@domain/validation/entities'
import { AppError } from '@domain/errors'
import type { Storage } from '@repo/index'

export async function setInventoryPortions(storage: Storage, foodId: string, portions: number, now: string, restock = false): Promise<InventoryItem> {
  return storage.run(['inventory_items', 'foods'], async repos => {
    if (!(await repos.foods.get(foodId))) throw new AppError('not_found', 'El alimento no existe.')
    const existing = (await repos.inventory_items.whereEquals('food_id', foodId)).find(i => !i.deleted_at)
    const left = Math.max(0, portions)
    const row: InventoryItem = {
      id: existing?.id ?? ulid(), created_at: existing?.created_at ?? now, updated_at: now, source: 'user',
      food_id: foodId, portions_left: left, status: inventoryStatus(left),
      ...(existing?.last_restock_at ? { last_restock_at: existing.last_restock_at } : {}),
      ...(restock ? { last_restock_at: now } : {}),
      ...(existing?.expires_at ? { expires_at: existing.expires_at } : {}),
    }
    const v = validateEntity('inventory_items', row)
    if (!v.ok) throw new AppError('validation', v.issues.map(i => `${i.path}: ${i.message}`).join('; '))
    await repos.inventory_items.put(row)
    return row
  })
}

export async function setInventoryStatus(storage: Storage, foodId: string, status: InventoryStatus, now: string): Promise<InventoryItem> {
  const existing = (await storage.repos.inventory_items.whereEquals('food_id', foodId)).find(i => !i.deleted_at)
  return setInventoryPortions(storage, foodId, portionsForStatus(status, existing?.portions_left), now)
}

export async function removeInventory(storage: Storage, foodId: string, now: string): Promise<void> {
  const existing = (await storage.repos.inventory_items.whereEquals('food_id', foodId)).find(i => !i.deleted_at)
  if (existing) await storage.run(['inventory_items'], repos => repos.inventory_items.softDelete(existing.id, now))
}
