/**
 * Backup e importación — Fase 8.11. Local: sin red, sin servidor. Orquesta repos + domain/backup.
 *
 * Exportar (solo lectura): lee TODAS las colecciones (incluye filas con deleted_at) + fotos con metadata completa,
 * construye el BackupFile, lo valida (entidades + integridad) y devuelve el JSON. No escribe nada.
 *
 * Importar (reemplazar), orden obligatorio:
 *  1. el backup ya llega inspeccionado (inspectBackup) y se revalida aquí; las fotos se decodifican ANTES de tocar la DB;
 *  2. snapshot en memoria del estado actual + backup preventivo persistido en `backups` (kind 'auto_pre_import');
 *  3. UNA transacción sobre todas las colecciones salvo `backups`: clear + bulkPut + verificación dentro de la transacción;
 *     cualquier error aborta y Dexie deja la DB intacta;
 *  4. verificación posterior (entidades + integridad + conteos + fotos); si falla → rollback explícito desde el snapshot
 *     en otra transacción, y verificación del rollback.
 * Nunca se ejecuta seed, ni reglas 8.9, ni completeSession: se importa exactamente lo que trae el backup.
 * El store `backups` no se toca (salvo añadir el preventivo).
 */
import { ulid } from 'ulid'
import type { Backup, CollectionName, DayString, ProgressPhoto } from '@domain/entities'
import { COLLECTIONS } from '@domain/entities'
import { AppError } from '@domain/errors'
import { validateBackup } from '@domain/validation/backup'
import {
  APP_VERSION, BACKUP_COLLECTIONS, backupFileName, buildBackupFile, checkIntegrity, inspectBackupText,
  type BackupFile, type BackupPhoto, type BackupSummary, type InspectResult,
} from '@domain/backup'
import type { Repos, Storage } from '@repo/index'

export { APP_VERSION }
export type { BackupSummary, InspectResult }

/** Colecciones que reemplaza una importación: todas salvo `backups`. */
const IMPORT_COLLECTIONS: CollectionName[] = COLLECTIONS.filter(c => c !== 'backups')
export const KEEP_PRE_IMPORT_BACKUPS = 3

// ── base64 (local, sin red) ──
function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
async function blobToB64(b: Blob): Promise<string> {
  return bytesToB64(new Uint8Array(await b.arrayBuffer()))
}

async function encodePhoto(p: ProgressPhoto): Promise<BackupPhoto> {
  const out: BackupPhoto = {
    id: p.id, created_at: p.created_at, updated_at: p.updated_at, source: p.source,
    date: p.date, month: p.month, view: p.view, width: p.width, height: p.height, bytes: p.bytes,
    mime: p.blob.type || 'application/octet-stream', thumb_mime: p.thumb.type || 'application/octet-stream',
    data_base64: await blobToB64(p.blob), thumb_base64: await blobToB64(p.thumb),
  }
  if (p.deleted_at) out.deleted_at = p.deleted_at
  return out
}

function decodePhoto(p: BackupPhoto): ProgressPhoto {
  const out: ProgressPhoto = {
    id: p.id, created_at: p.created_at, updated_at: p.updated_at, source: p.source,
    date: p.date, month: p.month, view: p.view, width: p.width, height: p.height, bytes: p.bytes,
    blob: new Blob([b64ToBytes(p.data_base64)], { type: p.mime }), thumb: new Blob([b64ToBytes(p.thumb_base64)], { type: p.thumb_mime }),
  }
  if (p.deleted_at) out.deleted_at = p.deleted_at
  return out
}

// ── lectura del estado ──
interface Snapshot { collections: Partial<Record<CollectionName, unknown[]>>; photos: ProgressPhoto[] }

async function readSnapshot(repos: Repos): Promise<Snapshot> {
  const collections: Partial<Record<CollectionName, unknown[]>> = {}
  for (const c of BACKUP_COLLECTIONS) collections[c] = await repos[c].getAll()
  return { collections, photos: await repos.progress_photos.getAll() }
}

async function deviceIdOf(repos: Repos): Promise<string> {
  return (await repos.users.getAll())[0]?.device_id ?? 'local'
}

function assertValid(b: BackupFile, what: string) {
  const v = validateBackup(b)
  if (!v.ok) throw new AppError('validation', `${what}: ${v.issues[0]?.message ?? 'inválido'} (${v.issues[0]?.path ?? ''})`)
  const i = checkIntegrity(b)
  if (i.length > 0) throw new AppError('validation', `${what}: ${i[0]!.message}`)
}

// ── EXPORTAR (solo lectura) ──
export interface ExportResult { json: string; filename: string; counts: Record<string, number>; photos: number; bytes: number }

export async function exportBackup(storage: Storage, now: string, localDay: DayString): Promise<ExportResult> {
  const r = storage.repos
  const snap = await readSnapshot(r)
  const backup = buildBackupFile({ exported_at: now, device_id: await deviceIdOf(r), collections: snap.collections, photos: await Promise.all(snap.photos.map(encodePhoto)) })
  assertValid(backup, 'El backup generado no es válido')
  const json = JSON.stringify(backup)
  const counts: Record<string, number> = {}
  for (const c of BACKUP_COLLECTIONS) counts[c] = backup.collections[c]!.length
  return { json, filename: backupFileName(localDay), counts, photos: backup.photos?.length ?? 0, bytes: new Blob([json]).size }
}

// ── INSPECCIONAR (puro; no toca DB) ──
export function inspectBackup(text: string): InspectResult {
  return inspectBackupText(text)
}

// ── IMPORTAR ──
export type ImportResult =
  | { status: 'success'; pre_import_backup_id: string; counts: Record<string, number>; photos: number }
  | { status: 'failure'; message: string } // falló ANTES de modificar: DB intacta
  | { status: 'rolled_back'; message: string; pre_import_backup_id: string } // falló al importar o al verificar: datos anteriores restaurados
  | { status: 'rollback_failed'; message: string; pre_import_backup_id: string } // el rollback también falló: el backup preventivo queda en `backups`

/** Solo para tests: inyección de fallos en puntos concretos del proceso. */
export interface ImportFaults { beforeWrite?: () => void; duringImport?: () => void; afterCommit?: () => void; duringRollback?: () => void }

async function writeAll(storage: Storage, snap: { collections: Partial<Record<CollectionName, unknown[]>>; photos: ProgressPhoto[] }, inTx?: () => void): Promise<void> {
  await storage.run(IMPORT_COLLECTIONS, async repos => {
    for (const c of IMPORT_COLLECTIONS) await repos[c].clear()
    for (const c of BACKUP_COLLECTIONS) {
      const rows = snap.collections[c] ?? []
      if (rows.length > 0) await repos[c].bulkPut(rows as never)
    }
    if (snap.photos.length > 0) await repos.progress_photos.bulkPut(snap.photos)
    inTx?.()
    // Verificación dentro de la transacción: conteos e ids exactos.
    for (const c of BACKUP_COLLECTIONS) {
      const got = await repos[c].getAll()
      const want = (snap.collections[c] ?? []) as Array<{ id: string }>
      if (got.length !== want.length) throw new AppError('write_failed', `Conteo distinto en ${c}`)
      const ids = new Set(got.map(x => x.id))
      if (want.some(x => !ids.has(x.id))) throw new AppError('write_failed', `Ids distintos en ${c}`)
    }
    if ((await repos.progress_photos.count()) !== snap.photos.length) throw new AppError('write_failed', 'Conteo distinto de fotos')
  })
}

/** Verificación posterior al commit: la DB debe ser un backup válido e idéntico en conteos al importado. */
async function verifyDb(storage: Storage, expected: { counts: Record<string, number>; photos: BackupPhoto[] }): Promise<void> {
  const snap = await readSnapshot(storage.repos)
  const asBackup = buildBackupFile({ exported_at: new Date(0).toISOString(), device_id: 'verify', collections: snap.collections, photos: [] })
  assertValid(asBackup, 'Verificación posterior')
  for (const c of BACKUP_COLLECTIONS) if (asBackup.collections[c]!.length !== expected.counts[c]) throw new AppError('validation', `Verificación posterior: conteo distinto en ${c}`)
  if (snap.photos.length !== expected.photos.length) throw new AppError('validation', 'Verificación posterior: conteo distinto de fotos')
  for (const p of expected.photos) {
    const got = snap.photos.find(x => x.id === p.id)
    if (!got || got.view !== p.view || got.date !== p.date || got.width !== p.width || got.height !== p.height || got.blob.size !== b64ToBytes(p.data_base64).length || got.blob.type !== p.mime || got.thumb.type !== p.thumb_mime) {
      throw new AppError('validation', `Verificación posterior: foto ${p.id} distinta`)
    }
  }
}

export async function importBackup(storage: Storage, backup: BackupFile, now: string, faults: ImportFaults = {}): Promise<ImportResult> {
  // 1. Revalidar y preparar TODO antes de tocar la DB.
  let photos: ProgressPhoto[]
  const counts: Record<string, number> = {}
  try {
    assertValid(backup, 'El backup no es válido')
    for (const c of BACKUP_COLLECTIONS) counts[c] = backup.collections[c]!.length
    photos = (backup.photos ?? []).map(decodePhoto)
    faults.beforeWrite?.()
  } catch (e) {
    return { status: 'failure', message: `La importación fue cancelada: ${e instanceof Error ? e.message : String(e)}. No se modificó nada.` }
  }

  // 2. Snapshot en memoria + backup preventivo persistido.
  const pre = await readSnapshot(storage.repos)
  const preFile = buildBackupFile({ exported_at: now, device_id: await deviceIdOf(storage.repos), collections: pre.collections, photos: await Promise.all(pre.photos.map(encodePhoto)) })
  const blob = new Blob([JSON.stringify(preFile)], { type: 'application/json' })
  const preEntry: Backup = { id: ulid(), created_at: now, updated_at: now, source: 'system', schema_version: preFile.schema_version, kind: 'auto_pre_import', blob, bytes: blob.size }
  await storage.run(['backups'], async repos => {
    await repos.backups.put(preEntry)
    const autos = (await repos.backups.whereEquals('kind', 'auto_pre_import')).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1))
    for (const old of autos.slice(KEEP_PRE_IMPORT_BACKUPS)) await repos.backups.hardDelete(old.id)
  })
  const preCounts: Record<string, number> = {}
  for (const c of BACKUP_COLLECTIONS) preCounts[c] = pre.collections[c]!.length

  // 3. Importación atómica.
  try {
    await writeAll(storage, { collections: backup.collections as Partial<Record<CollectionName, unknown[]>>, photos }, faults.duringImport)
  } catch (e) {
    // Dexie abortó: la DB no cambió. Se verifica igualmente.
    try {
      await verifyDb(storage, { counts: preCounts, photos: preFile.photos ?? [] })
    } catch {
      return { status: 'rollback_failed', message: 'La importación falló y no se pudo confirmar el estado anterior. Hay un backup preventivo guardado en el dispositivo.', pre_import_backup_id: preEntry.id }
    }
    console.error('[recomp] import abortado', e)
    return { status: 'rolled_back', message: 'La importación falló. Los datos anteriores fueron restaurados.', pre_import_backup_id: preEntry.id }
  }

  // 4. Verificación posterior; si falla → rollback explícito desde el snapshot.
  try {
    faults.afterCommit?.()
    await verifyDb(storage, { counts, photos: backup.photos ?? [] })
  } catch (e) {
    console.error('[recomp] verificación posterior falló; rollback', e)
    try {
      await writeAll(storage, pre, faults.duringRollback)
      await verifyDb(storage, { counts: preCounts, photos: preFile.photos ?? [] })
    } catch (re) {
      console.error('[recomp] rollback falló', re)
      return { status: 'rollback_failed', message: 'La importación falló y el rollback también. Hay un backup preventivo guardado en el dispositivo; no cierres la app y exporta o importa ese respaldo.', pre_import_backup_id: preEntry.id }
    }
    return { status: 'rolled_back', message: 'La importación falló. Los datos anteriores fueron restaurados.', pre_import_backup_id: preEntry.id }
  }
  return { status: 'success', pre_import_backup_id: preEntry.id, counts, photos: photos.length }
}

// ── Backups locales (preventivos) ──
export interface LocalBackupInfo { id: string; created_at: string; kind: Backup['kind']; bytes: number; schema_version: number }

export async function listLocalBackups(storage: Storage): Promise<LocalBackupInfo[]> {
  return (await storage.repos.backups.getAll())
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(b => ({ id: b.id, created_at: b.created_at, kind: b.kind, bytes: b.bytes, schema_version: b.schema_version }))
}

/** Texto JSON de un backup local (para descargarlo o volver a importarlo por el flujo normal de inspección). */
export async function localBackupText(storage: Storage, id: string): Promise<string> {
  const b = await storage.repos.backups.get(id)
  if (!b) throw new AppError('not_found', 'Ese backup local no existe.')
  return b.blob.text()
}
