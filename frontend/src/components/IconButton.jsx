import { useState } from "react";
import { useDismiss } from "./Bits.jsx";
import { ICONS } from "../model.js";
import { ICON_SRC } from "../icons.js";

/**
 * The round icon exactly as it prints. Clicking it opens the full set to pick
 * from, so the choice is made by sight and in place.
 */
export default function IconButton({ value, onChange, size, allowNone = false }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const current = ICONS.find((i) => i.v === value);
  return (
    <span className="iconbtn-wrap" ref={ref}>
      <button
        type="button"
        className={"iconbtn" + (current ? "" : " none")}
        style={{ width: size, height: size }}
        title={(current ? "Icon: " + current.label : "No icon") + " (click to change)"}
        aria-label={current ? "Change icon" : "Add an icon"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current ? <img src={ICON_SRC[value]} alt="" /> : "+"}
      </button>
      {open && (
        <div className="iconmenu" role="radiogroup" aria-label="Icon">
          {allowNone && (
            <button
              type="button"
              role="radio"
              aria-checked={!current}
              className={current ? "" : "on"}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <span className="noicon" />
              <span>No icon</span>
            </button>
          )}
          {ICONS.map((i) => (
            <button
              key={i.v}
              type="button"
              role="radio"
              aria-checked={value === i.v}
              className={value === i.v ? "on" : ""}
              onClick={() => {
                onChange(i.v);
                setOpen(false);
              }}
            >
              <img src={ICON_SRC[i.v]} alt="" />
              <span>{i.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
