import { Segmented } from "./Bits.jsx";

const STRUCTURE = [
  { v: "prose", label: "Mostly prose" },
  { v: "balanced", label: "Balanced" },
  { v: "bullets", label: "Bullet-heavy" },
];
const TONE = [
  { v: "neutral", label: "Neutral" },
  { v: "formal", label: "Formal" },
  { v: "direct", label: "Direct" },
];
const LENGTH = [
  { v: "brief", label: "Brief" },
  { v: "standard", label: "Standard" },
  { v: "detailed", label: "Detailed" },
];
const BOXES = [
  { v: "ai", label: "AI may add" },
  { v: "none", label: "Never add" },
];

export default function StylePanel({ style, patch }) {
  const set = (k, v) => patch({ style: { ...style, [k]: v } });
  return (
    <fieldset>
      <legend>Writing style</legend>
      <div className="grid g2">
        <Segmented label="Structure" options={STRUCTURE} value={style.structure} onChange={(v) => set("structure", v)} />
        <Segmented label="Tone" options={TONE} value={style.tone} onChange={(v) => set("tone", v)} />
        <Segmented label="Length" options={LENGTH} value={style.length} onChange={(v) => set("length", v)} />
        <Segmented
          label="Highlight boxes, when you haven't written one"
          options={BOXES}
          value={style.box_policy}
          onChange={(v) => set("box_policy", v)}
        />
      </div>
      <label className="f mt12">
        <span>Anything else the writer should know</span>
        <textarea
          placeholder="e.g. Avoid abbreviations crews outside ZRH won't know. Always name the manual reference."
          value={style.style_notes}
          onChange={(e) => set("style_notes", e.target.value)}
        />
      </label>
    </fieldset>
  );
}
