import { useEffect, useRef, useState } from "react";
import logo from "../assets/logo.png";
import icon from "../assets/icon.png";
import {
  cardFilled,
  departmentFrom,
  fmtDate,
  hasDraft,
  newsFilled,
  onePagerSize,
  textToBlocks,
} from "../model.js";
import { isFullWidth } from "../budget.js";
import { ICON_SRC } from "../icons.js";

const SHEET_W = 794; // A4 at 96 dpi

/** Rough client-side view of what the chapter will look like on the page. */
function ChapterPreview({ chapter }) {
  const blocks = hasDraft(chapter) ? textToBlocks(chapter.draft) : null;
  const body = () => {
    if (blocks) {
      return blocks.map((b, i) => {
        if (b.kind === "bullets")
          return (
            <ul className="p-ul" key={i}>
              {b.items.map((t, j) => (
                <li key={j}>{t}</li>
              ))}
            </ul>
          );
        if (b.kind === "body") return <p className="p-body" key={i}>{b.text}</p>;
        return (
          <div className={"p-box " + (b.kind === "action_box" ? "red" : "blue")} key={i}>
            <div className="bt">{b.title}</div>
            <p>{b.text}</p>
          </div>
        );
      });
    }
    const text = (chapter.text || "").trim();
    if (!text)
      return (
        <p className="p-body p-ghost">
          {chapter.treatment === "draft" ? "Text will be written from your notes." : "Paste your text in the editor."}
        </p>
      );
    if (chapter.treatment === "draft")
      return <p className="p-body p-ghost">Finished text will be written from your notes.</p>;

    return text.split(/\n+/).map((line, i) => {
      const t = line.trim();
      if (!t) return null;
      return /^[-*\u2022]\s+/.test(t) ? (
        <ul className="p-ul" key={i}>
          <li>{t.replace(/^[-*\u2022]\s+/, "")}</li>
        </ul>
      ) : (
        <p className="p-body" key={i}>{t}</p>
      );
    });
  };

  return (
    <>
      <div className="p-h1">{chapter.heading || "Chapter title"}</div>
      {body()}
      {!blocks &&
        chapter.boxes.map((b, i) => (
          <div className={"p-box " + (b.type === "action_box" ? "red" : "blue")} key={i}>
            <div className="bt">{b.title || (b.type === "action_box" ? "Action required" : "Good to know")}</div>
            <p className={b.text ? "" : "p-ghost"}>
              {b.text || "Box text will be drafted from your notes."}
            </p>
          </div>
        ))}
    </>
  );
}

/** Card and short-news preview for the one-page layout. */
function OnePagerPreview({ state }) {
  const cards = state.cards.filter(cardFilled);
  const news = state.news.filter(newsFilled);

  const cardInner = (c) => {
    if (hasDraft(c))
      return textToBlocks(c.draft).map((b, i) =>
        b.kind === "bullets" ? (
          <ul className="p-ul" key={i}>
            {b.items.map((t, j) => (
              <li key={j}>{t}</li>
            ))}
          </ul>
        ) : (
          <p className="p-cardbody" key={i}>
            {b.text}
          </p>
        )
      );
    const text = (c.text || "").trim();
    if (!text) return <p className="p-cardbody p-ghost">Text will be written from your notes.</p>;
    if (c.treatment === "draft")
      return <p className="p-cardbody p-ghost">Finished text will be written from your notes.</p>;
    return text.split(/\n+/).map((line, i) => {
      const t = line.trim();
      if (!t) return null;
      return /^[-*\u2022]\s+/.test(t) ? (
        <ul className="p-ul" key={i}>
          <li>{t.replace(/^[-*\u2022]\s+/, "")}</li>
        </ul>
      ) : (
        <p className="p-cardbody" key={i}>{t}</p>
      );
    });
  };

  const rows = [];
  for (let i = 0; i < cards.length; i += 2) {
    const full = isFullWidth(i, cards.length);
    rows.push(
      <div className={"p-cardrow" + (full ? " one" : "")} key={i}>
        {(full ? [cards[i]] : [cards[i], cards[i + 1]]).filter(Boolean).map((c, j) => (
          <div className="p-card" key={j}>
            <div className="p-cardhead">
              <img className="p-icon" src={ICON_SRC[c.icon]} alt="" />
              <div>
                <div className="p-cardtitle">{c.title || "Card title"}</div>
                {c.subtitle && <div className="p-cardsub">{c.subtitle}</div>}
              </div>
            </div>
            {cardInner(c)}
          </div>
        ))}
      </div>
    );
  }

  // One size for all card and short-news text, as in the Word file (pt to px at 96 dpi).
  const size = onePagerSize(state);
  return (
    <div className="p-onepager" style={{ "--fs": (size * 96) / 72 + "px" }}>
      {rows}
      {news.length > 0 && (
        <div className="p-news">
          {news.map((n, i) => (
            <div className="p-newsrow" key={i}>
              <div className="p-newslabel"><img className="p-icon" src={ICON_SRC[n.icon]} alt="" /><span>{n.label || "Label"}</span></div>
              <div className="p-newstext">
                {(hasDraft(n) ? n.draft : n.text || "").split(/\n+/)
                  .filter((l) => l.trim())
                  .map((l, j) => (
                    <p key={j}>{l}</p>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Preview({ state }) {
  const wrapRef = useRef(null);
  const sheetRef = useRef(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const fit = () => {
      const w = wrapRef.current?.clientWidth || SHEET_W;
      setZoom(Math.min(1, w / SHEET_W));
    };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  });

  const m = state.masthead;
  const dept = m.footer_issued_by || departmentFrom(m.header_kicker);
  const visible = state.chapters.filter((c) => c.heading.trim() || c.text.trim() || c.boxes.length);
  const height = (sheetRef.current?.offsetHeight || 1123) * zoom;

  return (
    <>
      <div className="stagebar">
        <span>Live preview</span>
        <span className="spacer" />
        <span>{Math.round(zoom * 100)}%</span>
      </div>
      <div className="paperwrap" ref={wrapRef} style={{ height }}>
        <div className="paper" ref={sheetRef} style={{ transform: `scale(${zoom})` }}>
          <div className="p-head">
            <div className="kick">
              <img className="ico" src={icon} alt="" />
              {m.header_kicker || "Publication name"}
            </div>
            <img className="logo" src={logo} alt="helvetic airways" />
          </div>

          <div className="p-title">
            {m.doc_type || "Newsletter"} &ndash; <span className="issue">{m.doc_issue}</span>
          </div>
          <div className={"p-headline" + (m.doc_headline ? "" : " p-ghost")}>
            {m.doc_headline || "Headline for this edition"}
          </div>
          <div className="p-date">{fmtDate(m.publication_date)}</div>

          {state.layout === "one_pager" ? (
            <OnePagerPreview state={state} />
          ) : (
            visible.map((c) => (
              <ChapterPreview key={c.id} chapter={c} />
            ))
          )}

          <div className="p-foot">
            <div className="l">
              <b>Issued by:</b> {dept}
            </div>
            <div className="c">
              Rev. {m.footer_revision} &nbsp;&middot;&nbsp; {fmtDate(m.publication_date)}
            </div>
            <div className="r">Page 1 of 1</div>
          </div>
        </div>
      </div>
    </>
  );
}
