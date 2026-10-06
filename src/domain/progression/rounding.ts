/**
 * Redondeo de cargas (Fase 8.4). Regla del dominio: toda carga sugerida es múltiplo del incremento del
 * ejercicio (increment_kg). Si el incremento es 0 (peso corporal) la carga no se redondea.
 *  - roundToIncrement: al múltiplo más cercano (empate hacia abajo).
 *  - roundDeload: múltiplo más cercano a la carga descargada, garantizando que quede ESTRICTAMENTE por debajo
 *    de la carga actual (si el redondeo la devolviera igual, baja un incremento más); nunca negativa.
 */
export function roundToIncrement(load: number, increment: number): number {
  if (!(increment > 0)) return round1(load)
  const n = load / increment
  const floor = Math.floor(n)
  const frac = n - floor
  const mult = frac > 0.5 + 1e-9 ? floor + 1 : floor
  return round1(mult * increment)
}

export function roundDeload(target: number, increment: number, current: number): number {
  let next = roundToIncrement(target, increment)
  if (increment > 0 && next >= current) next = round1(current - increment)
  return Math.max(0, next)
}

function round1(n: number): number {
  return Math.round(n * 100) / 100
}
