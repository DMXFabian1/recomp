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

- [x] 8.1 Foundation
- [x] 8.2 Catálogo de ejercicios (esquema v2, libro DK/BWLA, variantes, grupos de sustitución, warmups, objetivos)
- [x] 8.3 Domain model: schemas Zod, backup validado, getToday, nutrición de ayer
- [ ] 8.4 Training engine
- [ ] 8.5 AHORA
- [ ] 8.6 Entrenamiento
- [ ] 8.7 Comida
- [ ] 8.8 Progreso
- [ ] 8.9 Reglas de ajuste
- [ ] 8.10 Backup / Import / Export
- [ ] 8.11 Coach report

## Catálogo de ejercicios (Fase 8.2)

- **Esquema v2** (`SCHEMA_VERSION = 2`): `Exercise` gana campos de catálogo (patrones, músculos, equipo, `functional_rating`, cues, `field_provenance`…) y aparecen `exercise_variants`, `exercise_substitution_groups`, `warmup_exercises`, `training_goals`. Los campos v1 que usa el motor (`pattern`, `equipment`, `increment_kg`, `is_basic`, `is_key_lift`, `substitutes`) no cambian.
- **Migración v1→v2**: backup automático previo; `enrichLegacyExercise` deriva los campos v2 de los v1 (procedencia `manual`) sin tocar ids ni sets. El mismo mapeo se aplica a backups v1 al importar (`MIGRATIONS[1]`).
- **Seed**: `src/app/seed/catalog/` — 104 ejercicios de *Strength Training* (DK/BWLA 2009; `source_page` = página del libro) + 9 manuales = 113. Sobre una base ya sembrada, el seed inserta los faltantes y enriquece solo registros de sistema nunca editados; en registros editados por el usuario solo rellena campos ausentes.
- **Reglas congeladas**: `functional_rating` y los valores típicos de `TrainingGoal` son solo descriptivos (el test de arquitectura prohíbe que `domain/progression` y afines importen el catálogo). Compatibilidad de equipo estricta: un ejercicio es incompatible si falta cualquiera de sus elementos, aunque exista un sustituto compatible. Remo prono con mancuernas (p. 106) y remo con pecho apoyado en máquina son ejercicios distintos relacionados solo por grupo de sustitución.

## Dominio y validación (Fase 8.3)

- `domain/validation`: un schema Zod por colección (`ENTITY_SCHEMAS`), `validateEntity` y `validateBackup`/`parseBackupJson`. Zod valida la **forma** (tipos, enums, rangos, fechas, relaciones internas); nunca contiene reglas de negocio. La validación es pura: en éxito devuelve la misma referencia.
- `domain/rotation/getToday`: calcula qué toca hoy a partir de programa activo, `effective_from`, `rotation_cursor` y sesiones existentes. **Nunca modifica el cursor** ni crea sesiones.
- `domain/nutrition`: `calculateEstimatedProtein` (solo con MealLog/recetas/alimentos de ayer; sin datos → `unknown`/`no_data`, nunca inventa) y `getYesterdayNutritionStatus` (adherencia desde `food_yesterday` y proteína completa ≥ piso, ejes independientes).
- `domain/progression/types.ts`: solo contratos para 8.4; sin lógica.
- Inicio real del programa: `effective_from = 2026-10-06`, primera sesión Pierna A; no se crean sesiones retroactivas ni perdidas.
