/** Selector de una opción (chips). Sin color de estado: el color solo expresa estado del sistema. */
export interface ChipOption { v: string | number; l: string }

export function Chips({ label, options, value, onChange }: { label?: string; options: ChipOption[]; value: string | number | null; onChange: (v: string | number) => void }) {
  return (
    <div className="chips-row" role="group" aria-label={label}>
      {label && <span className="chips-label">{label}</span>}
      <div className="chips">
        {options.map(o => (
          <button key={String(o.v)} type="button" className={`chip${value === o.v ? ' on' : ''}`} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>
        ))}
      </div>
    </div>
  )
}
