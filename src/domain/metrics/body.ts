/** Cintura y BIA — Fase 8.8. Solo registros tal cual; sin suavizar ni corregir. */
import type { BodyMeasurement, DayString } from '@domain/entities'

export interface WaistPoint { date: DayString; cm: number }

export function waistSeries(measurements: BodyMeasurement[]): WaistPoint[] {
  return measurements
    .filter(m => !m.deleted_at && m.type === 'waist' && typeof m.waist_cm === 'number')
    .map(m => ({ date: m.date, cm: m.waist_cm! }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function latestWaist(measurements: BodyMeasurement[]): WaistPoint | null {
  const s = waistSeries(measurements)
  return s.length > 0 ? s[s.length - 1]! : null
}

export function biaRecords(measurements: BodyMeasurement[]): BodyMeasurement[] {
  return measurements.filter(m => !m.deleted_at && m.type === 'bia').sort((a, b) => (a.date < b.date ? 1 : -1))
}
