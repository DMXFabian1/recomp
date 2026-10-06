/**
 * Redondeo de cargas (Fase 8.4). Regla del dominio: toda carga sugerida es múltiplo de increment_kg del ejercicio.
 *
 * roundToIncrement(load, inc):
 *   inc > 0 → múltiplo de inc más cercano a load; en empate exacto (x.5 incrementos) se redondea hacia ABAJO.
 *   inc = 0 (peso corporal) → load sin redondear (a 2 decimales).
 *
 * roundDeload(target, inc, current)  — target = current × DELOAD_FACTOR:
 *   1. next = roundToIncrement(target, inc).
 *   2. Si inc > 0 y next ≥ current → next = current − inc (la descarga debe quedar ESTRICTAMENTE por debajo).
 *   3. next = max(0, next): nunca negativa.
 *   Garantías (testeadas): determinista; next ≤ current; next < current siempre que current > 0 e inc > 0;
 *   next es múltiplo de inc (no de 2.5: del incremento configurado). Con inc = 0 (peso corporal) la descarga
 *   no tiene sentido físico: devuelve target redondeado a 2 decimales (y 0 si current es 0).
 */
export function roundToIncrement(load: number, increment: number): number {
  if (!(increment > 0)) return round2(load)
  const n = load / increment
  const floor = Math.floor(n)
  const frac = n - floor
  const mult = frac > 0.5 + 1e-9 ? floor + 1 : floor
  return round2(mult * increment)
}

export function roundDeload(target: number, increment: number, current: number): number {
  let next = roundToIncrement(target, increment)
  if (increment > 0 && next >= current) next = round2(current - increment)
  return Math.max(0, next)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
