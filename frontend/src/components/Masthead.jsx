import { Field, PickOrType } from "./Bits.jsx";
import { CUSTOM, DOC_TYPES, KICKERS, departmentFrom } from "../model.js";

const REVISIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

export default function Masthead({ state, patch }) {
  const m = state.masthead;
  const set = (k, v) => patch({ masthead: { ...m, [k]: v } });

  const setKicker = (v) => {
    const next = { ...m, header_kicker: v };
    if (!state.issuedByTouched) next.footer_issued_by = departmentFrom(v);
    patch({ masthead: next });
  };

  const setIssuedBy = (v) => {
    patch({
      masthead: { ...m, footer_issued_by: v || departmentFrom(m.header_kicker) },
      issuedByTouched: Boolean(v.trim()),
    });
  };

  return (
    <fieldset>
      <legend>Masthead</legend>
      <div className="grid g2">
        <Field label="Publication">
          <PickOrType options={KICKERS} custom={CUSTOM} value={m.header_kicker} onChange={setKicker} />
        </Field>

        <Field label="Document type">
          <PickOrType
            options={DOC_TYPES}
            custom={CUSTOM}
            value={m.doc_type}
            onChange={(v) => set("doc_type", v)}
          />
        </Field>

        <Field label="Issue" hint="Defaults to the current month and year.">
          <input type="text" value={m.doc_issue} onChange={(e) => set("doc_issue", e.target.value)} />
        </Field>

        <Field label="Publication date" hint="Shown in the title block and the footer.">
          <input
            type="date"
            value={m.publication_date}
            onChange={(e) => set("publication_date", e.target.value)}
          />
        </Field>

        <Field label="Headline" span>
          <input
            type="text"
            placeholder="What this edition is about"
            value={m.doc_headline}
            onChange={(e) => set("doc_headline", e.target.value)}
          />
        </Field>

        <Field label="Revision">
          <PickOrType
            options={REVISIONS}
            custom={CUSTOM}
            value={m.footer_revision}
            onChange={(v) => set("footer_revision", v)}
          />
        </Field>

        <Field
          label="Issued by"
          hint={
            state.issuedByTouched
              ? "Overridden. Clear the field to follow the publication name again."
              : "Taken from the publication name. Edit to override."
          }
        >
          <input
            type="text"
            value={m.footer_issued_by || departmentFrom(m.header_kicker)}
            onChange={(e) => setIssuedBy(e.target.value)}
          />
        </Field>
      </div>
    </fieldset>
  );
}
