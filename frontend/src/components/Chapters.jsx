import { GrowText } from "./Bits.jsx";
import ReviseBar from "./DraftTools.jsx";
import {
  MAX_CHAPTERS,
  TREATMENTS,
  TREATMENT_COPY,
  draftSegments,
  hasDraft,
  newChapter,
  segmentsToText,
} from "../model.js";

/** A red or blue highlight box, edited where it sits on the page. */
function BoxEditor({ box, onChange, onRemove }) {
  const red = box.type === "action_box";
  return (
    <div className={"ed-box " + (red ? "red" : "blue")}>
      <div className="ed-boxhead">
        <input
          type="text"
          className="inline-field ed-boxtitle"
          placeholder={red ? "Action required" : "Good to know"}
          aria-label={red ? "Red box title" : "Blue box title"}
          value={box.title}
          onChange={(e) => onChange({ ...box, title: e.target.value })}
        />
        <button
          type="button"
          className="ed-x"
          title="Remove this box"
          aria-label="Remove this box"
          onClick={onRemove}
        >
          &times;
        </button>
      </div>
      <GrowText
        className="ed-boxbody"
        value={box.text}
        onChange={(v) => onChange({ ...box, text: v })}
        placeholder={
          red
            ? "Something the reader must do, or leave empty and let the writer draft it."
            : "Background or FYI, or leave empty and let the writer draft it."
        }
        ariaLabel={red ? "Red box text" : "Blue box text"}
      />
    </div>
  );
}

/**
 * Generated chapter text, shown the way it prints: text runs, and the red and
 * blue boxes as boxes. Every edit is written back into the one draft string.
 */
function DraftEditor({ draft, onChange, ariaLabel }) {
  const segs = draftSegments(draft);
  const put = (i, seg) => onChange(segmentsToText(segs.map((g, j) => (j === i ? seg : g))));
  const drop = (i) => onChange(segmentsToText(segs.filter((_, j) => j !== i)));
  return (
    <div className="ed-drafted">
      {segs.map((g, i) =>
        g.kind === "text" ? (
          <GrowText
            key={i}
            className="ed-body"
            value={g.text}
            onChange={(v) => put(i, { ...g, text: v })}
            ariaLabel={ariaLabel}
          />
        ) : (
          <BoxEditor
            key={i}
            box={{ type: g.kind, title: g.title, text: g.text }}
            onChange={(b) => put(i, { kind: g.kind, title: b.title, text: b.text })}
            onRemove={() => drop(i)}
          />
        )
      )}
    </div>
  );
}

function Chapter({ chapter, index, ctx, onChange, onRemove }) {
  const set = (k, v) => onChange({ ...chapter, [k]: v });
  const copy = TREATMENT_COPY[chapter.treatment];
  const locked = chapter.treatment === "verbatim";
  const drafted = hasDraft(chapter);
  const name = "Chapter " + (index + 1);

  const setTreatment = (v) =>
    onChange({ ...chapter, treatment: v, box_policy: v === "verbatim" ? "none" : chapter.box_policy });

  const addBox = (type) => set("boxes", [...chapter.boxes, { type, title: "", text: "" }]);

  return (
    <section className="ed-chapter">
      <input
        type="text"
        className="inline-field ed-h1"
        placeholder={name + " title"}
        aria-label={name + " title"}
        value={chapter.heading}
        onChange={(e) => set("heading", e.target.value)}
      />

      {drafted ? (
        <DraftEditor
          draft={chapter.draft}
          onChange={(v) => set("draft", v)}
          ariaLabel={name + " generated text"}
        />
      ) : (
        <>
          <GrowText
            className="ed-body"
            value={chapter.text}
            onChange={(v) => set("text", v)}
            placeholder={copy.placeholder}
            ariaLabel={name + " text"}
          />
          {/* Once text is generated its boxes live in it as [ACTION]/[INFO] lines,
              so the box editors only return with "Back to my notes". */}
          {chapter.boxes.map((b, i) => (
            <BoxEditor
              key={i}
              box={b}
              onChange={(nb) => set("boxes", chapter.boxes.map((x, j) => (j === i ? nb : x)))}
              onRemove={() => set("boxes", chapter.boxes.filter((_, j) => j !== i))}
            />
          ))}
        </>
      )}

      <div className="ed-tools">
        {drafted ? (
          <details className="mynotes">
            <summary>My notes</summary>
            <GrowText
              className="ed-notes"
              value={chapter.text}
              onChange={(v) => set("text", v)}
              ariaLabel={name + " notes"}
            />
          </details>
        ) : (
          <>
            <select
              value={chapter.treatment}
              aria-label="What should happen to this text?"
              title={copy.hint}
              onChange={(e) => setTreatment(e.target.value)}
            >
              {TREATMENTS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              disabled={locked}
              value={chapter.box_policy}
              aria-label="Highlight boxes in this chapter"
              onChange={(e) => set("box_policy", e.target.value)}
            >
              <option value="inherit">Boxes: document setting</option>
              <option value="ai">Boxes: AI may add</option>
              <option value="none">Boxes: never add</option>
            </select>
            <button type="button" className="ed-add red" onClick={() => addBox("action_box")}>
              + Red box
            </button>
            <button type="button" className="ed-add blue" onClick={() => addBox("info_box")}>
              + Blue box
            </button>
          </>
        )}
        <span className="spacer" />
        <button type="button" className="btn link" onClick={onRemove}>
          Remove chapter
        </button>
      </div>

      {drafted && (
        <>
          <ReviseBar
            kind="chapter"
            item={chapter}
            heading={chapter.heading}
            {...ctx}
            onText={(t) => set("draft", t)}
            onDiscard={() => onChange({ ...chapter, draft: null, draftFrom: "" })}
          />
        </>
      )}
    </section>
  );
}

export default function Chapters({ chapters, patch, notify, style, provider }) {
  const set = (next) => patch({ chapters: next });
  const ctx = { style, provider, notify };
  return (
    <fieldset>
      <legend>
        Chapters <span className="soft">{chapters.length} of {MAX_CHAPTERS}</span>
      </legend>
      <p className="hint mb10">
        Type straight into the page: chapter title, then the text. Add red boxes for
        actions or deadlines and blue boxes for background. Start a line with &ldquo;- &rdquo;
        for a bullet.
      </p>
      <div className="ed-paper ed-chapters">
        {chapters.map((c, i) => (
          <Chapter
            key={c.id}
            chapter={c}
            index={i}
            ctx={ctx}
            onChange={(nc) => set(chapters.map((x, j) => (j === i ? nc : x)))}
            onRemove={() => set(chapters.filter((_, j) => j !== i))}
          />
        ))}
        <button
          type="button"
          className="ed-addchapter"
          onClick={() =>
            chapters.length >= MAX_CHAPTERS
              ? notify(`Maximum of ${MAX_CHAPTERS} chapters.`)
              : set([...chapters, newChapter("")])
          }
        >
          + Add chapter
        </button>
      </div>
    </fieldset>
  );
}
