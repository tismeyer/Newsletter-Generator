import { useRef, useState } from "react";
import { useDismiss } from "./Bits.jsx";
import { importWord } from "../api.js";
import { ICONS, KICKERS, cardFilled, fromImport, newsFilled, openFlags } from "../model.js";

const CHOICES = [
  { v: "auto", label: "Let the AI suggest" },
  { v: "standard", label: "Newsletter" },
  { v: "one_pager", label: "1-page bulletin" },
];

const MAX_BYTES = 15 * 1024 * 1024;

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("The file could not be read."));
    r.readAsDataURL(file);
  });

/**
 * Bring an existing Word document into the builder. The server reads its
 * structure, the AI decides where each part goes, and the text is copied as it
 * is. Places where the AI guessed come back outlined in yellow.
 */
export default function ImportWord({ state, load, notify, busy, setBusy }) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState("auto");
  const ref = useDismiss(open, setOpen);
  const fileRef = useRef(null);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow the same file again
    if (!file) return;
    if (!/\.docx$/i.test(file.name))
      return notify("Please choose a Word .docx file. Older .doc files must be saved as .docx first.");
    if (file.size > MAX_BYTES) return notify("That file is larger than 15 MB.");
    if (state.provider === "manual")
      return notify("Importing needs an AI writer. Pick Claude or Copilot at the top.");
    setOpen(false);
    setBusy("import");
    try {
      const res = await importWord({
        provider: state.provider,
        filename: file.name,
        data_base64: await toBase64(file),
        layout,
        icons: ICONS,
        kickers: KICKERS,
      });
      const next = fromImport(res, state, file.name, layout);
      load(next);
      const n = openFlags(next);
      notify(
        n
          ? `Imported ${file.name}. ${n} ${n === 1 ? "place" : "places"} to check, outlined in yellow.`
          : `Imported ${file.name}.`
      );
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy("");
    }
  };

  const choose = () => {
    const inUse =
      state.chapters.some((c) => c.text.trim() || c.draft) ||
      state.cards.some(cardFilled) ||
      state.news.some(newsFilled);
    if (inUse && !window.confirm("The imported document replaces what is in the editor now. Continue?"))
      return;
    fileRef.current?.click();
  };

  return (
    <span className="drafts" ref={ref}>
      <button
        type="button"
        className="btn small"
        aria-expanded={open}
        disabled={Boolean(busy)}
        onClick={() => setOpen((o) => !o)}
      >
        {busy === "import" ? "Importing…" : "Import Word"}
      </button>
      {open && (
        <div className="draftsmenu">
          <div className="dm-title">Import a Word document</div>
          <p className="dm-empty mb6">
            Any .docx works. The AI places titles, text and boxes into this layout and copies
            the text as written. Pictures are left out. Where it had to guess, you will see a
            yellow note.
          </p>
          <div className="dm-title">Layout</div>
          <div className="seg imp-seg" role="group" aria-label="Layout for the import">
            {CHOICES.map((c) => (
              <button
                key={c.v}
                type="button"
                aria-pressed={layout === c.v}
                onClick={() => setLayout(c.v)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="dm-row mt10">
            <button type="button" className="btn primary small" onClick={choose}>
              Choose Word file&hellip;
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hidden
              onChange={pick}
            />
          </div>
        </div>
      )}
    </span>
  );
}

/** Above the editor after an import: what was decided, and what is left to check. */
export function ImportBanner({ state, patch }) {
  const info = state.importInfo;
  if (!info) return null;
  const n = openFlags(state);
  const layoutName = info.layout === "one_pager" ? "1-page bulletin" : "newsletter";
  const dropNote = (i) =>
    patch({ importInfo: { ...info, notes: info.notes.filter((_, j) => j !== i) } });
  return (
    <div className="importbanner" role="status">
      <div className="ib-head">
        <b>Imported from {info.file}.</b>{" "}
        {info.chosen === "auto"
          ? `The AI chose the ${layoutName}${info.reason ? ": " + info.reason : "."}`
          : `Laid out as a ${layoutName}, as you chose.`}
        <button
          type="button"
          className="ed-x"
          title="Hide this message"
          aria-label="Hide this message"
          onClick={() => patch({ importInfo: null })}
        >
          &times;
        </button>
      </div>
      {info.notes.length > 0 && (
        <ul className="flagnotes">
          {info.notes.map((t, i) => (
            <li key={i}>
              {t}
              <button type="button" className="fn-ok" title="Checked: hide this note" onClick={() => dropNote(i)}>
                OK
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="ib-foot">
        {n
          ? `${n} ${n === 1 ? "place" : "places"} below ${n === 1 ? "is" : "are"} outlined in yellow where the AI guessed. Click OK once checked, or just edit the field.`
          : "Nothing left to check. The text is used exactly as written; edit it in place or ask for changes box by box."}
      </div>
    </div>
  );
}
