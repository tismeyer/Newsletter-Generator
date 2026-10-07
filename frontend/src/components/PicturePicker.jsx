import { useRef } from "react";

// Pictures travel inside the draft and the request as data URLs, so they are
// scaled down here first: large enough to print sharply in a card or across
// the page, small enough that a draft with a few of them still saves.
const MAX_SIDE = 1600;
const QUALITY = 0.85;

function readPicture(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      // Transparent areas print white, as the page behind them is white.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ src: canvas.toDataURL("image/jpeg", QUALITY), w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as a picture."));
    };
    img.src = url;
  });
}

/**
 * A picture slot: "+ Picture" when empty, else the picture with Replace and
 * Remove. `value` is { src, w, h } or null.
 */
export default function PicturePicker({ value, onChange, notify, label = "picture", className = "" }) {
  const fileRef = useRef(null);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    try {
      onChange(await readPicture(file));
    } catch (err) {
      notify?.(err.message);
    }
  };

  const input = (
    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={pick} />
  );

  if (!value)
    return (
      <>
        <button
          type="button"
          className={"ed-add pic " + className}
          onClick={() => fileRef.current?.click()}
          aria-label={"Add a " + label}
        >
          + Picture
        </button>
        {input}
      </>
    );

  return (
    <div className={"ed-pic " + className}>
      <img src={value.src} alt="" style={{ aspectRatio: `${value.w} / ${value.h}` }} />
      <div className="ed-picbar">
        <button type="button" className="btn link" onClick={() => fileRef.current?.click()}>
          Replace
        </button>
        <button type="button" className="btn link" onClick={() => onChange(null)}>
          Remove picture
        </button>
      </div>
      {input}
    </div>
  );
}
