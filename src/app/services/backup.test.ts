/** Fase 8.11 — exportar / inspeccionar / importar / rollback sobre IndexedDB real (fake-indexeddb) con el seed oficial. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DexieStorage } from '@infra/dexie/storage'
import { seedIfEmpty } from '@app/seed/seed'
import { SEED_IDS } from '@app/seed/ids'
import { COLLECTIONS } from '@domain/entities'
import { addDays } from '@domain/time/day'
import { BACKUP_COLLECTIONS, type BackupFile } from '@domain/backup'
import type { Storage } from '@repo/index'
import { saveCheckIn } from './checkin'
import { logOffPlan } from './meals'
import { startSession, suggestVersion } from './sessions'
import { finishSession, logSet } from './training'
import { savePhoto } from './photos'
import { acceptRecommendation, evaluateAdjustmentWindow, loadPendingRecommendation } from './adjustments'
import { exportBackup, importBackup, inspectBackup, listLocalBackups, localBackupText } from './backup'

const ISO = (d: string, hhmm = '08:00') => `${d}T${hhmm}:00.000Z`
const START = '2026-10-06', TODAY = '2026-10-21'
let n = 0
async function fresh(name: string): Promise<Storage> {
  const s = new DexieStorage(`${name}_${n++}`); await s.open(); await seedIfEmpty(s, ISO('2026-10-01')); return s
}
const img = (bytes: number, type = 'image/jpeg') => new Blob([new Uint8Array(bytes).map((_, i) => i % 251)], { type })

/** Estado "rico": check-ins (null en protein), sesión completada (cursor 1), Recommendation aceptada (Decision + Settings), alertas, foto. */
async function rich(name: string): Promise<Storage> {
  const s = await fresh(name)
  for (let d = 0; d < 14; d++) {
    const date = addDays(START, d)
    await saveCheckIn(s, date, { weight_kg: d < 7 ? 120 : 118.5, food_yesterday: 'plan', sleep_bucket: '7-8' }, ISO(date))
  }
  await logOffPlan(s, { date: '2026-10-07', slot: 'lunch', protein_g: null, note: 'tacos' }, ISO('2026-10-07', '14:00'))
  const tpl = (await s.repos.workout_templates.get(SEED_IDS.templates.legA))!
  const ws = await startSession(s, { template: tpl, date: START, suggestion: suggestVersion({ template: tpl }), userChoice: 'full' }, ISO(START, '18:15'))
  await logSet(s, { session_id: ws.id, exercise_id: SEED_IDS.exercises.squat, weight_kg: 60, reps: 8, rir: 2, is_warmup: false }, ISO(START, '18:20'))
  await finishSession(s, ws.id, ISO(START, '19:30'), START)
  await evaluateAdjustmentWindow(s, TODAY, ISO(TODAY))
  await acceptRecommendation(s, (await loadPendingRecommendation(s))!.id, TODAY, ISO(TODAY, '10:00'))
  await savePhoto(s, { date: '2026-10-10', view: 'front', blob: img(5000), thumb: img(300, 'image/webp'), width: 1200, height: 1600 }, ISO('2026-10-10'))
  return s
}
/** Huella del estado completo: todas las colecciones (incluye backups) con blobs reducidos a tamaño+tipo. */
async function fingerprint(s: Storage, opts: { withBackups?: boolean } = {}): Promise<string> {
  const out: Record<string, unknown> = {}
  for (const c of COLLECTIONS) {
    if (c === 'backups' && !opts.withBackups) continue
    const rows = (await s.repos[c].getAll()).sort((a, b) => (a.id < b.id ? -1 : 1))
    out[c] = rows.map(r => Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, v instanceof Blob ? `blob:${v.type}:${v.size}` : v])))
  }
  return JSON.stringify(out)
}
const parse = (json: string) => JSON.parse(json) as BackupFile
const withoutStamp = (b: BackupFile) => JSON.stringify({ ...b, exported_at: '' })

const net = { fetch: vi.fn(), xhr: vi.fn(), beacon: vi.fn() }
beforeEach(() => {
  vi.stubGlobal('fetch', net.fetch)
  vi.stubGlobal('XMLHttpRequest', net.xhr)
  vi.stubGlobal('navigator', { ...globalThis.navigator, sendBeacon: net.beacon })
})
afterEach(() => {
  vi.unstubAllGlobals()
  expect(net.fetch).not.toHaveBeenCalled() // ninguna operación de 8.11 usa red
  expect(net.xhr).not.toHaveBeenCalled()
  expect(net.beacon).not.toHaveBeenCalled()
  net.fetch.mockClear(); net.xhr.mockClear(); net.beacon.mockClear()
})

describe('exportar', () => {
  it('JSON válido, schema_version 2, todas las colecciones, solo lectura, determinista salvo exported_at', async () => {
    const s = await rich('exp')
    const before = await fingerprint(s, { withBackups: true })
    const a = await exportBackup(s, ISO(TODAY, '12:00'), TODAY)
    const b = await exportBackup(s, ISO(TODAY, '12:05'), TODAY)
    expect(await fingerprint(s, { withBackups: true })).toBe(before) // solo lectura
    expect(a.filename).toBe('recomp-backup-2026-10-21.json')
    const fa = parse(a.json)
    expect(fa.schema_version).toBe(2)
    expect(Object.keys(fa.collections).sort()).toEqual([...BACKUP_COLLECTIONS].sort())
    expect(Object.keys(fa.collections)).not.toContain('progress_photos')
    expect(Object.keys(fa.collections)).not.toContain('backups')
    expect(withoutStamp(fa)).toBe(withoutStamp(parse(b.json)))
    expect(inspectBackup(a.json).ok).toBe(true)
    s.close()
  })
  it('preserva null, fechas, ids, Settings, Recommendations, Decisions, progreso, sesiones, nutrición y fotos', async () => {
    const s = await rich('exp2')
    const f = parse((await exportBackup(s, ISO(TODAY), TODAY)).json)
    const meal = (f.collections.meal_logs as Array<Record<string, unknown>>).find(m => m.note === 'tacos')!
    expect(meal.off_plan_protein_g).toBeNull()
    expect(meal.date).toBe('2026-10-07')
    expect(f.collections.settings).toEqual(await s.repos.settings.getAll().then(r => r.sort((a, b) => (a.id < b.id ? -1 : 1))))
    expect((f.collections.settings as Array<{ change_origin: string }>).map(x => x.change_origin).sort()).toEqual(['recommendation', 'seed'])
    expect(f.collections.recommendations).toHaveLength(1)
    expect(f.collections.recommendation_decisions).toHaveLength(1)
    expect(f.collections.daily_check_ins).toHaveLength(14)
    expect(f.collections.workout_sessions).toHaveLength(1)
    expect(f.collections.exercise_sets).toHaveLength(1)
    expect((f.collections.programs as Array<{ rotation_cursor: number }>)[0]!.rotation_cursor).toBe(1)
    expect(f.photos).toHaveLength(1)
    expect(f.photos![0]).toMatchObject({ date: '2026-10-10', month: '2026-10', view: 'front', width: 1200, height: 1600, bytes: 5000, mime: 'image/jpeg', thumb_mime: 'image/webp' })
    expect(atob(f.photos![0]!.data_base64).length).toBe(5000)
    s.close()
  })
})

describe('validar (inspectBackup): rechaza sin tocar nada', () => {
  let good: BackupFile
  beforeEach(async () => {
    const s = await rich('val')
    good = parse((await exportBackup(s, ISO(TODAY), TODAY)).json)
    s.close()
  })
  const clone = () => structuredClone(good)
  const bad = (b: unknown) => inspectBackup(JSON.stringify(b))
  it('JSON inválido / raíz inválida / sin schema_version / versión futura / versión inválida', () => {
    expect(inspectBackup('{no json')).toMatchObject({ ok: false, stage: 'json', message: 'El archivo no contiene un backup RECOMP válido (no es JSON).' })
    expect(bad([1, 2])).toMatchObject({ ok: false, stage: 'envelope' })
    expect(bad({ hola: 1 })).toMatchObject({ ok: false, stage: 'envelope' })
    const nov = clone() as Partial<BackupFile>; delete nov.schema_version
    expect(bad(nov)).toMatchObject({ ok: false, stage: 'version' })
    expect(bad({ ...clone(), schema_version: 4 })).toMatchObject({ ok: false, stage: 'version', message: 'Schema version 4 no es compatible con esta aplicación (soporta hasta 2).' })
    expect(bad({ ...clone(), schema_version: 0 })).toMatchObject({ ok: false, stage: 'version' }) // antigua incompatible
  })
  it('versión antigua compatible (v1): se migra con la migración existente', () => {
    const v1 = clone()
    v1.schema_version = 1
    for (const c of ['exercise_variants', 'exercise_substitution_groups', 'warmup_exercises', 'training_goals']) delete v1.collections[c]
    // sin grupos, las referencias de exercises.substitute_group_ids quedarían rotas: un v1 real no las tiene
    v1.collections.exercises = (v1.collections.exercises as Array<Record<string, unknown>>).map(e => { const x = { ...e }; delete x.substitute_group_ids; return x })
    const r = inspectBackup(JSON.stringify(v1))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.summary).toMatchObject({ schema_version: 2, migrated_from: 1 })
      expect(r.summary.warnings[0]).toMatch(/versión 1/)
    }
  })
  it('entidad inválida / enum / fecha / id faltante / id duplicado', () => {
    const e1 = clone(); (e1.collections.daily_check_ins![0] as Record<string, unknown>).mood = 9
    expect(bad(e1)).toMatchObject({ ok: false, stage: 'entities' })
    const e2 = clone(); (e2.collections.meal_logs![0] as Record<string, unknown>).status = 'comí_bien'
    expect(bad(e2)).toMatchObject({ ok: false, stage: 'entities', message: expect.stringMatching(/colección meal_logs/) })
    const e3 = clone(); (e3.collections.daily_check_ins![0] as Record<string, unknown>).date = '2026-13-40'
    expect(bad(e3)).toMatchObject({ ok: false, stage: 'entities' })
    const e4 = clone(); delete (e4.collections.alerts![0] as Record<string, unknown>).id
    expect(bad(e4).ok).toBe(false)
    const e5 = clone(); e5.collections.daily_check_ins!.push({ ...(e5.collections.daily_check_ins![0] as object), date: '2026-11-30' })
    expect(bad(e5)).toMatchObject({ ok: false, stage: 'integrity', message: expect.stringMatching(/Id duplicado en daily_check_ins/) })
  })
  it('referencia inexistente / colección faltante / colección desconocida', () => {
    const r1 = clone(); (r1.collections.exercise_sets![0] as Record<string, unknown>).session_id = 'nope'
    expect(bad(r1)).toMatchObject({ ok: false, stage: 'integrity', message: 'El backup contiene una referencia inexistente: exercise_sets.session_id → workout_sessions "nope"' })
    const r2 = clone(); (r2.collections.settings as Array<Record<string, unknown>>).forEach(x => { if (x.recommendation_decision_id) x.recommendation_decision_id = 'fantasma' })
    expect(bad(r2)).toMatchObject({ ok: false, stage: 'integrity', message: expect.stringMatching(/settings\.recommendation_decision_id/) })
    const r3 = clone(); delete r3.collections.meal_logs
    expect(bad(r3)).toMatchObject({ ok: false, stage: 'integrity', message: 'Falta la colección meal_logs.' })
    const r4 = clone(); r4.collections.cosas = []
    expect(bad(r4)).toMatchObject({ ok: false, stage: 'entities' })
  })
  it('Recommendation / Decision / Settings inválidos; foto sin metadata', () => {
    const a = clone(); (a.collections.recommendations![0] as Record<string, unknown>).status = 'quizá'
    expect(bad(a)).toMatchObject({ ok: false, message: expect.stringMatching(/recommendations/) })
    const b = clone(); (b.collections.recommendation_decisions![0] as Record<string, unknown>).decision = 'después'
    expect(bad(b)).toMatchObject({ ok: false, message: expect.stringMatching(/recommendation_decisions/) })
    const c = clone(); (c.collections.settings![0] as Record<string, unknown>).kcal_target = 'mucho'
    expect(bad(c)).toMatchObject({ ok: false, message: expect.stringMatching(/settings/) })
    const d = clone(); delete (d.photos![0] as Partial<NonNullable<BackupFile['photos']>[number]>).view
    expect(bad(d)).toMatchObject({ ok: false, stage: 'entities' })
  })
  it('el seed oficial cumple todas las reglas de referencias', async () => {
    const s = await fresh('val_seed')
    expect(inspectBackup((await exportBackup(s, ISO(TODAY), TODAY)).json).ok).toBe(true)
    s.close()
  })
})

describe('importar', () => {
  it('reemplaza la DB por el backup exacto: sin seed, sin reglas, sin alertas nuevas; cursor, Settings, Decisions y fotos intactos', async () => {
    const src = await rich('imp_src')
    const exp = await exportBackup(src, ISO(TODAY, '12:00'), TODAY)
    const srcPrint = await fingerprint(src)
    src.close()
    const dst = await fresh('imp_dst')
    await saveCheckIn(dst, '2026-10-01', { weight_kg: 99 }, ISO('2026-10-01')) // datos que deben desaparecer
    await dst.run(['backups'], r => r.backups.put({ id: 'old_manual', created_at: ISO('2026-09-01'), updated_at: ISO('2026-09-01'), source: 'user', schema_version: 2, kind: 'manual', blob: new Blob(['{}']), bytes: 2 }))
    const insp = inspectBackup(exp.json)
    expect(insp.ok).toBe(true)
    if (!insp.ok) return
    expect(insp.summary).toMatchObject({ schema_version: 2, migrated_from: null, photos: 1, exported_at: ISO(TODAY, '12:00') })
    expect(insp.summary.warnings.join(' ')).toMatch(/arranque normal/)
    const res = await importBackup(dst, insp.backup, ISO(TODAY, '13:00'))
    expect(res.status).toBe('success')
    expect(await fingerprint(dst)).toBe(srcPrint) // estado idéntico al exportado (incluye fotos por tamaño/tipo)
    expect((await dst.repos.programs.getAll())[0]!.rotation_cursor).toBe(1)
    expect(await dst.repos.recommendations.count()).toBe(1)
    expect(await dst.repos.alerts.count()).toBe((parse(exp.json).collections.alerts ?? []).length)
    const photo = (await dst.repos.progress_photos.getAll())[0]!
    expect(photo).toMatchObject({ view: 'front', width: 1200, height: 1600, bytes: 5000, date: '2026-10-10', month: '2026-10' })
    expect(photo.blob.size).toBe(5000)
    expect(photo.thumb.type).toBe('image/webp')
    expect(new Uint8Array(await photo.blob.arrayBuffer())[252]).toBe(1) // bytes reales
    // backups: el anterior sigue + el preventivo nuevo
    const backups = await listLocalBackups(dst)
    expect(backups.map(b => b.kind).sort()).toEqual(['auto_pre_import', 'manual'])
    // el preventivo contiene el estado anterior (el check-in de 99 kg)
    const pre = inspectBackup(await localBackupText(dst, res.status === 'success' ? res.pre_import_backup_id : ''))
    expect(pre.ok && (pre.backup.collections.daily_check_ins as Array<{ weight_kg?: number }>).some(c => c.weight_kg === 99)).toBe(true)
    dst.close()
  })
  it('no ejecuta seed: una colección vacía en el backup queda vacía', async () => {
    const src = await fresh('imp_noseed_src')
    const f = parse((await exportBackup(src, ISO(TODAY), TODAY)).json)
    src.close()
    f.collections.monthly_goals = []
    const dst = await fresh('imp_noseed_dst')
    const insp = inspectBackup(JSON.stringify(f))
    expect(insp.ok).toBe(true)
    if (!insp.ok) return
    expect(insp.summary.warnings.join(' ')).toMatch(/monthly_goals/)
    expect((await importBackup(dst, insp.backup, ISO(TODAY))).status).toBe('success')
    expect(await dst.repos.monthly_goals.count()).toBe(0)
    dst.close()
  })
})

describe('rollback', () => {
  async function setup(name: string) {
    const src = await rich(`${name}_src`)
    const backup = parse((await exportBackup(src, ISO(TODAY), TODAY)).json)
    src.close()
    const dst = await fresh(`${name}_dst`)
    await saveCheckIn(dst, '2026-10-01', { weight_kg: 99, mood: 2 }, ISO('2026-10-01'))
    return { dst, backup, before: await fingerprint(dst) }
  }
  it('fallo antes de modificar → DB intacta, sin backup preventivo', async () => {
    const { dst, backup, before } = await setup('rb_before')
    const r = await importBackup(dst, backup, ISO(TODAY), { beforeWrite: () => { throw new Error('disco lleno') } })
    expect(r).toMatchObject({ status: 'failure', message: expect.stringMatching(/cancelada.*No se modificó nada/) })
    expect(await fingerprint(dst)).toBe(before)
    expect(await dst.repos.backups.count()).toBe(0)
    dst.close()
  })
  it('backup inválido pasado directo → failure, DB intacta', async () => {
    const { dst, backup, before } = await setup('rb_invalid')
    ;(backup.collections.exercise_sets![0] as Record<string, unknown>).session_id = 'nope'
    expect((await importBackup(dst, backup, ISO(TODAY))).status).toBe('failure')
    expect(await fingerprint(dst)).toBe(before)
    dst.close()
  })
  it('fallo durante la importación → la transacción aborta, estado anterior verificado', async () => {
    const { dst, backup, before } = await setup('rb_during')
    const r = await importBackup(dst, backup, ISO(TODAY), { duringImport: () => { throw new Error('boom') } })
    expect(r).toMatchObject({ status: 'rolled_back', message: 'La importación falló. Los datos anteriores fueron restaurados.' })
    expect(await fingerprint(dst)).toBe(before)
    dst.close()
  })
  it('fallo en la verificación posterior → rollback explícito; DB anterior válida', async () => {
    const { dst, backup, before } = await setup('rb_after')
    const r = await importBackup(dst, backup, ISO(TODAY), { afterCommit: () => { throw new Error('verificación') } })
    expect(r.status).toBe('rolled_back')
    expect(await fingerprint(dst)).toBe(before)
    expect(inspectBackup((await exportBackup(dst, ISO(TODAY), TODAY)).json).ok).toBe(true) // DB restaurada es válida
    dst.close()
  })
  it('error durante el rollback → rollback_failed claro; el backup preventivo permite recuperar', async () => {
    const { dst, backup, before } = await setup('rb_fail')
    const r = await importBackup(dst, backup, ISO(TODAY), { afterCommit: () => { throw new Error('a') }, duringRollback: () => { throw new Error('b') } })
    expect(r).toMatchObject({ status: 'rollback_failed', message: expect.stringMatching(/backup preventivo/) })
    if (r.status !== 'rollback_failed') return
    // recuperación manual con el flujo normal
    const pre = inspectBackup(await localBackupText(dst, r.pre_import_backup_id))
    expect(pre.ok).toBe(true)
    if (!pre.ok) return
    expect((await importBackup(dst, pre.backup, ISO(TODAY, '14:00'))).status).toBe('success')
    expect(await fingerprint(dst)).toBe(before)
    dst.close()
  })
  it('se conservan como máximo 3 backups preventivos', async () => {
    const { dst, backup } = await setup('rb_keep')
    for (let i = 0; i < 4; i++) expect((await importBackup(dst, backup, ISO(TODAY, `1${i}:00`))).status).toBe('success')
    expect((await listLocalBackups(dst)).filter(b => b.kind === 'auto_pre_import')).toHaveLength(3)
    dst.close()
  })
})
