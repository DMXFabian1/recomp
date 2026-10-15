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
- [x] 8.4 Training engine (doble progresión, −10 %, estancamiento, finalización de sesión, versión corta/mínima, sustitución)
- [x] 8.5 AHORA (check-in parcial, qué toca hoy vía getToday, ayer con adherencia ≠ proteína, acción dominante, No tengo tiempo, Me salí, día irregular)
- [x] 8.6 Entrenamiento (series, evaluación/progresión visibles, sustitución, completar/abandonar/cancelar, aviso fuera de orden, cardio/remo, prueba mensual)
- [x] 8.7 Comida (plan del día, Comí esto, sustituir/adaptar, Me salí, emergencia, omitir, proteína del día, inventario, lista de compras, edición de alimentos)
- [x] 8.8 Progreso (cuerpo, fuerza, cardio, hábitos, metas; fotos locales; sin interpretación)
- [~] 8.12 Deploy + PWA (publicado en https://dmxfabian1.github.io/recomp/ el 2026-10-15; falta la prueba en el teléfono)
- [x] 8.11 Backup e importación desde UI (export completo con fotos, import validado, atómico, con backup preventivo y rollback)
- [x] 8.10 Reporte quincenal para Claude (CoachReport bajo demanda, solo lectura, copiar texto)
- [x] 8.9 Reglas de ajuste (ventana 14 d, A>B>D>E>F, Recommendation pending → aceptar/ignorar; C/sueño/ánimo solo Alert)
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

## Motor de entrenamiento (Fase 8.4)

`domain/progression` (sin UI, sin catálogo):
- `evaluateSession`: clasifica cada sesión del historial para un ejercicio: `not_evaluable` (no completada, sin series, datos inválidos) · `blocked` (RIR 0 en básico, dolor, técnica, short, minimal, sustituida) · `progressed` / `no_progress` / `incomparable`. Bloqueado ≠ bajo el piso: una sesión bloqueada nunca es evidencia de progreso ni de bajo rendimiento. Short/minimal cuentan como adherencia, no como evidencia.
- `decideProgression`: SUBIR (todas las series a reps_max con RIR ≥ target, sin bloqueo → +increment_kg) · −10 % (2 sesiones relevantes consecutivas bajo reps_min a la misma carga y mismos objetivos → ×0.9 redondeado al incremento, siempre por debajo de la actual) · MANTENER (resto). STALL = 3 relevantes consecutivas sin progreso → solo flag; `buildStallAlert` arma la Alert para el informe. Nada cambia ejercicio, rango, volumen ni programa.
- `completeSession`: único lugar donde `rotation_cursor` avanza (test de arquitectura). Idempotente (sesión ya completada no avanza). Abandonar/cancelar no avanzan. Short/minimal completadas avanzan igual. Otra plantilla válida de la rotación: avanza a la siguiente de la completada (advanced_out_of_order; la que tocaba se pierde). Plantilla fuera de la rotación: se cierra la sesión, el cursor no se mueve (template_mismatch).
- `suggestSessionVersion` / `resolveSessionVersion`: sueño < 6 h o time_mode short → corta; time_mode minimal → mínima. Recomendar ≠ aplicar: el usuario decide.
`domain/substitution` (único punto que importa `domain/catalog`): `substituteOptions` (solo compatibles con el perfil; orden calidad → compatible → lateralidad → menor cambio de complejidad; sin functional_rating) y `recordSubstitution` (se guarda en `WorkoutSession.substitutions`; bloquea la progresión de original y sustituto en esa sesión; no toca plantilla ni programa).

## AHORA (Fase 8.5)

- `app/services/now.ts` arma el estado leyendo repos y delegando en `getToday`, `getYesterdayNutritionStatus` y `decideNowAction` (una acción dominante: check-in → continuar sesión → registrar ayer → iniciar sesión → preparar/descansar). No escribe nada.
- `checkin.ts`: upsert parcial por fecha; lo vacío queda sin dato; modo irregular = flag + AppEvent, sin tocar kcal/programa/metas. `meals.ts`: "Me salí" = MealLog `off_plan` con proteína opcional (`null` = no sé); no toca alimentos ni inventario. `sessions.ts`: iniciar sesión abierta con la versión que el usuario elige (sugerencia por sueño/time_mode como dato); una sola abierta; no toca el cursor. "No tengo tiempo" (`domain/progression/timeBudget`): 5 → caminar/preparar, 15 → mínima, 30 → corta, 60+ → completa; registra `no_time`.
- UI: `ui/screens/Ahora.tsx` + `components/CheckInForm`, `Chips`; `ui/screens/Entrenar.tsx` solo muestra la sesión abierta (integración para 8.6). Regla de arquitectura: la UI no importa `@domain/{progression,rotation,nutrition,substitution,catalog,…}`; todo pasa por `app/services`.

## Entrenamiento (Fase 8.6)

- `app/services/training.ts`: `loadSessionView` (ejercicios de la versión, series, `decideProgression` por ejercicio sobre el historial previo), `logSet`/`updateSet`/`removeSet` (targets copiados de la plantilla; sustituido → targets del original; validación Zod; reps 0 = no realizada), `substitutionOptionsFor`/`substituteInSession` (perfil activo; única integración con catálogo vía `domain/substitution`), `finishSession` (transacción: `completeSession` → sesión + programa; decisión final por ejercicio; Alert `stall` una por ejercicio abierto), `abandonOpenSession`/`cancelOpenSession` (programa intacto).
- `app/services/cardio.ts`: `logCardio` (presets z2 20/25/30, intervalos 6×1/8×1; RPE 1–10; sin zonas por pulso) y `logMonthlyTest` (10 min, una por mes, split derivado, reemplazo explícito).
- UI `ui/screens/Entrenar.tsx`: navegación por ejercicio, "Hoy: subir/mantener/bajar/bloqueada/sin datos" con detalle de última vez, tabla de series (calentamientos marcados), registro rápido (kg, reps, RIR, calentamiento, dolor, técnica), sustitución, completar → resumen con decisión por ejercicio y advertencia de fuera de orden; sin sesión: iniciar (hoja compartida con AHORA) + cardio/remo + prueba mensual.
- Corrección necesaria en infra: `DexieRepository.getLive`/`softDelete` devuelven promesas Dexie (antes `async` nativo cerraba transacciones largas con PrematureCommitError).

## Comida (Fase 8.7)

- Cuatro estados que nunca se mezclan: PLANIFICADO (MealPlan/Recipe), CONSUMIDO (MealLog), ESTIMADO (cifras con ≈ o "sin dato"; `null` ≠ 0) y RECOMENDADO (adaptación propuesta por inventario, no persistida hasta registrar).
- Dominio: `nutrition/estimate.ts` (única estimación de receta; `protein.ts` la reutiliza), `nutrition/today.ts` (consumida / objetivo 180 / mínimo 160 / restante; cota inferior explícita), `inventory/status.ts` (>2 / ≤2 / ≤0; consumo solo de alimentos con inventario), `inventory/adapt.ts` (solo FoodEquivalent registrados y solo si el inventario dice que falta), `shopping/needs.ts` (necesario = plan semanal × horizonte de tienda × (1 + reserva) − inventario; Costco 30 / súper 14 / mercado 7).
- Servicios: `nutrition.ts` (`loadDayFood`, `logMeal` planned/substituted/adapted/emergency/skipped en transacción, inventario descontado solo al crear el registro), `meals.ts` (Me salí ahora guarda nota), `inventory.ts`, `shopping.ts`, `food.ts` (edición con Zod; `source: 'user'`; sin proteína o kcal → `missing`).
- Cambio de esquema aditivo: `MealLog.note?: string` (Zod actualizado; sin migración; SCHEMA_VERSION sigue en 2).
- Mutant ISO sigue sin macros (`missing`) hasta que Dany capture la etiqueta en Alimentos.

## Progreso (Fase 8.8)

- Descriptivo: cifras, fechas y gráficas SVG monocromas; nunca juicios ni recomendaciones (eso es 8.9).
- `domain/metrics/`: peso (serie real, promedio 7 d con ≥4 registros reales de la ventana, promedio anterior, pendiente kg/semana por mínimos cuadrados con ≥4 puntos y ≥7 días), cuerpo (cintura, BIA tal cual), fuerza (solo sesiones `completed`; series de trabajo válidas; tonelaje Σ peso × reps; historial de los 4 key lifts por su id real, sin mezclar sustituciones), cardio (semanas lunes–domingo; comparación de pruebas mensuales con deltas), hábitos (adherencia declarada y proteína estimada en columnas separadas; sueño por tramos sin media inventada; pasos; 1–5), metas (meta vs real; kg derivados de baseline solo si existe).
- `app/services/progress.ts` (`loadProgress` con periodo 7/30/todo; `logWaist`, `logBia`), `app/services/photos.ts` (Blob + miniatura en IndexedDB, una por mes y vista, reemplazo y borrado físico; sin red).
- UI `Progreso.tsx`: Cuerpo (peso, cintura, BIA, fotos con cámara/archivo y vista previa por object URL revocada), Fuerza, Cardio, Hábitos, Metas. "Sin datos suficientes" explícito; sin interpolación.

## Reglas de ajuste (Fase 8.9)
- `domain/adjustments/`: `window` (14 días cerrados desde `effective_from` de los Settings vigentes; `end < hoy`; solo la última completa), `inputs` (missing ≠ zero; reutiliza métricas 8.8), `rules` (A–F puras), `evaluate` (prioridad A > B > D > E > F; máximo UNA Recommendation; C solo Alert), `alerts`, `decision` (aceptar/ignorar puros).
- `app/services/adjustments.ts`: `evaluateAdjustmentWindow` (idempotente por `(rule_id, evaluation_period_end)`; nunca crea si hay pending; nunca escribe Settings), `acceptRecommendation` (transacción: Decision + accepted + Settings nueva `change_origin:'recommendation'`, `effective_from = hoy`), `ignoreRecommendation` (Settings intacto); segundo intento → `already_decided`.
- `Recommendation` gana campos opcionales aditivos (`rule_id`, `evaluation_period_*`, `evidence[]`, `proposed_change`); `AlertType` añade `adherence_low` y `strength_drop`. Sin cambio de `SCHEMA_VERSION`, índices, backup ni migraciones.
- `load`/`deload` reservados: no se emiten.
- UI: bloque secundario en MÁS (`AdjustmentPanel`) con qué/por qué/evidencia/qué cambia/qué no cambia y [ACEPTAR CAMBIO] [IGNORAR].

## Reporte quincenal (Fase 8.10)
- `domain/report/`: `buildCoachReport` (pura, determinista) y `renderCoachReportText` (texto estable `CLAVE: valor` con instrucciones para Claude). Reutiliza la ventana de 8.9 (`evaluationWindow`), `buildInputs` (peso %/sem, adherencia, cintura, fuerza comparada) y las métricas de 8.8.
- Periodo: última ventana cerrada; si no hay, la ventana en curso hasta ayer (`partial`); si los Settings cambiaron hoy, `empty`.
- `app/services/report.ts`: `loadCoachReport` solo lee (sin transacción de escritura, sin red, sin fotos). No se persiste: no se usa la colección `coach_reports`.
- UI: bloque "Reporte quincenal" en MÁS con resumen, [VER REPORTE] y [COPIAR PARA CLAUDE] (Clipboard API; si falla, textarea seleccionable). Se regenera cuando el panel de ajustes termina de evaluar o se decide una recomendación.
- `null` siempre se escribe `no_data`; MISSING_DATA lista lo que falta (incluye Mutant ISO sin macros, talk test y fuera de orden no registrados).

## Backup e importación (Fase 8.11)
- Formato existente (`BackupFile`, `schema_version` 2). `photos[]` lleva ahora metadata OBLIGATORIA (date, month, view, width, height, bytes, thumb_mime, created_at, updated_at, source) además de los binarios en base64: una foto sin metadata se rechaza. `Backup.kind` añade `auto_pre_import`. Cambios aditivos: sin subir versión, sin índices ni migraciones nuevas.
- `domain/backup/`: `integrity` (colecciones completas, ids únicos, 30 reglas de referencias del modelo real), `inspect` (JSON → versión → migración existente v1→v2 → entidades → integridad), `build` (serialización determinista, nombre `recomp-backup-YYYY-MM-DD.json`).
- `app/services/backup.ts`: `exportBackup` (solo lectura), `inspectBackup`, `importBackup` (backup preventivo en memoria + store `backups`, UNA transacción sobre todas las colecciones salvo `backups`, verificación dentro y después; rollback explícito; `rollback_failed` explícito), `listLocalBackups`, `localBackupText`. Se conservan 3 preventivos.
- La importación no ejecuta seed, reglas 8.9 ni `completeSession`; el arranque siguiente sí corre el seed de 8.2 (advertido en el resumen).
- UI: bloque "Datos · backup local" en MÁS. Importar: archivo → validación → resumen → [CONFIRMAR IMPORTACIÓN] → advertencia → [IMPORTAR Y REEMPLAZAR]. Estados: idle, reading, invalid_file, validation_error, ready_to_import, importing, success, rollback, failure.

## Deploy y PWA (Fase 8.12)
- Build de producción bajo `/recomp/` verificado por `npm run check:dist` (rutas, manifest, SW, precache, iconos PNG). El workflow `.github/workflows/pages.yml` corre typecheck, lint, tests, build (con `VITE_BUILD_ID = commit`) y `check:dist` antes de desplegar.
- El build visible en MÁS ("build …") identifica la versión instalada.
- Iconos PNG 192/512/maskable y `apple-touch-icon` 180 (iOS no usa SVG).
- Para publicar: crear el repo `recomp` en GitHub, `git remote add origin …`, `git push -u origin main`, y en Settings → Pages elegir "GitHub Actions". URL esperada: `https://<usuario>.github.io/recomp/`.
