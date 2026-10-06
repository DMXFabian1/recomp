/**
 * Invariantes del catálogo v2 (Fase 8.2). Si algo aquí falla, el seed no debe entregarse.
 */
import { describe, expect, it } from 'vitest'
import { BOOK_SOURCE, EQUIPMENT, MOVEMENT_PATTERNS, MUSCLES, type FieldProvenance } from '@domain/entities'
import { isCompatible, orderedSubstitutes } from '@domain/catalog'
import { bookExercises, manualExercises, seedCatalogExercises, seedEquipmentProfiles, seedGoals, seedGroups, seedVariants, seedWarmups } from './index'
import { seedTemplates } from '../data'
import { SEED_IDS } from '../ids'

const ids = new Set(seedCatalogExercises.map(e => e.id))
const byId = new Map(seedCatalogExercises.map(e => [e.id, e]))
const E = SEED_IDS.exercises

/** Campos que no requieren procedencia: estructurales de BaseEntity/v1 o derivados de otros campos. */
const NO_PROVENANCE = new Set(['id', 'pattern', 'equipment', 'substitutes', 'catalog_source', 'source_confidence', 'field_provenance', 'short_card', 'substitute_group_ids'])

describe('catálogo de ejercicios', () => {
  it('tiene 104 ejercicios del libro + 9 manuales = 113, sin ids duplicados', () => {
    expect(bookExercises).toHaveLength(104)
    expect(manualExercises).toHaveLength(9)
    expect(ids.size).toBe(113)
  })

  it('los 30 ejercicios v1 conservan su id en el catálogo', () => {
    for (const id of Object.values(E)) expect(ids.has(id)).toBe(true)
  })

  it('exactamente 4 key lifts y is_basic ≠ is_key_lift', () => {
    const keys = seedCatalogExercises.filter(e => e.is_key_lift).map(e => e.id).sort()
    expect(keys).toEqual([E.bench, E.chestRow, E.deadlift, E.squat].sort())
    expect(seedCatalogExercises.filter(e => e.is_basic).length).toBeGreaterThan(4)
  })

  it('cada ejercicio tiene ≥1 patrón, ≥1 equipo, ≥1 músculo primario, categoría y región válidos', () => {
    for (const e of seedCatalogExercises) {
      expect(e.movement_patterns!.length, e.id).toBeGreaterThan(0)
      for (const p of e.movement_patterns!) expect(MOVEMENT_PATTERNS).toContain(p)
      expect(e.equipment_list!.length, e.id).toBeGreaterThan(0)
      for (const q of e.equipment_list!) expect(EQUIPMENT).toContain(q)
      expect(e.primary_muscles!.length, e.id).toBeGreaterThan(0)
      for (const mu of [...e.primary_muscles!, ...(e.secondary_muscles ?? [])]) expect(MUSCLES, `${e.id}: ${mu}`).toContain(mu)
      expect(e.category).toBeDefined()
      expect(e.body_region).toBeDefined()
    }
  })

  it('cada campo no vacío tiene procedencia, y las fuentes son coherentes', () => {
    for (const e of seedCatalogExercises) {
      const prov: FieldProvenance = e.field_provenance!
      for (const [k, v] of Object.entries(e)) {
        if (NO_PROVENANCE.has(k) || v === undefined) continue
        expect(prov[k], `${e.id}.${k} sin procedencia`).toBeDefined()
      }
      if (e.catalog_source === BOOK_SOURCE) {
        expect(e.source_page, e.id).toBeGreaterThan(0)
        expect(prov.name).toBe('direct')
        expect(prov.primary_muscles).toBe('direct')
      } else {
        expect(e.catalog_source).toBe('manual')
        expect(e.source_page).toBeUndefined()
        expect(e.functional_rating).toBeUndefined()
        for (const v of Object.values(prov)) expect(v).toBe('manual')
      }
    }
  })

  it('functional_rating está en 1..5 y solo en ejercicios del libro', () => {
    for (const e of seedCatalogExercises) {
      if (e.functional_rating === undefined) continue
      expect(e.catalog_source).toBe(BOOK_SOURCE)
      expect(e.functional_rating).toBeGreaterThanOrEqual(1)
      expect(e.functional_rating).toBeLessThanOrEqual(5)
    }
  })

  it('los sustitutos v1 referencian ejercicios existentes', () => {
    for (const e of seedCatalogExercises) for (const s of e.substitutes) expect(ids.has(s), `${e.id} → ${s}`).toBe(true)
  })

  it('ningún levantamiento dinámico aparece en las plantillas', () => {
    const dynamic = new Set(seedCatalogExercises.filter(e => e.category === 'dynamic').map(e => e.id))
    expect(dynamic.size).toBe(13)
    for (const t of seedTemplates) for (const te of t.exercises) expect(dynamic.has(te.exercise_id)).toBe(false)
  })

  it('los 15 ejercicios de muestra tienen cues de ejecución', () => {
    const sample = [E.squat, E.bulgarian, E.legPress, E.deadlift, E.rdl, E.assistedPullup, E.latPulldown, E.cableRow,
      'ex_prone_row', E.bench, E.inclineDbPress, E.pushup, E.dbShoulderPress, E.lateralRaise, E.plank]
    for (const id of sample) expect(byId.get(id)!.execution_cues?.length, id).toBeGreaterThan(0)
  })
})

describe('variantes', () => {
  it('cada variante referencia un padre existente y, si tiene ficha propia, un ejercicio existente distinto', () => {
    expect(seedVariants.length).toBeGreaterThan(0)
    const vids = new Set<string>()
    for (const v of seedVariants) {
      expect(vids.has(v.id), `id duplicado ${v.id}`).toBe(false)
      vids.add(v.id)
      expect(ids.has(v.parent_exercise_id), v.id).toBe(true)
      if (v.variant_exercise_id) {
        expect(ids.has(v.variant_exercise_id), v.id).toBe(true)
        expect(v.variant_exercise_id).not.toBe(v.parent_exercise_id)
      }
      expect(['direct', 'derived']).toContain(v.source_confidence)
      expect(v.source_page).toBeGreaterThan(0)
    }
  })

  it('NO existe variante entre remo prono con mancuernas y remo con pecho apoyado en máquina', () => {
    const pair = new Set([E.chestRow, 'ex_prone_row'])
    for (const v of seedVariants) {
      const linksPair = pair.has(v.parent_exercise_id) && v.variant_exercise_id !== undefined && pair.has(v.variant_exercise_id)
      expect(linksPair, v.id).toBe(false)
    }
  })
})

describe('grupos de sustitución', () => {
  it('cada miembro existe, tiene motivo y equipo coherente con el ejercicio', () => {
    for (const g of seedGroups) {
      expect(g.members.length).toBeGreaterThanOrEqual(2)
      for (const m of g.members) {
        expect(ids.has(m.exercise_id), `${g.id} → ${m.exercise_id}`).toBe(true)
        expect(m.reason.length).toBeGreaterThan(5)
        expect(m.equipment).toEqual(byId.get(m.exercise_id)!.equipment_list)
        expect(m.unilateral).toBe(byId.get(m.exercise_id)!.unilateral)
      }
    }
  })

  it('remo prono y remo con pecho apoyado comparten grupo (relación solo por sustitución)', () => {
    const g = seedGroups.find(g => g.id === 'sg_horizontal_pull')!
    const members = g.members.map(m => m.exercise_id)
    expect(members).toContain(E.chestRow)
    expect(members).toContain('ex_prone_row')
  })

  it('el orden de sustitutos ignora functional_rating y antepone calidad y compatibilidad', () => {
    const g = seedGroups.find(g => g.id === 'sg_squat')!
    const home = { name: 'home', items: [...seedEquipmentProfiles.home.items] }
    const ordered = orderedSubstitutes({ ...g, created_at: '', updated_at: '', source: 'system' }, E.squat, false, home)
    // high + compatible primero (front squat con barra+rack); goblet (kettlebell) compatible medium; leg press medium incompatible.
    expect(ordered[0]!.member.exercise_id).toBe('ex_front_squat')
    const goblet = ordered.findIndex(o => o.member.exercise_id === E.gobletSquat)
    const press = ordered.findIndex(o => o.member.exercise_id === E.legPress)
    expect(goblet).toBeLessThan(press)
    expect(ordered.find(o => o.member.exercise_id === E.legPress)!.compatible).toBe(false)
  })
})

describe('compatibilidad de equipamiento (estricta)', () => {
  const kbOnly = { name: 'kb', items: ['kettlebell' as const] }
  it('un ejercicio con mancuernas es incompatible con un perfil solo-kettlebell aunque exista sustituto compatible', () => {
    expect(isCompatible(byId.get(E.bulgarian)!, kbOnly)).toBe(false)
    expect(isCompatible(byId.get(E.gobletSquat)!, kbOnly)).toBe(true)
    expect(isCompatible(byId.get(E.pushup)!, kbOnly)).toBe(true)
  })
  it('requiere TODOS los elementos (banca + barra + rack para press de banca)', () => {
    expect(isCompatible(byId.get(E.bench)!, { name: 'x', items: ['olympic_barbell', 'rack'] })).toBe(false)
    expect(isCompatible(byId.get(E.bench)!, { name: 'x', items: ['olympic_barbell', 'rack', 'bench'] })).toBe(true)
  })
  it('el perfil gym cubre todo el catálogo; el perfil casa no', () => {
    const gym = { name: 'gym', items: [...seedEquipmentProfiles.gym.items] }
    const home = { name: 'home', items: [...seedEquipmentProfiles.home.items] }
    expect(seedCatalogExercises.every(e => isCompatible(e, gym))).toBe(true)
    expect(seedCatalogExercises.some(e => !isCompatible(e, home))).toBe(true)
  })
})

describe('warmups y objetivos', () => {
  it('19 warmups del libro con región, página y cues; sin reps/tiempos (no disponible)', () => {
    expect(seedWarmups).toHaveLength(19)
    for (const w of seedWarmups) {
      expect(w.source_page).toBeGreaterThanOrEqual(50)
      expect(w.source_page).toBeLessThanOrEqual(61)
      expect(w.execution_cues!.length).toBeGreaterThan(0)
      expect(w.default_reps_or_seconds).toBeUndefined()
    }
  })
  it('6 objetivos; solo resistencia muscular tiene valores típicos y nadie los copia a plantillas', () => {
    expect(seedGoals).toHaveLength(6)
    for (const g of seedGoals) {
      for (const t of g.exercise_tags) expect(ids.has(t.exercise_id), `${g.id} → ${t.exercise_id}`).toBe(true)
      if (g.goal === 'muscular_endurance') expect(g.typical_reps).toBeDefined()
      else expect(g.typical_reps).toBeUndefined()
    }
    // Las plantillas no cambian por existir TrainingGoal: siguen siendo las 4 del protocolo con sus reps.
    expect(seedTemplates.flatMap(t => t.exercises).every(te => te.reps_min > 0 && te.reps_max >= te.reps_min)).toBe(true)
  })
})
