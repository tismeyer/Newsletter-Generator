export function Field({ label, hint, children, span }) {
  return (
    <label className="f" style={span ? { gridColumn: "1/-1" } : undefined}>
      <span>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Segmented({ options, value, onChange, label, disabled }) {
  return (
    <div>
      {label && <span className="hint block">{label}</span>}
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={disabled}
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A dropdown that also accepts free text via a "Custom…" entry. */
export function PickOrType({ options, custom, value, onChange }) {
  const isCustom = !options.includes(value);
  return (
    <>
      <select
        value={isCustom ? custom : value}
        onChange={(e) => onChange(e.target.value === custom ? "" : e.target.value)}
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
        <option>{custom}</option>
      </select>
      {isCustom && (
        <input
          type="text"
          autoFocus
          className="mt6"
          placeholder="Type your own"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}
