/**
 * ENTRENAR — punto de integración mínimo (Fase 8.5). Muestra la sesión abierta si existe.
 * El registro serie a serie, sustitución y finalización llegan en 8.6.
 */
import { useEffect, useState } from 'react'
import type { WorkoutSession, WorkoutTemplate } from '@domain/entities'
import { getOpenSession } from '@app/services'
import { useApp } from '../AppContext'

export function Entrenar() {
  const { storage } = useApp()
  const [open, setOpen] = useState<WorkoutSession | null>(null)
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
  useEffect(() => {
    void (async () => {
      const s = await getOpenSession(storage)
      setOpen(s)
      setTemplate(s ? (await storage.repos.workout_templates.get(s.template_id)) ?? null : null)
    })()
  }, [storage])
  return (
    <>
      <div className="eyebrow">Entrenar</div>
      {open ? (
        <>
          <h1>{template?.name ?? open.template_id}</h1>
          <dl className="kv">
            <dt>Versión</dt><dd>{open.version}</dd>
            <dt>Iniciada</dt><dd>{open.started_at.slice(11, 16)}</dd>
            <dt>Ejercicios</dt><dd>{template ? template.exercises.filter(e => open.version === 'minimal' ? e.in_minimal : open.version === 'short' ? e.in_short : true).length : '—'}</dd>
          </dl>
          <p className="muted">El registro serie a serie y la finalización llegan en la fase 8.6. La rotación no avanza hasta completar.</p>
        </>
      ) : (
        <p className="muted">No hay sesión abierta. Inicia una desde AHORA.</p>
      )}
    </>
  )
}
