/**
 * "ME SALÍ" — Fase 8.5. Registro rápido de una comida fuera del plan: MealLog status 'off_plan' con proteína
 * aproximada opcional (null = "no sé") y nota breve. Upsert por [date+slot]. No toca alimentos ni inventario.
 */
import { ulid } from 'ulid'
import type { DayString, MealLog, MealSlot, Schedule } from '@domain/entities'
import type { Storage } from '@repo/index'

export interface OffPlanInput {
  date: DayString
  slot: MealSlot
  protein_g: number | null
  note?: string
}

export async function logOffPlan(storage: Storage, input: OffPlanInput, now: string): Promise<MealLog> {
  return storage.run(['meal_logs'], async repos => {
    const existing = (await repos.meal_logs.whereEquals('date', input.date)).find(l => l.slot === input.slot && !l.deleted_at)
    const row: MealLog = {
      id: existing?.id ?? ulid(), created_at: existing?.created_at ?? now, updated_at: now, source: 'user',
      date: input.date, slot: input.slot, status: 'off_plan', est_complete: false,
      off_plan_protein_g: input.protein_g, logged_at: now,
      ...(input.protein_g !== null ? { protein_g_est: input.protein_g } : {}),
    }
    await repos.meal_logs.put(row)
    return row
  })
}

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner']

/** Slot más probable según la hora local y el horario de Settings (solo preselección; el usuario cambia). */
export function slotForTime(hhmm: string, schedule: Schedule): MealSlot {
  const t = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
  const m = t(hhmm)
  if (m < t(schedule.lunch) - 60) return 'breakfast'
  if (m < t(schedule.snack) - 30) return 'lunch'
  if (m < t(schedule.dinner) - 30) return 'snack'
  return 'dinner'
}
