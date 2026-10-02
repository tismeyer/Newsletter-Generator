import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/*
 * The chapter layout is drawn at the Word template's real sizes (template.docx,
 * pt converted at 96 dpi) and split into A4 pages the way Word fills them, so
 * the preview shows the page count the Word file will have.
 */
const PAGE_H = 1123;
const MARGIN_TOP = 100; // 26.5 mm
const MARGIN_BOTTOM = 87; // 22.9 mm
const BODY_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;

/** One chapter as a list of page blocks: heading, paragraphs, single bullets, boxes. */
function chapterBlocks(chapter) {
  const out = [];
  const add = (key, el, keepNext = false) => out.push({ key: chapter.id + ":" + key, el, keepNext });
  const box = (key, red, title, text, ghost) =>
    add(
      key,
      <div className={"p-box " + (red ? "red" : "blue")}>
        <div className="bt">{title}</div>
        {(text || "")
          .split("\n")
          .filter((t) => t.trim())
          .map((t, i) => (
            <p key={i} className={ghost ? "p-ghost" : ""}>
              {t.trim()}
            </p>
          ))}
      </div>
    );
  const bullet = (key, t) =>
    add(
      key,
      <ul className="p-ul">
        <li>{t}</li>
      </ul>
    );

  add(
    "h",
    <div className="p-h1">
      {chapter.icon && <img className="p-h1icon" src={ICON_SRC[chapter.icon]} alt="" />}
      <span>{chapter.heading || "Chapter title"}</span>
    </div>,
    true
  );

  const blocks = hasDraft(chapter) ? textToBlocks(chapter.draft) : null;
  if (blocks) {
    blocks.forEach((b, i) => {
      if (b.kind === "bullets") b.items.forEach((t, j) => bullet(i + "." + j, t));
      else if (b.kind === "body")
        b.text
          .split("\n")
          .filter((t) => t.trim())
          .forEach((t, j) => add(i + "." + j, <p className="p-body">{t.trim()}</p>));
      else box(i, b.kind === "action_box", b.title, b.text);
    });
    return out;
  }

  const text = (chapter.text || "").trim();
  if (!text)
    add(
      "g",
      <p className="p-body p-ghost">
        {chapter.treatment === "draft" ? "Text will be written from your notes." : "Paste your text in the editor."}
      </p>
    );
  else if (chapter.treatment === "draft")
    add("g", <p className="p-body p-ghost">Finished text will be written from your notes.</p>);
  else
    text.split(/\n+/).forEach((line, i) => {
      const t = line.trim();
      if (!t) return;
      if (/^[-*\u2022]\s+/.test(t)) bullet(i, t.replace(/^[-*\u2022]\s+/, ""));
      else add(i, <p className="p-body">{t}</p>);
    });
  chapter.boxes.forEach((b, i) =>
    box(
      "b" + i,
      b.type === "action_box",
      b.title || (b.type === "action_box" ? "Action required" : "Good to know"),
      b.text || "Box text will be drafted from your notes.",
      !b.text
    )
  );
  return out;
}

/**
 * Fill pages with blocks like Word: a heading stays with what follows, nothing
 * is split, and the space after the last block on a page does not count.
 */
function paginate(heights, trails, keepNext) {
  const pages = [[]];
  let used = 0;
  for (let i = 0; i < heights.length; i++) {
    let need = heights[i] - trails[i];
    if (keepNext[i] && i + 1 < heights.length) need += trails[i] + heights[i + 1] - trails[i + 1];
    if (used > 0 && used + need > BODY_H) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(i);
    used += heights[i];
  }
  return pages;
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
  const flowRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState(null); // block indices per page

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
  const onePager = state.layout === "one_pager";
  const visible = state.chapters.filter((c) => c.heading.trim() || c.text.trim() || c.boxes.length);

  const title = (
    <div className="p-titleblock">
      <div className="p-title">
        {m.doc_type || "Newsletter"} &ndash; <span className="issue">{m.doc_issue}</span>
      </div>
      <div className={"p-headline" + (m.doc_headline ? "" : " p-ghost")}>
        {m.doc_headline || "Headline for this edition"}
      </div>
      <div className="p-date">{fmtDate(m.publication_date)}</div>
    </div>
  );
  const blocks = onePager
    ? []
    : [{ key: "title", el: title, keepNext: true }, ...visible.flatMap(chapterBlocks)];

  // Measure every block at full size (margins included; the flow is a flex
  // column, so margins add up as Word's spacing does), then split into pages.
  useLayoutEffect(() => {
    if (onePager || !flowRef.current) return;
    const kids = [...flowRef.current.children];
    const heights = kids.map((k) => {
      const cs = getComputedStyle(k);
      return k.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    });
    // Space after a block: its own bottom margin, or its last bullet's.
    const trails = kids.map((k) => {
      const el = k.firstElementChild;
      if (!el) return 0;
      const last = el.tagName === "UL" ? el.lastElementChild : el;
      return Math.max(parseFloat(getComputedStyle(el).marginBottom), parseFloat(getComputedStyle(last).marginBottom));
    });
    const next = paginate(heights, trails, blocks.map((b) => b.keepNext));
    if (JSON.stringify(next) !== JSON.stringify(pages)) setPages(next);
  });

  const head = (
    <div className="p-head">
      <div className="kick">
        <img className="ico" src={icon} alt="" />
        {m.header_kicker || "Publication name"}
      </div>
      <img className="logo" src={logo} alt="helvetic airways" />
    </div>
  );
  const foot = (n, total) => (
    <div className="p-foot">
      <div className="l">
        <b>Issued by:</b> {dept}
      </div>
      <div className="c">
        Rev. {m.footer_revision} &nbsp;&middot;&nbsp; {fmtDate(m.publication_date)}
      </div>
      <div className="r">
        Page {n} of {total}
      </div>
    </div>
  );

  const sheets = onePager
    ? [null]
    : (pages && pages.every((pg) => pg.every((i) => i < blocks.length)) ? pages : [blocks.map((_, i) => i)]);
  const GAP = 24;
  const height = (sheets.length * PAGE_H + (sheets.length - 1) * GAP) * zoom;

  return (
    <>
      <div className="stagebar">
        <span>Live preview</span>
        <span className="spacer" />
        {!onePager && (
          <span>
            {sheets.length} {sheets.length === 1 ? "page" : "pages"} in Word &nbsp;&middot;&nbsp;
          </span>
        )}
        <span>{Math.round(zoom * 100)}%</span>
      </div>
      <div className="paperwrap" ref={wrapRef} style={{ height }}>
        <div className="sheets" style={{ transform: `scale(${zoom})`, gap: GAP }}>
          {onePager ? (
            <div className="paper">
              {head}
              {title}
              <OnePagerPreview state={state} />
              {foot(1, 1)}
            </div>
          ) : (
            sheets.map((pg, n) => (
              <div className="paper word" key={n}>
                {head}
                <div className="p-flow">
                  {pg.map((i) => (
                    <div key={blocks[i].key}>{blocks[i].el}</div>
                  ))}
                </div>
                {foot(n + 1, sheets.length)}
              </div>
            ))
          )}
        </div>
        {!onePager && (
          <div className="p-measure paper word" aria-hidden="true">
            <div className="p-flow" ref={flowRef}>
              {blocks.map((b) => (
                <div key={b.key}>{b.el}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
