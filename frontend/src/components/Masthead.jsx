import { useEffect, useRef, useState } from "react";
import { DOC_TYPES, KICKERS, departmentFrom, fmtDate } from "../model.js";
import logo from "../assets/logo.png";
import icon from "../assets/icon.png";

const REVISIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

/**
 * An input that looks like the finished document rather than a form field, and
 * grows with its content. Editors change the masthead where they can see it, so
 * there is nothing to map between a field label and the printed result.
 */
function Inline({ value, onChange, placeholder, className, ariaLabel, min = 4 }) {
  const width = Math.max(min, (value || placeholder || "").length + 1);
  return (
    <input
      type="text"
      className={"inline-field " + (className || "")}
      style={{ width: width + "ch" }}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** The chooser beside a field that has a list of usual answers. */
function PickButton({ options, value, onPick, label }) {
  const [open, setOpen] = useState(false);
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
  }, [open]);

  return (
    <span className="picker" ref={ref}>
      <button
        type="button"
        className="pickbtn"
        aria-label={"Choose " + label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        +
      </button>
      {open && (
        <ul className="pickmenu" role="listbox">
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                role="option"
                aria-selected={o === value}
                className={o === value ? "on" : ""}
                onClick={() => {
                  onPick(o);
                  setOpen(false);
                }}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

export default function Masthead({ state, patch }) {
  const m = state.masthead;
  const set = (k, v) => patch({ masthead: { ...m, [k]: v } });

  const setKicker = (v) => {
    const next = { ...m, header_kicker: v };
    if (!state.issuedByTouched) next.footer_issued_by = departmentFrom(v);
    patch({ masthead: next });
  };

  const setIssuedBy = (v) =>
    patch({
      masthead: { ...m, footer_issued_by: v || departmentFrom(m.header_kicker) },
      issuedByTouched: Boolean(v.trim()),
    });

  return (
    <fieldset>
      <legend>Masthead</legend>
      <p className="hint mb10">
        Edit the masthead as it will appear. Use{" "}
        <span className="pickbtn inlinehint">+</span> where there is a list to pick from.
      </p>

      <div className="mast">
        <div className="mast-top">
          <img className="mast-icon" src={icon} alt="" />
          <Inline
            className="mast-kicker"
            value={m.header_kicker}
            onChange={setKicker}
            placeholder="PUBLICATION NAME"
            ariaLabel="Publication name"
            min={20}
          />
          <PickButton
            options={KICKERS}
            value={m.header_kicker}
            onPick={setKicker}
            label="publication"
          />
          <span className="spacer" />
          <img className="mast-logo" src={logo} alt="helvetic airways" />
        </div>

        <div className="mast-title">
          <Inline
            className="t-type"
            value={m.doc_type}
            onChange={(v) => set("doc_type", v)}
            placeholder="Newsletter"
            ariaLabel="Document type"
            min={8}
          />
          <PickButton
            options={DOC_TYPES}
            value={m.doc_type}
            onPick={(v) => set("doc_type", v)}
            label="document type"
          />
          <span className="t-dash">&ndash;</span>
          <Inline
            className="t-issue"
            value={m.doc_issue}
            onChange={(v) => set("doc_issue", v)}
            placeholder="10 2026"
            ariaLabel="Issue"
            min={7}
          />
        </div>

        <Inline
          className="mast-headline"
          value={m.doc_headline}
          onChange={(v) => set("doc_headline", v)}
          placeholder="Headline for this edition"
          ariaLabel="Headline"
          min={28}
        />

        <div className="mast-daterow">
          <span className="mast-date">{fmtDate(m.publication_date)}</span>
          <input
            type="date"
            className="datepick"
            value={m.publication_date}
            aria-label="Publication date"
            onChange={(e) => set("publication_date", e.target.value)}
          />
        </div>

        <div className="mast-foot">
          <b>Issued by:</b>
          <Inline
            className="f-issued"
            value={m.footer_issued_by || departmentFrom(m.header_kicker)}
            onChange={setIssuedBy}
            placeholder="Department"
            ariaLabel="Issued by"
            min={14}
          />
          <span className="f-sep">&middot;</span>
          <span>Rev.</span>
          <Inline
            className="f-rev"
            value={m.footer_revision}
            onChange={(v) => set("footer_revision", v)}
            placeholder="01"
            ariaLabel="Revision"
            min={3}
          />
          <PickButton
            options={REVISIONS}
            value={m.footer_revision}
            onPick={(v) => set("footer_revision", v)}
            label="revision"
          />
          <span className="f-sep">&middot;</span>
          <span>{fmtDate(m.publication_date)}</span>
          <span className="spacer" />
          <span className="f-page">Page 1 of 1</span>
        </div>
      </div>

      {state.issuedByTouched && (
        <span className="hint">
          &ldquo;Issued by&rdquo; is overridden. Clear it to follow the publication name
          again.
        </span>
      )}
    </fieldset>
  );
}
