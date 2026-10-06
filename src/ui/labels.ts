import type { WorkoutSession } from '@domain/entities'
export const VERSION_LABEL: Record<WorkoutSession['version'], string> = { full: 'Completa', short: 'Corta', minimal: 'Mínima' }
export function blockLabel(b: string): string {
  return ({ rir_zero_on_basic: 'RIR 0 en básico', pain: 'dolor', technique: 'técnica', short_session: 'sesión corta', minimal_session: 'sesión mínima', substituted: 'sustitución', no_history: 'sin historial' } as Record<string, string>)[b] ?? b
}
