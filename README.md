# Recomp

App personal de recomposición corporal: PLAN → EJECUTAR → REGISTRAR → ANALIZAR → AJUSTAR.
PWA local-first (React + TypeScript + Vite + IndexedDB). Sin backend, sin analytics, sin red en V1.

Especificación congelada: *Documento maestro de diseño* (Fases 2–7) y *Revisión final de consistencia*.

## Requisitos

- Node 22 o superior (probado con 22.22) y npm.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm install` | Instala dependencias. |
| `npm run dev` | Servidor de desarrollo en `http://localhost:5173/recomp/`. |
| `npm test` | Ejecuta todos los tests (Vitest, IndexedDB simulada). |
| `npm run test:watch` | Tests en modo observador. |
| `npm run test:coverage` | Tests con cobertura (domain, app, infra). |
| `npm run typecheck` | `tsc -b` en modo estricto. |
| `npm run lint` | oxlint. |
| `npm run build` | Typecheck + build de producción en `dist/` (incluye service worker y manifest). |
| `npm run preview` | Sirve `dist/` en `http://localhost:4173/recomp/`. |

## Despliegue (GitHub Pages, decisión aprobada para V1)

1. Crea un repositorio `recomp` en GitHub y sube este proyecto.
2. En *Settings → Pages* elige *GitHub Actions* como origen.
3. El flujo `.github/workflows/pages.yml` construye y publica en cada push a `main`.
4. La app queda en `https://<usuario>.github.io/recomp/`. Ábrela en el iPhone en Safari → Compartir → *Añadir a pantalla de inicio*.

Si prefieres tu servidor, sirve `dist/` por HTTPS en la ruta `/recomp/` (o compila con `VITE_BASE=/ npm run build` para la raíz).

## Arquitectura (Fase 3)

```
src/
  domain/      entidades (tipos), errores, backup/schema + migraciones. TypeScript puro: sin React, sin Dexie.
  app/         casos de uso y arranque (bootstrap), seed. Depende de domain y repo.
  repo/        interfaces Repository / UnitOfWork / Storage. Solo tipos.
  infra/dexie/ implementación V1 sobre IndexedDB (Dexie): esquema por versión, backup pre-migración, transacciones.
  ui/          React. Solo habla con app y con los tipos de domain/repo. Nunca importa Dexie.
  test/        setup (fake-indexeddb) y el test de arquitectura que verifica estas reglas.
```

Reglas de dependencia verificadas por `src/test/architecture.test.ts`:
`ui → app, domain, repo` · `app → domain, repo` · `domain → nada` · `repo → domain` · `infra → domain, repo`.
`app/bootstrap.ts` es la única excepción (composición raíz: ensambla infra con app).

## Persistencia y migraciones

- `SCHEMA_VERSION` (`src/domain/backup/schema.ts`) es el único número de versión: lo usan Dexie, el backup JSON y las migraciones.
- Esquema de stores por versión en `src/infra/dexie/schema.ts` (`DEXIE_SCHEMAS`). Migraciones del backup en `src/domain/backup/migrations.ts` (`MIGRATIONS`).
- Antes de abrir la base con una versión mayor que la instalada, `preMigrationBackup` guarda un backup automático en el store `backups` (se conservan 3). Si la actualización falla, la base queda en la versión anterior.
- Cada caso de uso escribe en una sola transacción (`storage.run([...colecciones], repos => …)`): si lanza, nada se persiste.
- Dentro de una transacción, usa los métodos del repositorio tal cual (devuelven promesas de Dexie). No esperes `setTimeout`, `fetch` ni promesas ajenas dentro de `run`: Dexie cerraría la transacción.

## Seed

`seedIfEmpty` (`src/app/seed/seed.ts`) siembra solo las colecciones vacías, en una transacción, y registra un `AppEvent` `seed`.
Los datos están en `src/app/seed/data.ts` y provienen del protocolo aprobado. **Mutant ISO se siembra sin macros** (`nutrition_status: 'missing'`); los demás alimentos llevan valores de referencia marcados `estimated`, editables en MÁS → Alimentos (Fase 8.6).

## Estado por fase

- [x] 8.1 Foundation (este commit)
- [ ] 8.2 Domain model (validadores, servicios base)
- [ ] 8.3 Training engine
- [ ] 8.4 AHORA
- [ ] 8.5 Entrenamiento
- [ ] 8.6 Comida
- [ ] 8.7 Progreso
- [ ] 8.8 Reglas de ajuste
- [ ] 8.9 Backup / Import / Export
- [ ] 8.10 Coach report
