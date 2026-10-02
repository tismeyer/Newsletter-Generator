import { useEffect, useLayoutEffect, useRef } from "react";

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

/** A textarea styled as printed body text that grows with what is typed. */
export function GrowText({ value, onChange, placeholder, className, ariaLabel }) {
  const ref = useRef(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight leaves out the border; add it back or the last line clips.
    el.style.height = el.scrollHeight + (el.offsetHeight - el.clientHeight) + "px";
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    // Rewrapping (a card switching between half and full width) changes height too.
    let width = 0;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w !== width) {
        width = w;
        fit();
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={"inline-field grow " + (className || "")}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Closes a popover on an outside click or Escape. */
export function useDismiss(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open, setOpen]);
  return ref;
}

// ---------- import flags ----------
// Where a Word import had to guess, the field gets a yellow outline and a note.

export const flagCls = (flags, k) => (flags && flags[k] ? " flagged" : "");

export function unflag(flags, k) {
  if (!flags || !flags[k]) return flags;
  const { [k]: _, ...rest } = flags;
  return rest;
}

export function FlagNotes({ flags, labels, onDismiss }) {
  const keys = Object.keys(flags || {});
  if (!keys.length) return null;
  return (
    <ul className="flagnotes">
      {keys.map((k) => (
        <li key={k}>
          <span className="fn-where">{labels[k] || k}:</span> {flags[k]}
          <button
            type="button"
            className="fn-ok"
            title="Checked: hide this note"
            onClick={() => onDismiss(k)}
          >
            OK
          </button>
        </li>
      ))}
    </ul>
  );
}
