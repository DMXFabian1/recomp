/**
 * Cardio / remo — Fase 8.6. Registro simple e independiente de la fuerza.
 * Presets (del modelo existente): zona 2 en Concept2 20/25/30 min; intervalos 6×1 / 8×1.
 * Guía de intensidad: talk test / RPE 1–10. No se inventan zonas fisiológicas ni se interpreta VO2max.
 * Prueba mensual = 10 min (MonthlyTest, uno por mes; índice único &month).
 */
import { ulid } from 'ulid'
import type { CardioPreset, CardioSession, DayString, MonthlyTest } from '@domain/entities'
import { AppError } from '@domain/errors'
import { validateEntity } from '@domain/validation/entities'
import type { Storage } from '@repo/index'

export const CARDIO_PRESETS: Array<{ id: CardioPreset; label: string; duration_s: number; hint: string }> = [
  { id: 'z2_20', label: 'Zona 2 · 20 min', duration_s: 1200, hint: 'Puedes hablar en frases completas (RPE 3–4).' },
  { id: 'z2_25', label: 'Zona 2 · 25 min', duration_s: 1500, hint: 'Puedes hablar en frases completas (RPE 3–4).' },
  { id: 'z2_30', label: 'Zona 2 · 30 min', duration_s: 1800, hint: 'Puedes hablar en frases completas (RPE 3–4).' },
  { id: 'intervals_6x1', label: 'Intervalos 6×1 min', duration_s: 6 * 120, hint: '1 min fuerte / 1 min suave (RPE 7–8 en el fuerte).' },
  { id: 'intervals_8x1', label: 'Intervalos 8×1 min', duration_s: 8 * 120, hint: '1 min fuerte / 1 min suave (RPE 7–8 en el fuerte).' },
]

export const MONTHLY_TEST_DURATION_S = 600

export interface CardioInput {
  date: DayString
  modality: CardioSession['modality']
  preset?: CardioPreset
  duration_s: number
  distance_m?: number
  rpe: number
  note?: string
  split_s_per_500m?: number
  spm?: number
  hr_avg?: number
}

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T
}

export async function logCardio(storage: Storage, input: CardioInput, now: string): Promise<CardioSession> {
  return storage.run(['cardio_sessions'], async repos => {
    const row: CardioSession = { id: ulid(), created_at: now, updated_at: now, source: 'user', ...clean(input) }
    const v = validateEntity('cardio_sessions', row)
    if (!v.ok) throw new AppError('validation', `Cardio inválido: ${v.issues.map(i => `${i.path}: ${i.message}`).join('; ')}`)
    await repos.cardio_sessions.put(row)
    return row
  })
}

export interface MonthlyTestInput {
  date: DayString
  distance_m: number
  duration_s?: number
  spm?: number
  hr_avg?: number
  watts_avg?: number
  note?: string
  /** Si ya hay prueba ese mes, reemplazarla explícitamente. */
  replace?: boolean
}

/** Split medio por 500 m derivado de distancia y duración (aritmética, no interpretación fisiológica). */
export function splitFor(distance_m: number, duration_s: number): number {
  return Math.round((duration_s / (distance_m / 500)) * 10) / 10
}

export async function logMonthlyTest(storage: Storage, input: MonthlyTestInput, now: string): Promise<MonthlyTest> {
  return storage.run(['monthly_tests', 'cardio_sessions'], async repos => {
    const month = input.date.slice(0, 7)
    const duration = input.duration_s ?? MONTHLY_TEST_DURATION_S
    const existing = (await repos.monthly_tests.whereEquals('month', month)).find(t => !t.deleted_at)
    if (existing && !input.replace) throw new AppError('conflict', `Ya hay una prueba registrada en ${month}. Confirma si quieres reemplazarla.`)
    const row: MonthlyTest = clean({
      id: existing?.id ?? ulid(), created_at: existing?.created_at ?? now, updated_at: now, source: 'user',
      date: input.date, month, duration_s: duration, distance_m: input.distance_m, split_avg_s: splitFor(input.distance_m, duration),
      spm: input.spm, hr_avg: input.hr_avg, watts_avg: input.watts_avg,
    })
    const v = validateEntity('monthly_tests', row)
    if (!v.ok) throw new AppError('validation', `Prueba inválida: ${v.issues.map(i => `${i.path}: ${i.message}`).join('; ')}`)
    await repos.monthly_tests.put(row)
    // La nota va en una CardioSession asociada (MonthlyTest no tiene nota): actividad diferenciada 'row' con RPE 10.
    if (input.note) {
      await repos.cardio_sessions.put({ id: ulid(), created_at: now, updated_at: now, source: 'user', date: input.date, modality: 'row', duration_s: duration, distance_m: input.distance_m, rpe: 10, note: `[Prueba mensual] ${input.note}` })
    }
    return row
  })
}
