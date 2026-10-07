/** Gráfica de línea SVG monocroma (Fase 8.8). Ejes simples, fechas y unidades; sin colores decorativos. */
export interface ChartPoint { date: string; value: number }

export function LineChart({ points, unit, height = 120, decimals = 1 }: { points: ChartPoint[]; unit: string; height?: number; decimals?: number }) {
  if (points.length === 0) return <p className="muted small">Sin datos suficientes</p>
  const W = 320, H = height, padL = 36, padR = 8, padT = 8, padB = 20
  const vals = points.map(p => p.value)
  let min = Math.min(...vals), max = Math.max(...vals)
  if (max - min < 0.5) { min -= 0.5; max += 0.5 }
  const x = (i: number) => padL + (points.length === 1 ? (W - padL - padR) / 2 : (i / (points.length - 1)) * (W - padL - padR))
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const fmt = (s: string) => s.slice(5).replace('-', '/')
  const first = points[0]!, last = points[points.length - 1]!
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${points.length} registros, de ${first.value} a ${last.value} ${unit}`}>
      <line x1={padL} y1={y(max)} x2={W - padR} y2={y(max)} className="grid" />
      <line x1={padL} y1={y(min)} x2={W - padR} y2={y(min)} className="grid" />
      <text x={padL - 4} y={y(max) + 4} textAnchor="end" className="tick">{max.toFixed(decimals)}</text>
      <text x={padL - 4} y={y(min) + 4} textAnchor="end" className="tick">{min.toFixed(decimals)}</text>
      <path d={d} className="line" />
      {points.map((p, i) => <circle key={p.date + i} cx={x(i)} cy={y(p.value)} r={2.5} className="dot" />)}
      <text x={padL} y={H - 4} className="tick">{fmt(first.date)}</text>
      <text x={W - padR} y={H - 4} textAnchor="end" className="tick">{fmt(last.date)}</text>
      <text x={W - padR} y={padT + 10} textAnchor="end" className="tick">{unit}</text>
    </svg>
  )
}
