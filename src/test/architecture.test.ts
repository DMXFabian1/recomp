/**
 * Reglas de dependencia entre capas (Fase 3), verificadas leyendo los imports de cada archivo:
 *   ui     → app, domain (tipos), repo (tipos)      — nunca infra ni dexie
 *   app    → domain, repo                            — nunca ui ni infra (salvo bootstrap, que ensambla)
 *   domain → nada externo (ni app, ni repo, ni infra, ni ui, ni dexie, ni react)
 *   repo   → domain (tipos)
 *   infra  → domain, repo
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const out: string[] = []
  const re = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^import\s+['"]([^'"]+)['"]/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

const layerOf = (file: string) => relative(SRC, file).split(/[\\/]/)[0] ?? ''
const targetLayer = (imp: string) => {
  // Reglas de dominio: la UI solo las usa a través de app/services (Fase 8.5).
  if (/^@domain\/(progression|rotation|nutrition|substitution|catalog|adherence|metrics|adjustments|report)\b/.test(imp)) return 'domain-rules'
  const alias = imp.match(/^@(domain|app|repo|infra|ui)\b/)
  if (alias) return alias[1]!
  if (imp === 'dexie' || imp.startsWith('dexie/')) return 'dexie'
  if (imp === 'react' || imp.startsWith('react-') || imp.startsWith('react/')) return 'react'
  return null
}

const FORBIDDEN: Record<string, string[]> = {
  ui: ['infra', 'dexie', 'domain-rules'],
  app: ['ui', 'infra'],
  domain: ['app', 'repo', 'infra', 'ui', 'dexie', 'react'],
  repo: ['app', 'infra', 'ui', 'dexie', 'react'],
  infra: ['app', 'ui', 'react'],
}
const EXCEPTIONS = new Set(['app/bootstrap.ts']) // composición raíz: ensambla infra con app

describe('arquitectura por capas', () => {
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).replace(/\\/g, '/')
    const layer = layerOf(file)
    if (!(layer in FORBIDDEN) || EXCEPTIONS.has(rel)) continue
    it(`${rel} no importa capas prohibidas`, () => {
      for (const imp of importsOf(file)) {
        const t = targetLayer(imp)
        if (t && FORBIDDEN[layer]!.includes(t)) {
          throw new Error(`${rel} (capa ${layer}) importa ${imp} (capa ${t})`)
        }
        if (imp.startsWith('../') || imp.startsWith('./')) {
          // los imports relativos no pueden salir de la capa
          expect(imp.startsWith('../../')).toBe(false)
        }
      }
    })
  }
})

/**
 * Regla Fase 8.2: el catálogo (functional_rating, TrainingGoal, grupos) es solo descriptivo.
 * Ningún módulo de reglas (progression, rotation, adherence, metrics, adjustments) puede importarlo,
 * ni ahora ni cuando existan. Se comprueba sobre todo lo que haya bajo domain/.
 */
const RULE_MODULES = ['progression', 'rotation', 'adherence', 'metrics', 'adjustments', 'nutrition', 'report']
describe('el motor de reglas no depende del catálogo', () => {
  const domainFiles = walk(join(SRC, 'domain'))
  it('existe al menos un módulo de catálogo que proteger', () => {
    expect(domainFiles.some(f => /domain[\\/]catalog[\\/]/.test(f))).toBe(true)
  })
  for (const file of domainFiles) {
    const rel = relative(SRC, file).replace(/\\/g, '/')
    const mod = rel.split('/')[1] ?? ''
    if (!RULE_MODULES.includes(mod)) continue
    it(`${rel} no importa domain/catalog`, () => {
      for (const imp of importsOf(file)) expect(/catalog/.test(imp), `${rel} importa ${imp}`).toBe(false)
    })
  }
})

/**
 * Regla Fase 8.4: rotation_cursor solo puede avanzar en domain/progression/completeSession.ts.
 * Ninguna otra fuente (domain, app, ui, infra) puede asignarlo, salvo el seed, que lo crea en 0, y los tipos/schemas.
 */
describe('rotation_cursor solo cambia en completeSession', () => {
  const ALLOWED = new Set([
    'domain/progression/completeSession.ts', // único escritor real
    'app/seed/data.ts', // crea el programa con cursor 0
    'test/fixtures/training.ts', // fixtures de test
    'domain/entities/types.ts', 'domain/validation/entities.ts', 'domain/progression/types.ts', // tipos y schema
    'domain/rotation/getToday.ts', // copia de SOLO lectura al estado (getToday.test prueba que no muta el programa)
  ])
  const ASSIGN = /rotation_cursor\s*[:=](?!=)/
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).replace(/\\/g, '/')
    if (ALLOWED.has(rel)) continue
    it(`${rel} no asigna rotation_cursor`, () => {
      const src = readFileSync(file, 'utf8')
      const hits = src.split('\n').filter(l => ASSIGN.test(l) && !l.trim().startsWith('*') && !l.trim().startsWith('//'))
      expect(hits, hits.join('\n')).toEqual([])
    })
  }
  it('completeSession.ts es el único que escribe el cursor', () => {
    const src = readFileSync(join(SRC, 'domain/progression/completeSession.ts'), 'utf8')
    expect(ASSIGN.test(src)).toBe(true)
  })
})
