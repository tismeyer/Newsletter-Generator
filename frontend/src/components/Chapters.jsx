import { Segmented } from "./Bits.jsx";
import { MAX_CHAPTERS, TREATMENTS, TREATMENT_COPY, newChapter } from "../model.js";

function BoxRow({ box, onChange, onRemove }) {
  const red = box.type === "action_box";
  return (
    <div className={"boxrow " + (red ? "red" : "blue")}>
      <div className="top">
        <strong>{red ? "Red box \u2014 action or deadline" : "Blue box \u2014 background or FYI"}</strong>
        <button type="button" className="btn link" onClick={onRemove}>
          Remove
        </button>
      </div>
      <input
        type="text"
        placeholder="Box title"
        value={box.title}
        onChange={(e) => onChange({ ...box, title: e.target.value })}
      />
      <textarea
        className="mt6 short"
        placeholder="What goes in the box, or leave empty and let the writer draft it."
        value={box.text}
        onChange={(e) => onChange({ ...box, text: e.target.value })}
      />
    </div>
  );
}

function Chapter({ chapter, index, onChange, onRemove }) {
  const set = (k, v) => onChange({ ...chapter, [k]: v });
  const copy = TREATMENT_COPY[chapter.treatment];
  const locked = chapter.treatment === "verbatim";

  const setTreatment = (v) =>
    onChange({ ...chapter, treatment: v, box_policy: v === "verbatim" ? "none" : chapter.box_policy });

  const addBox = (type) =>
    set("boxes", [...chapter.boxes, { type, title: "", text: "" }]);

  return (
    <details className="chapter" open>
      <summary>
        <span className="num">{index + 1}</span>
        <span className="ttl">{chapter.heading || "Untitled chapter"}</span>
        <span className="tag">
          {chapter.boxes.length} box{chapter.boxes.length === 1 ? "" : "es"}
        </span>
      </summary>
      <div className="inner">
        <label className="f">
          <span>Chapter title</span>
          <input
            type="text"
            placeholder="e.g. Operations update"
            value={chapter.heading}
            onChange={(e) => set("heading", e.target.value)}
          />
        </label>

        <label className="f mt10">
          <span>{copy.label}</span>
          <textarea
            placeholder={copy.placeholder}
            value={chapter.text}
            onChange={(e) => set("text", e.target.value)}
          />
        </label>

        <div className="mt8">
          <Segmented
            label="What should happen to this text?"
            options={TREATMENTS}
            value={chapter.treatment}
            onChange={setTreatment}
          />
          <span className="hint">{copy.hint}</span>
        </div>

        <label className="f mt10">
          <span>Highlight boxes here</span>
          <select
            disabled={locked}
            value={chapter.box_policy}
            onChange={(e) => set("box_policy", e.target.value)}
          >
            <option value="inherit">Use the document setting</option>
            <option value="ai">AI may add boxes</option>
            <option value="none">Never add boxes</option>
          </select>
        </label>

        {chapter.boxes.map((b, i) => (
          <BoxRow
            key={i}
            box={b}
            onChange={(nb) => set("boxes", chapter.boxes.map((x, j) => (j === i ? nb : x)))}
            onRemove={() => set("boxes", chapter.boxes.filter((_, j) => j !== i))}
          />
        ))}

        <div className="inline mt10">
          <button type="button" className="btn small" onClick={() => addBox("action_box")}>
            Add red box
          </button>
          <button type="button" className="btn small" onClick={() => addBox("info_box")}>
            Add blue box
          </button>
          <span className="spacer" />
          <button type="button" className="btn link" onClick={onRemove}>
            Remove chapter
          </button>
        </div>
      </div>
    </details>
  );
}

export default function Chapters({ chapters, patch, notify }) {
  const set = (next) => patch({ chapters: next });
  return (
    <fieldset>
      <legend>
        Chapters <span className="soft">{chapters.length} of {MAX_CHAPTERS}</span>
      </legend>
      {chapters.map((c, i) => (
        <Chapter
          key={c.id}
          chapter={c}
          index={i}
          onChange={(nc) => set(chapters.map((x, j) => (j === i ? nc : x)))}
          onRemove={() => set(chapters.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        className="btn small"
        onClick={() =>
          chapters.length >= MAX_CHAPTERS
            ? notify(`Maximum of ${MAX_CHAPTERS} chapters.`)
            : set([...chapters, newChapter("")])
        }
      >
        Add chapter
      </button>
    </fieldset>
  );
}
