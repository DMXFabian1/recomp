/**
 * Fotos mensuales — Fase 8.8. Blobs en IndexedDB (ProgressPhoto.blob + thumb), una por mes y vista
 * (índice único [month+view]). Todo local: ningún fetch, URL externa, log ni analítica. Las URLs de vista previa
 * (URL.createObjectURL) las crea y revoca la UI.
 */
import { ulid } from 'ulid'
import type { DayString, ProgressPhoto } from '@domain/entities'
import { AppError } from '@domain/errors'
import { validateEntity } from '@domain/validation/entities'
import type { Storage } from '@repo/index'

export const PHOTO_VIEWS = ['front', 'side', 'back'] as const
export type PhotoView = (typeof PHOTO_VIEWS)[number]

export interface PhotoInput {
  date: DayString
  view: PhotoView
  blob: Blob
  thumb: Blob
  width: number
  height: number
}

/** Guarda o reemplaza la foto del mes de `date` para esa vista. Devuelve el registro (sin exponer rutas). */
export async function savePhoto(storage: Storage, input: PhotoInput, now: string): Promise<ProgressPhoto> {
  const month = input.date.slice(0, 7)
  return storage.run(['progress_photos'], async repos => {
    const existing = (await repos.progress_photos.whereEquals('month', month)).find(p => p.view === input.view && !p.deleted_at)
    const row: ProgressPhoto = {
      id: existing?.id ?? ulid(), created_at: existing?.created_at ?? now, updated_at: now, source: 'user',
      date: input.date, month, view: input.view, blob: input.blob, thumb: input.thumb, width: input.width, height: input.height, bytes: input.blob.size,
    }
    const v = validateEntity('progress_photos', row)
    if (!v.ok) throw new AppError('validation', `Foto inválida: ${v.issues.map(i => `${i.path}: ${i.message}`).join('; ')}`)
    await repos.progress_photos.put(row)
    return row
  })
}

export async function listPhotos(storage: Storage): Promise<ProgressPhoto[]> {
  return (await storage.repos.progress_photos.getLive()).sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : a.view.localeCompare(b.view)))
}

export async function getPhoto(storage: Storage, id: string): Promise<ProgressPhoto | null> {
  const p = await storage.repos.progress_photos.get(id)
  return p && !p.deleted_at ? p : null
}

/** Borrado físico: el índice único [month+view] impide un borrado lógico y una nueva foto del mismo mes/vista. */
export async function deletePhoto(storage: Storage, id: string): Promise<void> {
  await storage.run(['progress_photos'], repos => repos.progress_photos.hardDelete(id))
}
