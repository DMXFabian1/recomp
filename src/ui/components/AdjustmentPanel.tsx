/**
 * Ajustes — Fase 8.9. Bloque SECUNDARIO en MÁS. Muestra la Recommendation pending (qué, por qué, evidencia, qué cambia,
 * qué no cambia) con [ACEPTAR CAMBIO]/[IGNORAR], y el estado de la ventana de evaluación. Nunca aplica nada sola.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Recommendation } from '@domain/entities'
import { isAppError } from '@domain/errors'
import { localDay } from '@domain/time/day'
import { acceptRecommendation, evaluateAdjustmentWindow, ignoreRecommendation, loadPendingRecommendation, type EvaluationReport } from '@app/services'
import { useApp } from '../AppContext'
import { RULE_LABEL, METRIC_LABEL } from '../labels'

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/** `onSettled`: avisa cuando la evaluación o una decisión terminaron de escribir (8.10: el reporte se regenera). */
export function AdjustmentPanel({ onSettled }: { onSettled?: () => void } = {}) {
  const { storage } = useApp()
  const [today] = useState(() => localDay(new Date()))
  const [report, setReport] = useState<EvaluationReport | null>(null)
  const [pending, setPending] = useState<Recommendation | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    evaluateAdjustmentWindow(storage, today, new Date().toISOString())
      .then(r => { setReport(r); return loadPendingRecommendation(storage) })
      .then(p => { setPending(p); onSettled?.() })
      .catch((e: unknown) => setMsg(isAppError(e) ? e.message : 'No se pudo evaluar.'))
  }, [storage, today, onSettled])
  useEffect(() => { refresh() }, [refresh])

  const decide = (kind: 'accept' | 'ignore') => {
    if (!pending) return
    setBusy(true)
    const now = new Date().toISOString()
    const p = kind === 'accept' ? acceptRecommendation(storage, pending.id, today, now) : ignoreRecommendation(storage, pending.id, now)
    p.then(r => {
      setMsg(r.ok ? (kind === 'accept' ? `Cambio aplicado desde ${fmtDate(today)}.` : 'Recomendación ignorada. Settings sin cambios.') : r.reason === 'already_decided' ? 'Esta recomendación ya fue decidida.' : 'Cambio no soportado.')
      refresh()
    }).catch((e: unknown) => setMsg(isAppError(e) ? e.message : 'No se pudo guardar.')).finally(() => setBusy(false))
  }

  const change = pending?.proposed_change
  const s = report?.settings
  return (
    <div className="card">
      <div className="eyebrow">Ajustes · cada 14 días</div>
      {msg && <div className="muted">{msg}</div>}
      {pending && change && s ? (
        <>
          <div className="big">{change.type === 'kcal' ? `${sign(change.delta)} kcal` : `${sign(change.delta)} pasos`}</div>
          <div className="muted">Regla: {RULE_LABEL[pending.rule_id ?? 'weight_loss_too_fast']} · ventana {pending.evaluation_period_start ? fmtDate(pending.evaluation_period_start) : '—'} → {pending.evaluation_period_end ? fmtDate(pending.evaluation_period_end) : '—'}</div>
          <p style={{ margin: '4px 0' }}>{pending.rationale}</p>
          <dl className="kv">
            {(pending.evidence ?? []).map(e => (
              <span key={e.metric} style={{ display: 'contents' }}>
                <dt>{METRIC_LABEL[e.metric] ?? e.metric}</dt>
                <dd>{e.observed === null ? 'sin datos' : e.observed}{e.threshold !== null ? ` · umbral ${e.threshold}` : ''}</dd>
              </span>
            ))}
            <dt>Cambia</dt>
            <dd>{change.type === 'kcal' ? `kcal ${s.kcal_target} → ${s.kcal_target + change.delta}` : `pasos ${s.steps_target} → ${s.steps_target + change.delta}`}</dd>
            <dt>No cambia</dt>
            <dd>{change.type === 'kcal' ? `pasos ${s.steps_target}, ` : `kcal ${s.kcal_target}, `}proteína {s.protein_target_g} g, programa, cargas</dd>
          </dl>
          <button className="btn" disabled={busy} onClick={() => decide('accept')}>ACEPTAR CAMBIO</button>
          <button className="btn secondary" disabled={busy} onClick={() => decide('ignore')}>IGNORAR</button>
        </>
      ) : report ? (
        <dl className="kv">
          <dt>Ventana</dt>
          <dd>{report.window.kind === 'ready' ? `${fmtDate(report.window.window.start)} → ${fmtDate(report.window.window.end)}` : `cierra ${fmtDate(report.window.next_end)} · faltan ${report.window.days_remaining} d`}</dd>
          <dt>Resultado</dt>
          <dd>{report.skipped === 'window_incomplete' ? 'ventana incompleta' : report.outcome?.decided_by ? RULE_LABEL[report.outcome.decided_by] : 'sin regla aplicable'}</dd>
          {report.outcome && (
            <>
              <dt>Pérdida/sem</dt><dd>{report.inputs?.weight.loss_pct_week === null || report.inputs?.weight.loss_pct_week === undefined ? 'sin datos' : `${report.inputs.weight.loss_pct_week} %`}</dd>
              <dt>Adherencia</dt><dd>{report.inputs?.adherence.pct == null ? `sin datos (${report.inputs?.adherence.answered ?? 0}/14)` : `${report.inputs.adherence.pct} %`}</dd>
              <dt>Alertas nuevas</dt><dd>{report.alerts_created}</dd>
            </>
          )}
          <dt>Vigente desde</dt><dd>{s ? `${fmtDate(s.effective_from)} · ${s.kcal_target} kcal · ${s.steps_target} pasos` : '—'}</dd>
        </dl>
      ) : (
        <div className="muted">…</div>
      )}
    </div>
  )
}
