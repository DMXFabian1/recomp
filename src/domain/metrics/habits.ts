/**
 * Hábitos — Fase 8.8. Agregaciones descriptivas por día. Sin puntuaciones, rachas ni porcentajes.
 * Adherencia (food_yesterday) y proteína (MealLog) permanecen en columnas separadas.
 * Sueño se guarda por tramos ('<6', '6-7', '7-8', '8+'): se cuenta por tramo; no se inventa una media en horas.
 */
import type { DailyCheckIn, DayString, Food, FoodYesterday, MealLog, Recipe, SleepBucket } from '@domain/entities'
import { addDays } from '@domain/time/day'
import { dayProtein } from '@domain/nutrition/today'

export interface HabitDay {
  date: DayString
  food_yesterday: FoodYesterday | null
  protein_g: number | null
  protein_is_estimate: boolean
  protein_lower_bound: boolean
  sleep: SleepBucket | null
  steps: number | null
  energy: number | null
  hunger: number | null
  mood: number | null
}

export interface HabitSummary {
  days: HabitDay[]
  adherence: Record<FoodYesterday | 'unknown', number>
  sleep: Record<SleepBucket | 'unknown', number>
  steps_avg: number | null
  steps_days: number
  energy_avg: number | null
  hunger_avg: number | null
  mood_avg: number | null
  protein_days: number
  protein_avg: number | null
  protein_days_at_floor: number
}

function avg(xs: number[]): number | null {
  return xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
}

export function habitSummary(input: { checkIns: DailyCheckIn[]; mealLogs: MealLog[]; recipes: Recipe[]; foods: Food[]; endDate: DayString; days: number; target_g: number; floor_g: number }): HabitSummary {
  const start = addDays(input.endDate, -(input.days - 1))
  const ci = new Map(input.checkIns.filter(c => !c.deleted_at).map(c => [c.date, c]))
  const logsByDay = new Map<string, MealLog[]>()
  for (const l of input.mealLogs) if (!l.deleted_at) logsByDay.set(l.date, [...(logsByDay.get(l.date) ?? []), l])
  const days: HabitDay[] = []
  for (let d = start; d <= input.endDate; d = addDays(d, 1)) {
    const c = ci.get(d)
    const logs = logsByDay.get(d) ?? []
    const p = logs.length > 0 ? dayProtein(logs, input.recipes, input.foods, input.target_g, input.floor_g) : null
    days.push({
      date: d, food_yesterday: c?.food_yesterday ?? null,
      protein_g: p?.consumed_g ?? null, protein_is_estimate: p !== null && p.consumed_g !== null, protein_lower_bound: p?.is_lower_bound ?? false,
      sleep: c?.sleep_bucket ?? null, steps: c?.steps_yesterday ?? null,
      energy: c?.energy ?? null, hunger: c?.hunger ?? null, mood: c?.mood ?? null,
    })
    if (d === input.endDate) break
  }
  const adherence = { plan: 0, almost: 0, off: 0, unknown: 0 }
  const sleep = { '<6': 0, '6-7': 0, '7-8': 0, '8+': 0, unknown: 0 }
  for (const d of days) { adherence[d.food_yesterday ?? 'unknown']++; sleep[d.sleep ?? 'unknown']++ }
  const prot = days.filter(d => d.protein_g !== null).map(d => d.protein_g!)
  return {
    days, adherence, sleep,
    steps_avg: avg(days.filter(d => d.steps !== null).map(d => d.steps!)), steps_days: days.filter(d => d.steps !== null).length,
    energy_avg: avg(days.filter(d => d.energy !== null).map(d => d.energy!)),
    hunger_avg: avg(days.filter(d => d.hunger !== null).map(d => d.hunger!)),
    mood_avg: avg(days.filter(d => d.mood !== null).map(d => d.mood!)),
    protein_days: prot.length, protein_avg: avg(prot), protein_days_at_floor: prot.filter(g => g >= input.floor_g).length,
  }
}
