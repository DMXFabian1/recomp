/**
 * Datos — Fase 8.11. Exportar e importar backups locales. Sin red: File API + Blob + URL.createObjectURL.
 * Importar NUNCA es inmediato: archivo → validación → resumen → confirmar → advertencia → importar y reemplazar.
 * El contenido del backup se muestra solo como texto (React), jamás como HTML ni código.
 */
import { useRef, useState } from 'react'
import { isAppError } from '@domain/errors'
import { localDay } from '@domain/time/day'
import { exportBackup, importBackup, inspectBackup, type BackupSummary, type InspectResult } from '@app/services'
import { useApp } from '../AppContext'

type ImportState =
  | { kind: 'idle' }
  | { kind: 'reading'; file: string }
  | { kind: 'invalid_file'; file: string; message: string }
  | { kind: 'validation_error'; file: string; message: string }
  | { kind: 'ready_to_import'; file: string; summary: BackupSummary; backup: Extract<InspectResult, { ok: true }>['backup']; confirming: boolean }
  | { kind: 'importing'; file: string }
  | { kind: 'success'; file: string; records: number; photos: number }
  | { kind: 'rollback'; file: string; message: string }
  | { kind: 'failure'; file: string; message: string }

const fmtDT = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const mb = (b: number) => `${(b / 1048576).toFixed(2)} MB`

export function DataPanel() {
  const { storage } = useApp()
  const [lastExport, setLastExport] = useState<{ at: string; filename: string; records: number; photos: number; bytes: number } | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [st, setSt] = useState<ImportState>({ kind: 'idle' })
  const input = useRef<HTMLInputElement>(null)

  const onExport = () => {
    setExporting(true); setExportErr(null)
    const now = new Date()
    exportBackup(storage, now.toISOString(), localDay(now))
      .then(r => {
        const url = URL.createObjectURL(new Blob([r.json], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url; a.download = r.filename
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setLastExport({ at: now.toISOString(), filename: r.filename, records: Object.values(r.counts).reduce((x, y) => x + y, 0), photos: r.photos, bytes: r.bytes })
      })
      .catch((e: unknown) => { console.error('[recomp] export', e); setExportErr(isAppError(e) ? e.message : 'No se pudo exportar.') })
      .finally(() => setExporting(false))
  }

  const pick = () => { if (input.current) { input.current.value = ''; input.current.click() } }

  const onFile = (f: File | undefined) => {
    if (!f) return
    setSt({ kind: 'reading', file: f.name })
    f.text()
      .then(text => {
        const r = inspectBackup(text)
        if (r.ok) setSt({ kind: 'ready_to_import', file: f.name, summary: r.summary, backup: r.backup, confirming: false })
        else if (r.stage === 'json' || r.stage === 'envelope') setSt({ kind: 'invalid_file', file: f.name, message: r.message })
        else { console.warn('[recomp] backup inválido', r.issues); setSt({ kind: 'validation_error', file: f.name, message: r.message }) }
      })
      .catch(() => setSt({ kind: 'invalid_file', file: f.name, message: 'No se pudo leer el archivo.' }))
  }

  const onImport = () => {
    if (st.kind !== 'ready_to_import') return
    const { file, backup } = st
    setSt({ kind: 'importing', file })
    importBackup(storage, backup, new Date().toISOString())
      .then(r => {
        if (r.status === 'success') setSt({ kind: 'success', file, records: Object.values(r.counts).reduce((x, y) => x + y, 0), photos: r.photos })
        else if (r.status === 'rolled_back') setSt({ kind: 'rollback', file, message: r.message })
        else setSt({ kind: 'failure', file, message: r.message })
      })
      .catch((e: unknown) => { console.error('[recomp] import', e); setSt({ kind: 'failure', file, message: 'La importación falló antes de modificar datos. Los datos actuales no cambiaron.' }) })
  }

  const busy = st.kind === 'reading' || st.kind === 'importing'
  return (
    <div className="card" data-testid="data-panel">
      <div className="eyebrow">Datos · backup local</div>
      <button className="btn" onClick={onExport} disabled={exporting || busy}>EXPORTAR BACKUP</button>
      {exportErr && <div className="banner">{exportErr}</div>}
      {lastExport && (
        <div className="muted" role="status">Última exportación: {fmtDT(lastExport.at)} · {lastExport.filename} · {lastExport.records} registros · {lastExport.photos} fotos · {mb(lastExport.bytes)}</div>
      )}
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={e => onFile(e.target.files?.[0])} data-testid="backup-file" />
      {(st.kind === 'idle' || st.kind === 'success' || st.kind === 'rollback' || st.kind === 'failure') && (
        <button className="btn secondary" onClick={pick}>IMPORTAR BACKUP</button>
      )}

      {st.kind !== 'idle' && <div className="muted">Archivo: {st.file}</div>}
      {st.kind === 'reading' && <div className="muted" role="status">Leyendo y validando…</div>}
      {(st.kind === 'invalid_file' || st.kind === 'validation_error') && (
        <>
          <div className="banner" role="alert">{st.message}</div>
          <div className="muted">No se modificó nada.</div>
          <button className="btn secondary" onClick={pick}>SELECCIONAR OTRO ARCHIVO</button>
        </>
      )}
      {st.kind === 'ready_to_import' && (
        <>
          <dl className="kv">
            <dt>Fecha del backup</dt><dd>{fmtDT(st.summary.exported_at)}</dd>
            <dt>Schema version</dt><dd>{st.summary.migrated_from !== null ? `${st.summary.migrated_from} → ${st.summary.schema_version}` : st.summary.schema_version}</dd>
            <dt>App</dt><dd>{st.summary.app_version}</dd>
            <dt>Colecciones</dt><dd>{Object.keys(st.summary.counts).length}</dd>
            <dt>Registros</dt><dd>{st.summary.total_records}</dd>
            <dt>Fotos</dt><dd>{st.summary.photos}</dd>
            <dt>Sesiones</dt><dd>{st.summary.counts.workout_sessions ?? 0}</dd>
            <dt>Check-ins</dt><dd>{st.summary.counts.daily_check_ins ?? 0}</dd>
            <dt>Comidas</dt><dd>{st.summary.counts.meal_logs ?? 0}</dd>
            <dt>Recomendaciones</dt><dd>{st.summary.counts.recommendations ?? 0}</dd>
          </dl>
          {st.summary.warnings.length > 0 && (
            <ul className="plain">{st.summary.warnings.map((w, i) => <li key={i} className="muted">Advertencia: {w}</li>)}</ul>
          )}
          {!st.confirming ? (
            <>
              <button className="btn" onClick={() => setSt({ ...st, confirming: true })}>CONFIRMAR IMPORTACIÓN</button>
              <button className="btn secondary" onClick={pick}>SELECCIONAR OTRO ARCHIVO</button>
            </>
          ) : (
            <>
              <div className="banner" role="alert">
                La importación reemplazará los datos actuales de esta aplicación por los datos contenidos en este backup.
                Antes de continuar se creará un backup automático de los datos actuales.
              </div>
              <button className="btn" onClick={onImport}>IMPORTAR Y REEMPLAZAR</button>
              <button className="btn secondary" onClick={() => setSt({ kind: 'failure', file: st.file, message: 'La importación fue cancelada.' })}>CANCELAR</button>
            </>
          )}
        </>
      )}
      {st.kind === 'importing' && <div className="muted" role="status">Importando… no cierres la app.</div>}
      {st.kind === 'success' && (
        <>
          <div className="status-ok" role="status">Importación completa: {st.records} registros y {st.photos} fotos. Se guardó un backup automático de los datos anteriores.</div>
          <button className="btn" onClick={() => window.location.reload()}>RECARGAR APP</button>
        </>
      )}
      {st.kind === 'rollback' && <div className="banner" role="alert">{st.message}</div>}
      {st.kind === 'failure' && <div className="banner" role="alert">{st.message}</div>}
    </div>
  )
}
