/**
 * COMIDA — Fase 8.7. "¿Qué debería comer hoy?" → VER → REGISTRAR → ADAPTAR → CONTINUAR.
 * Vistas: Hoy · Inventario · Compras · Alimentos. Toda regla viene de app/services.
 * PLANIFICADO (plan) ≠ CONSUMIDO (registro) ≠ ESTIMADO (cifras con "≈" o "sin dato") ≠ RECOMENDADO (adaptación propuesta).
 */
import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Repeat, ShoppingCart, Trash2 } from 'lucide-react'
import type { Food, InventoryStatus, MealSlot, MealSubstitution } from '@domain/entities'
import { isAppError } from '@domain/errors'
import {
  closeShoppingList, equivalentOptions, generateShoppingList, loadDayFood, loadShopping, logMeal, logOffPlan,
  NUTRITION_LABEL, removeInventory, setInventoryPortions, setInventoryStatus, STORE_LABEL, toggleShoppingItem, updateFood,
  type DayFoodView, type FoodPatch, type ShoppingView, type SlotView,
} from '@app/services'
import { localDay } from '@domain/time/day'
import { useApp } from '../AppContext'
import { Chips } from '../components/Chips'

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Desayuno', lunch: 'Comida', snack: 'Snack', dinner: 'Cena' }
const STATUS_LABEL: Record<string, string> = { planned: 'comí lo planeado', substituted: 'sustituida', adapted: 'adaptada', off_plan: 'me salí', emergency: 'emergencia', skipped: 'omitida' }
const INV_LABEL: Record<InventoryStatus, string> = { available: 'Disponible', low: 'Queda poco', out: 'Agotado' }
const nowIso = () => new Date().toISOString()

type View = 'today' | 'inventory' | 'shopping' | 'foods'

export function Comida() {
  const { storage } = useApp()
  const [view, setView] = useState<View>('today')
  const [day, setDay] = useState<DayFoodView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [today] = useState(() => localDay(new Date()))

  const refresh = useCallback(() => {
    loadDayFood(storage, today).then(d => { setDay(d); setError(null) }).catch((e: unknown) => setError(isAppError(e) ? e.message : 'No se pudo leer.'))
  }, [storage, today])
  useEffect(() => { refresh() }, [refresh])
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); refresh() } catch (e) { setError(isAppError(e) ? e.message : 'No se pudo guardar.') } }

  if (!day) return <><div className="eyebrow">Comida</div><p className="muted">{error ?? 'Cargando…'}</p></>

  return (
    <>
      <div className="eyebrow">Comida · {new Date(`${day.date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
      <nav className="ex-nav" aria-label="Vistas">
        {(['today', 'inventory', 'shopping', 'foods'] as const).map(v => (
          <button key={v} className={`ex-pill${view === v ? ' on' : ''}`} onClick={() => setView(v)}>{{ today: 'Hoy', inventory: 'Inventario', shopping: 'Compras', foods: 'Alimentos' }[v]}</button>
        ))}
      </nav>
      {error && <div className="banner">{error}</div>}
      {view === 'today' && <Today day={day} act={act} />}
      {view === 'inventory' && <Inventory day={day} act={act} />}
      {view === 'shopping' && <Shopping onError={setError} />}
      {view === 'foods' && <Foods day={day} act={act} />}
    </>
  )
}

// ───────────────────────── HOY ─────────────────────────

function Today({ day, act }: { day: DayFoodView; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const p = day.protein
  return (
    <>
      <section className="primary">
        <div className="eyebrow">Proteína hoy</div>
        {p.consumed_g === null ? (
          <div className="primary-title">Sin datos suficientes</div>
        ) : (
          <div className="primary-title">{p.is_lower_bound ? '≥ ' : ''}{p.consumed_g} g <span className="muted small">de {p.target_g} g</span></div>
        )}
        <dl className="kv">
          <dt>Objetivo</dt><dd>{p.target_g} g</dd>
          <dt>Mínimo</dt><dd>{p.floor_g} g</dd>
          <dt>Restante al objetivo</dt><dd>{p.remaining_to_target === null ? 'sin dato' : `${p.remaining_to_target} g`}</dd>
          <dt>Estado</dt><dd className={p.estimate.status === 'complete' ? 'status-ok' : p.estimate.status === 'unknown' ? 'status-warn' : ''}>{{ complete: 'mínimo cubierto', incomplete: 'por debajo del mínimo', unknown: `${p.estimate.unknown_meals} comida(s) sin dato`, no_data: 'sin registros' }[p.estimate.status]}</dd>
        </dl>
        {p.is_lower_bound && p.consumed_g !== null && <p className="muted small">Cifra mínima: hay comidas con proteína desconocida (no se cuentan como 0).</p>}
      </section>
      {!day.has_plan && <p className="note status-warn">Sin plan para hoy. Puedes registrar lo que comiste, una emergencia o una omisión.</p>}
      {day.slots.map(s => <SlotBlock key={s.slot} day={day} s={s} act={act} />)}
      <p className="muted small">Ayer: adherencia {{ high: 'alta', medium: 'media', low: 'baja', unknown: 'sin dato' }[day.yesterday.adherence]} · proteína {day.yesterday.protein_complete === null ? 'sin dato' : day.yesterday.protein_complete ? 'completa' : 'incompleta'} (señales independientes).</p>
    </>
  )
}

function SlotBlock({ day, s, act }: { day: DayFoodView; s: SlotView; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { storage } = useApp()
  const [open, setOpen] = useState<'none' | 'adapt' | 'off' | 'emergency'>('none')
  const foodName = (id: string) => day.foods.find(f => f.id === id)?.name ?? id
  const log = s.log
  const est = s.consumed_estimate
  return (
    <section className="block">
      <div className="row-head">
        <span className="eyebrow">{SLOT_LABEL[s.slot]}{s.plan ? ` · ${s.plan.time}` : ''}</span>
        {log && <span className={`small ${log.status === 'off_plan' ? 'status-warn' : log.status === 'skipped' ? 'muted' : 'status-ok'}`}>{STATUS_LABEL[log.status]}</span>}
      </div>

      {/* PLAN */}
      {s.planned_recipe ? (
        <div>
          <div className="plan-title">{s.planned_recipe.name}</div>
          <ul className="items">
            {s.planned_recipe.items.map(it => <li key={it.food_id}><span className="mono">{it.portions}×</span> {foodName(it.food_id)} <span className="muted small">{portionLabel(day.foods, it.food_id)}</span></li>)}
          </ul>
          <div className="muted small">Plan: proteína {s.planned_estimate?.protein_g === null ? 'sin dato (' + s.planned_estimate.missing_protein.map(foodName).join(', ') + ')' : `≈ ${s.planned_estimate?.protein_g} g`}{s.planned_estimate?.kcal != null ? ` · ≈ ${s.planned_estimate.kcal} kcal` : ''}</div>
        </div>
      ) : <p className="muted small">Sin plan para esta comida.</p>}

      {/* CONSUMIDO */}
      {log && (
        <div className="consumed">
          <div className="small"><strong>Registrado:</strong> {log.status === 'off_plan' ? `fuera del plan · proteína ${log.off_plan_protein_g === null || log.off_plan_protein_g === undefined ? 'no sé' : `≈ ${log.off_plan_protein_g} g`}` : log.status === 'skipped' ? 'omitida' : `${s.logged_recipe?.name ?? ''} · proteína ${est?.protein_g === null ? 'sin dato' : `≈ ${est?.protein_g} g`}`}{log.note ? ` · ${log.note}` : ''}</div>
          {est && est.items.some(i => i.substituted_for) && (
            <ul className="items small">{est.items.filter(i => i.substituted_for).map(i => <li key={i.food_id}>{foodName(i.substituted_for!)} → <span className="mono">{i.portions}×</span> {foodName(i.food_id)}</li>)}</ul>
          )}
        </div>
      )}

      {/* RECOMENDADO */}
      {s.adaptation && !log && (
        <p className="note status-warn">Según tu inventario falta {s.adaptation.missing.map(foodName).join(', ')}.{s.adaptation.substitutions.length > 0 ? ` Propuesta: ${s.adaptation.substitutions.map(x => `${foodName(x.food_id)} → ${x.portions}× ${foodName(x.substitute_food_id)}`).join('; ')}.` : ''}{s.adaptation.unresolved.length > 0 ? ` Sin equivalente disponible para ${s.adaptation.unresolved.map(foodName).join(', ')}.` : ''}</p>
      )}

      <div className="quick">
        {s.planned_recipe && <button className="btn" onClick={() => act(() => logMeal(storage, { date: day.date, slot: s.slot, status: 'planned' }, nowIso()))}><Check size={16} aria-hidden /> Comí esto</button>}
        {s.adaptation && s.adaptation.substitutions.length > 0 && !log && <button className="btn secondary" onClick={() => act(() => logMeal(storage, { date: day.date, slot: s.slot, status: 'adapted', substitutions: s.adaptation!.substitutions }, nowIso()))}>Comí la adaptación</button>}
        {s.planned_recipe && <button className="btn secondary" onClick={() => setOpen(o => o === 'adapt' ? 'none' : 'adapt')}><Repeat size={16} aria-hidden /> Sustituir</button>}
        <button className="btn secondary" onClick={() => setOpen(o => o === 'off' ? 'none' : 'off')}>Me salí</button>
        <button className="btn secondary" onClick={() => setOpen(o => o === 'emergency' ? 'none' : 'emergency')}>Emergencia</button>
        <button className="btn secondary" onClick={() => act(() => logMeal(storage, { date: day.date, slot: s.slot, status: 'skipped' }, nowIso()))}>Omití</button>
      </div>
      {open === 'adapt' && s.planned_recipe && <SubstituteSheet day={day} s={s} onSave={subs => act(async () => { await logMeal(storage, { date: day.date, slot: s.slot, status: 'substituted', substitutions: subs }, nowIso()); setOpen('none') })} />}
      {open === 'off' && <OffPlanSheet onSave={(protein, note) => act(async () => { await logOffPlan(storage, { date: day.date, slot: s.slot, protein_g: protein, ...(note ? { note } : {}) }, nowIso()); setOpen('none') })} />}
      {open === 'emergency' && (
        <div className="sheet">
          <div className="eyebrow">Receta de emergencia</div>
          {day.emergency_recipes.length === 0 ? <p className="muted small">No hay recetas de emergencia.</p> : day.emergency_recipes.map(r => (
            <button key={r.id} className="option" onClick={() => act(async () => { await logMeal(storage, { date: day.date, slot: s.slot, status: 'emergency', recipe_id: r.id }, nowIso()); setOpen('none') })}>
              <span>{r.name}</span><span className="muted small">{r.items.map(i => `${i.portions}× ${foodName(i.food_id)}`).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function portionLabel(foods: Food[], id: string) {
  const f = foods.find(x => x.id === id)
  return f ? `(${f.portion_label})` : ''
}

function SubstituteSheet({ day, s, onSave }: { day: DayFoodView; s: SlotView; onSave: (subs: MealSubstitution[]) => void }) {
  const { storage } = useApp()
  const recipe = s.planned_recipe!
  const [subs, setSubs] = useState<MealSubstitution[]>([])
  const [opts, setOpts] = useState<Record<string, Array<{ id: string; name: string; portions: number }>>>({})
  const [openFood, setOpenFood] = useState<string | null>(null)
  const foodName = (id: string) => day.foods.find(f => f.id === id)?.name ?? id
  const load = (foodId: string, portions: number) => {
    setOpenFood(f => f === foodId ? null : foodId)
    if (!opts[foodId]) equivalentOptions(storage, foodId).then(o => setOpts(prev => ({ ...prev, [foodId]: o.map(x => ({ id: x.food.id, name: x.food.name, portions: Math.round(portions * x.equivalent.ratio * 100) / 100 })) }))).catch(() => undefined)
  }
  return (
    <div className="sheet">
      <div className="eyebrow">Sustituir alimentos (solo equivalentes registrados)</div>
      <ul className="items">
        {recipe.items.map(it => {
          const chosen = subs.find(x => x.food_id === it.food_id)
          return (
            <li key={it.food_id}>
              <button className="link-row" onClick={() => load(it.food_id, it.portions)} aria-expanded={openFood === it.food_id}>
                <span><span className="mono">{it.portions}×</span> {foodName(it.food_id)}{chosen ? <span className="status-warn"> → {chosen.portions}× {foodName(chosen.substitute_food_id)}</span> : ''}</span>
                {openFood === it.food_id ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
              </button>
              {openFood === it.food_id && (
                <div className="chips">
                  {opts[it.food_id] === undefined ? <span className="muted small">Buscando…</span> : opts[it.food_id]!.length === 0 ? <span className="muted small">Sin equivalente disponible</span> : opts[it.food_id]!.map(o => (
                    <button key={o.id} className={`chip${chosen?.substitute_food_id === o.id ? ' on' : ''}`} onClick={() => setSubs(prev => [...prev.filter(x => x.food_id !== it.food_id), { food_id: it.food_id, substitute_food_id: o.id, portions: o.portions }])}>{o.portions}× {o.name}</button>
                  ))}
                  {chosen && <button className="chip" onClick={() => setSubs(prev => prev.filter(x => x.food_id !== it.food_id))}>Quitar</button>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <button className="btn" disabled={subs.length === 0} onClick={() => onSave(subs)}>Registrar sustituida</button>
      <p className="muted small">El plan original no cambia; queda registrado lo que realmente comiste.</p>
    </div>
  )
}

function OffPlanSheet({ onSave }: { onSave: (protein: number | null, note: string) => void }) {
  const [protein, setProtein] = useState('')
  const [note, setNote] = useState('')
  return (
    <div className="sheet">
      <div className="eyebrow">Me salí</div>
      <div className="two">
        <label className="field"><span>Proteína aprox. (g) · opcional</span><input inputMode="decimal" value={protein} onChange={e => setProtein(e.target.value)} placeholder="no sé" /></label>
        <label className="field"><span>Nota · opcional</span><input value={note} onChange={e => setNote(e.target.value)} maxLength={80} /></label>
      </div>
      <button className="btn" onClick={() => onSave(protein.trim() === '' ? null : Number(protein.replace(',', '.')), note.trim())}>Registrar</button>
      <p className="muted small">Vacío = "no sé": no se cuenta como 0.</p>
    </div>
  )
}

// ───────────────────────── INVENTARIO ─────────────────────────

function Inventory({ day, act }: { day: DayFoodView; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { storage } = useApp()
  const [edit, setEdit] = useState<Record<string, string>>({})
  const inv = new Map(day.inventory.map(i => [i.food_id, i]))
  const foods = [...day.foods].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  return (
    <>
      <p className="muted small">Disponible &gt; 2 porciones · Queda poco ≤ 2 · Agotado 0. Sin registro = no se sabe (no se inventa).</p>
      {foods.map(f => {
        const i = inv.get(f.id)
        return (
          <div key={f.id} className="inv-row">
            <div className="inv-name">{f.name}<div className="muted small">{f.portion_label} · {f.purchase_unit} = {f.portions_per_unit} porciones</div></div>
            <div className="inv-ctl">
              <span className={`small ${i ? (i.status === 'available' ? 'status-ok' : i.status === 'low' ? 'status-warn' : 'status-crit') : 'muted'}`}>{i ? `${INV_LABEL[i.status]} · ${i.portions_left}` : 'sin registro'}</span>
              <div className="chips">
                {(['available', 'low', 'out'] as const).map(st => <button key={st} className={`chip${i?.status === st ? ' on' : ''}`} onClick={() => act(() => setInventoryStatus(storage, f.id, st, nowIso()))}>{INV_LABEL[st]}</button>)}
                <input className="inv-input" inputMode="decimal" placeholder="porciones" value={edit[f.id] ?? ''} onChange={e => setEdit(p => ({ ...p, [f.id]: e.target.value }))} />
                <button className="chip" disabled={!edit[f.id]} onClick={() => act(async () => { await setInventoryPortions(storage, f.id, Number(edit[f.id]!.replace(',', '.')), nowIso(), true); setEdit(p => ({ ...p, [f.id]: '' })) })}>Fijar</button>
                {i && <button className="link" aria-label="Quitar registro" onClick={() => act(() => removeInventory(storage, f.id, nowIso()))}><Trash2 size={14} aria-hidden /></button>}
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

// ───────────────────────── COMPRAS ─────────────────────────

function Shopping({ onError }: { onError: (m: string) => void }) {
  const { storage } = useApp()
  const [v, setV] = useState<ShoppingView | null>(null)
  const load = useCallback(() => { loadShopping(storage).then(setV).catch((e: unknown) => onError(isAppError(e) ? e.message : 'No se pudo leer.')) }, [storage, onError])
  useEffect(() => { load() }, [load])
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); load() } catch (e) { onError(isAppError(e) ? e.message : 'No se pudo guardar.') } }
  if (!v) return <p className="muted">Cargando…</p>
  const pending = v.needs.filter(n => n.missing_portions > 0)
  const groups = (['costco', 'super', 'market'] as const)
  return (
    <>
      <div className="quick">
        <button className="btn" onClick={() => act(() => generateShoppingList(storage, nowIso()))}><ShoppingCart size={16} aria-hidden /> {v.list ? 'Regenerar lista' : 'Generar lista'}</button>
        {v.list && <button className="btn secondary" onClick={() => act(() => closeShoppingList(storage, v.list!.id, nowIso()))}>Cerrar lista</button>}
      </div>
      <p className="muted small">Comprar = necesario (plan × horizonte + {v.list?.reserve_pct ?? 10} % reserva) − inventario. Horizontes: Costco 30 d · súper 14 d · mercado 7 d. {pending.length} alimentos por comprar según el plan actual.</p>
      {v.list ? groups.map(store => {
        const rows = v.items.filter(i => i.item.store === store)
        if (rows.length === 0) return null
        return (
          <section key={store} className="block">
            <div className="eyebrow">{STORE_LABEL[store]}</div>
            <ul className="shop">
              {rows.map(({ item, food, need }) => (
                <li key={item.id} className={item.checked ? 'checked' : ''}>
                  <label>
                    <input type="checkbox" checked={item.checked} onChange={e => act(() => toggleShoppingItem(storage, item.id, e.target.checked, nowIso()))} />
                    <span className="shop-name">{food.name} <span className="mono">× {item.buy_units}</span> <span className="muted small">{food.purchase_unit}</span></span>
                  </label>
                  <div className="muted small">{need?.reason ?? `${item.needed_portions} porciones − ${item.have_portions} en inventario`}</div>
                </li>
              ))}
            </ul>
          </section>
        )
      }) : <p className="muted">No hay lista abierta. Genera una a partir del plan y tu inventario.</p>}
    </>
  )
}

// ───────────────────────── ALIMENTOS ─────────────────────────

function Foods({ day, act }: { day: DayFoodView; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { storage } = useApp()
  const [editing, setEditing] = useState<string | null>(null)
  const foods = [...day.foods].sort((a, b) => (a.nutrition_status === 'missing' ? -1 : 1) - (b.nutrition_status === 'missing' ? -1 : 1) || a.name.localeCompare(b.name))
  return (
    <>
      <p className="muted small">"Desconocido" significa que no hay macros capturados: no se usa 0. Captura la etiqueta para que cuente.</p>
      {foods.map(f => (
        <div key={f.id} className="block">
          <div className="row-head">
            <span>{f.name} <span className={`small ${f.nutrition_status === 'missing' ? 'status-warn' : 'muted'}`}>· {NUTRITION_LABEL[f.nutrition_status]}{f.source === 'user' ? ' · editado' : ''}</span></span>
            <button className="link" onClick={() => setEditing(e => e === f.id ? null : f.id)}>{editing === f.id ? 'Cerrar' : 'Editar'}</button>
          </div>
          <div className="muted small">{f.portion_label}{f.protein_g !== undefined ? ` · proteína ${f.protein_g} g` : ' · proteína sin dato'}{f.kcal !== undefined ? ` · ${f.kcal} kcal` : ''}{f.carb_g !== undefined ? ` · carb ${f.carb_g} g` : ''}{f.fat_g !== undefined ? ` · grasa ${f.fat_g} g` : ''} · {f.store}</div>
          {editing === f.id && <FoodForm food={f} onSave={patch => act(async () => { await updateFood(storage, f.id, patch, nowIso()); setEditing(null) })} />}
        </div>
      ))}
    </>
  )
}

function FoodForm({ food, onSave }: { food: Food; onSave: (p: FoodPatch) => void }) {
  const s = (v: number | undefined) => (v === undefined ? '' : String(v))
  const [name, setName] = useState(food.name)
  const [portion, setPortion] = useState(food.portion_label)
  const [protein, setProtein] = useState(s(food.protein_g))
  const [kcal, setKcal] = useState(s(food.kcal))
  const [carb, setCarb] = useState(s(food.carb_g))
  const [fat, setFat] = useState(s(food.fat_g))
  const [status, setStatus] = useState<Food['nutrition_status']>(food.nutrition_status === 'missing' ? 'verified' : food.nutrition_status)
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')))
  return (
    <form className="form" onSubmit={e => { e.preventDefault(); onSave({ name, portion_label: portion, protein_g: num(protein), kcal: num(kcal), carb_g: num(carb), fat_g: num(fat), nutrition_status: status }) }}>
      <div className="two">
        <label className="field"><span>Nombre</span><input value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="field"><span>Porción</span><input value={portion} onChange={e => setPortion(e.target.value)} /></label>
      </div>
      <div className="two">
        <label className="field"><span>Proteína (g / porción)</span><input inputMode="decimal" value={protein} onChange={e => setProtein(e.target.value)} placeholder="sin dato" /></label>
        <label className="field"><span>kcal / porción</span><input inputMode="decimal" value={kcal} onChange={e => setKcal(e.target.value)} placeholder="sin dato" /></label>
      </div>
      <div className="two">
        <label className="field"><span>Carbohidratos (g)</span><input inputMode="decimal" value={carb} onChange={e => setCarb(e.target.value)} /></label>
        <label className="field"><span>Grasa (g)</span><input inputMode="decimal" value={fat} onChange={e => setFat(e.target.value)} /></label>
      </div>
      <Chips label="Origen del dato" options={[{ v: 'verified', l: 'Etiqueta' }, { v: 'estimated', l: 'Estimado' }]} value={status} onChange={v => setStatus(v as Food['nutrition_status'])} />
      <button className="btn" type="submit">Guardar</button>
      <p className="muted small">Sin proteína o kcal el alimento queda como desconocido. Lo que captures se marca como editado por ti.</p>
    </form>
  )
}
