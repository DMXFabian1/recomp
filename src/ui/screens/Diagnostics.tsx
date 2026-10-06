import { useEffect, useState } from 'react'
import type { StorageInfo } from '@repo/index'
import { APP_VERSION } from '@domain/backup/schema'
import { useApp } from '../AppContext'

const fmtMB = (b?: number) => (b === undefined ? '—' : `${(b / 1048576).toFixed(1)} MB`)

/** Diagnóstico: estado del almacenamiento. Es la única pantalla con contenido en la Fase 8.1. */
export function Diagnostics() {
  const { storage, migratedFrom, seed } = useApp()
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    storage.info().then(setInfo).catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
  }, [storage])

  const total = info ? Object.values(info.counts).reduce((a, b) => a + (b ?? 0), 0) : 0

  return (
    <>
      <div className="eyebrow">Diagnóstico</div>
      <h1>Almacenamiento</h1>
      {err && <div className="banner">No se puede leer el estado: {err}</div>}
      <div className="card">
        <div className="big">{info ? `v${info.schema_version}` : '…'}</div>
        <div className="muted">Versión de esquema · app {APP_VERSION}</div>
        <dl className="kv">
          <dt>IndexedDB</dt><dd className={info?.ok ? 'status-ok' : 'status-crit'}>{info ? (info.ok ? 'OK' : 'Error') : '…'}</dd>
          <dt>Persistente</dt><dd>{info ? (info.persisted ? 'sí' : 'no') : '…'}</dd>
          <dt>Uso</dt><dd>{fmtMB(info?.usage_bytes)}</dd>
          <dt>Registros</dt><dd>{info ? total : '…'}</dd>
          <dt>Migrado desde</dt><dd>{migratedFrom === null ? '—' : `v${migratedFrom}`}</dd>
          <dt>Seed</dt><dd>{seed.seeded.length ? `${seed.seeded.length} colecciones` : 'ya existía'}</dd>
        </dl>
      </div>
      {info && (
        <div className="card">
          <div className="eyebrow">Colecciones</div>
          <dl className="kv">
            {Object.entries(info.counts).map(([c, n]) => (
              <span key={c} style={{ display: 'contents' }}><dt>{c}</dt><dd>{n}</dd></span>
            ))}
          </dl>
        </div>
      )}
    </>
  )
}
