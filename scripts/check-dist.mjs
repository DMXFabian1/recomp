// Fase 8.12 — verificación del build de producción para GitHub Pages bajo BASE (por defecto /recomp/).
// Falla (exit 1) si hay rutas absolutas fuera del base, manifest incompatible o SW sin precache/fallback.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.VITE_BASE ?? '/recomp/'
const DIST = process.argv[2] ?? 'dist'
const errors = []
const ok = (cond, msg) => { if (!cond) errors.push(msg) }
const read = f => readFileSync(join(DIST, f), 'utf8')
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })

ok(existsSync(join(DIST, 'index.html')), 'falta index.html')
const html = read('index.html')
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const u = m[1]
  if (/^https?:/.test(u)) errors.push(`index.html referencia externa: ${u}`)
  else ok(u.startsWith(BASE), `index.html ruta fuera de ${BASE}: ${u}`)
}
ok(html.includes(`${BASE}manifest.webmanifest`), 'index.html no enlaza el manifest bajo el base')

const man = JSON.parse(read('manifest.webmanifest'))
ok(man.scope === BASE, `manifest.scope = ${man.scope}`)
ok(typeof man.start_url === 'string' && man.start_url.startsWith(BASE), `manifest.start_url = ${man.start_url}`)
ok(man.display === 'standalone', `manifest.display = ${man.display}`)
for (const k of ['name', 'short_name', 'theme_color', 'background_color']) ok(!!man[k], `manifest.${k} vacío`)
ok(Array.isArray(man.icons) && man.icons.length > 0, 'manifest sin iconos')
for (const i of man.icons ?? []) ok(existsSync(join(DIST, i.src)), `icono inexistente: ${i.src}`)
for (const size of ['192x192', '512x512']) ok((man.icons ?? []).some(i => i.type === 'image/png' && i.sizes === size), `manifest sin icono PNG ${size}`)
ok((man.icons ?? []).some(i => i.purpose === 'maskable' && i.type === 'image/png'), 'manifest sin icono maskable PNG')
const apple = html.match(/rel="apple-touch-icon" href="([^"]+)"/)?.[1]
ok(!!apple && apple.endsWith('.png') && existsSync(join(DIST, apple.slice(BASE.length))), `apple-touch-icon debe ser PNG existente (${apple})`)

const sw = read('sw.js')
ok(sw.includes('precacheAndRoute'), 'sw.js sin precache')
ok(sw.includes(`createHandlerBoundToURL("${BASE}index.html")`), 'sw.js sin navigateFallback al index del base')
for (const f of ['index.html', 'manifest.webmanifest']) ok(sw.includes(`url:"${f}"`), `precache sin ${f}`)
for (const a of readdirSync(join(DIST, 'assets')).filter(f => /\.(js|css|woff2)$/.test(f))) ok(sw.includes(`assets/${a}`), `precache sin assets/${a}`)

for (const f of walk(DIST).filter(f => /\.(js|css|html)$/.test(f))) {
  const src = readFileSync(f, 'utf8')
  if (/(["'(])\/assets\//.test(src)) errors.push(`${f}: ruta absoluta /assets/ sin base`)
}

if (errors.length) { console.error('check-dist FALLÓ:\n- ' + errors.join('\n- ')); process.exit(1) }
console.log(`check-dist OK (${BASE}): index, manifest, sw, ${readdirSync(join(DIST, 'assets')).length} assets`)
