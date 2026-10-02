import { useEffect, useRef, useState } from "react";
import { GrowText } from "./Bits.jsx";
import ReviseBar from "./DraftTools.jsx";
import {
  ICONS,
  TREATMENTS,
  TREATMENT_COPY,
  cardFilled,
  hasDraft,
  newsFilled,
  onePagerSize,
} from "../model.js";
import { MAX_PT, MIN_PT, budget, cardLimit, isFullWidth } from "../budget.js";
import { ICON_SRC } from "../icons.js";

/** Live character counter. Turns amber near the limit and red past it. */
function Counter({ used, limit }) {
  const ratio = limit ? used / limit : 0;
  const state = ratio > 1 ? "over" : ratio > 0.85 ? "near" : "ok";
  return (
    <span className={"counter " + state}>
      {used} / {limit}
      {state === "over" && " \u2014 will not fit on one page"}
    </span>
  );
}

/** Closes a popover on an outside click or Escape. */
function useDismiss(open, setOpen) {
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
  }, [open, setOpen]);
  return ref;
}

/**
 * The round icon exactly as it prints. Clicking it opens the full set to pick
 * from, so the choice is made by sight and in place.
 */
function IconButton({ value, onChange, size }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const current = ICONS.find((i) => i.v === value);
  return (
    <span className="iconbtn-wrap" ref={ref}>
      <button
        type="button"
        className="iconbtn"
        style={{ width: size, height: size }}
        title={"Icon: " + (current ? current.label : value) + " (click to change)"}
        aria-label="Change icon"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <img src={ICON_SRC[value]} alt="" />
      </button>
      {open && (
        <div className="iconmenu" role="radiogroup" aria-label="Icon">
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

/** Your notes, tucked away once generated text has taken their place. */
function Notes({ value, onChange, ariaLabel }) {
  return (
    <details className="mynotes">
      <summary>My notes</summary>
      <GrowText className="ed-notes" value={value} onChange={onChange} ariaLabel={ariaLabel} />
    </details>
  );
}

function Card({ card, index, activeCards, activeNews, ctx, onChange, onClear }) {
  const set = (k, v) => onChange({ ...card, [k]: v });
  const limit = cardLimit(index, Math.max(activeCards, 1), activeNews);
  const filled = cardFilled(card);
  const full = filled && isFullWidth(index, activeCards);
  const copy = TREATMENT_COPY[card.treatment];
  const drafted = hasDraft(card);
  const name = "Card " + (index + 1);

  return (
    <div className={"ed-cardslot" + (full ? " full" : "") + (filled ? "" : " unused")}>
      <div className={"ed-card" + (drafted ? " drafted" : "")}>
        <div className="ed-cardhead">
          <IconButton value={card.icon} onChange={(v) => set("icon", v)} size={30} />
          <div className="ed-cardtitles">
            <input
              type="text"
              className="inline-field ed-cardtitle"
              placeholder={name + " title"}
              aria-label={name + " title"}
              value={card.title}
              onChange={(e) => set("title", e.target.value)}
            />
            <input
              type="text"
              className="inline-field ed-cardsub"
              placeholder="Subtitle (optional)"
              aria-label={name + " subtitle"}
              value={card.subtitle}
              onChange={(e) => set("subtitle", e.target.value)}
            />
          </div>
        </div>
        {drafted ? (
          <GrowText
            className="ed-cardbody"
            value={card.draft}
            onChange={(v) => set("draft", v)}
            ariaLabel={name + " generated text"}
          />
        ) : (
          <GrowText
            className="ed-cardbody"
            value={card.text}
            onChange={(v) => set("text", v)}
            placeholder={copy.placeholder}
            ariaLabel={name + " text"}
          />
        )}
      </div>
      <div className="ed-tools">
        {drafted ? (
          <Notes value={card.text} onChange={(v) => set("text", v)} ariaLabel={name + " notes"} />
        ) : (
          <select
            value={card.treatment}
            aria-label="What should happen to this text?"
            title={copy.hint}
            onChange={(e) => set("treatment", e.target.value)}
          >
            {TREATMENTS.map((t) => (
              <option key={t.v} value={t.v}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        <Counter used={(drafted ? card.draft : card.text).length} limit={limit} />
        <span className="spacer" />
        {filled ? (
          <button type="button" className="btn link" onClick={onClear}>
            Clear
          </button>
        ) : (
          <span className="tag">not used</span>
        )}
      </div>
      {drafted && (
        <ReviseBar
          kind="card"
          item={card}
          heading={card.title}
          limit={limit}
          {...ctx}
          onText={(t) => set("draft", t)}
          onDiscard={() => onChange({ ...card, draft: null, draftFrom: "" })}
        />
      )}
    </div>
  );
}

function NewsRow({ item, index, limit, ctx, onChange, onClear }) {
  const set = (k, v) => onChange({ ...item, [k]: v });
  const filled = newsFilled(item);
  const drafted = hasDraft(item);
  const name = "Short news " + (index + 1);
  return (
    <div className={"ed-newsslot" + (filled ? "" : " unused")}>
      <div className={"ed-newsrow" + (drafted ? " drafted" : "")}>
        <div className="ed-newslabel">
          <IconButton value={item.icon} onChange={(v) => set("icon", v)} size={26} />
          <GrowText
            className="ed-newslabeltext"
            value={item.label}
            onChange={(v) => set("label", v.replace(/\n/g, " "))}
            placeholder={name}
            ariaLabel={name + " label"}
          />
        </div>
        {drafted ? (
          <GrowText
            className="ed-newstext"
            value={item.draft}
            onChange={(v) => set("draft", v)}
            ariaLabel={name + " generated text"}
          />
        ) : (
          <GrowText
            className="ed-newstext"
            value={item.text}
            onChange={(v) => set("text", v)}
            placeholder="Two or three short lines."
            ariaLabel={name + " text"}
          />
        )}
      </div>
      <div className="ed-tools">
        {drafted && (
          <Notes value={item.text} onChange={(v) => set("text", v)} ariaLabel={name + " notes"} />
        )}
        <Counter used={(drafted ? item.draft : item.text).length} limit={limit} />
        <span className="spacer" />
        {filled ? (
          <button type="button" className="btn link" onClick={onClear}>
            Clear
          </button>
        ) : (
          <span className="tag">not used</span>
        )}
      </div>
      {drafted && (
        <ReviseBar
          kind="news"
          item={item}
          heading={item.label}
          limit={limit}
          {...ctx}
          onText={(t) => set("draft", t)}
          onDiscard={() => onChange({ ...item, draft: null, draftFrom: "" })}
        />
      )}
    </div>
  );
}

export default function OnePager({ state, patch, notify }) {
  const ctx = { style: state.style, provider: state.provider, notify };
  const activeCards = state.cards.filter(cardFilled).length;
  const activeNews = state.news.filter(newsFilled).length;
  const b = budget(Math.max(activeCards, 1), activeNews);

  const setCard = (i, c) => patch({ cards: state.cards.map((x, j) => (j === i ? c : x)) });
  const setNews = (i, n) => patch({ news: state.news.map((x, j) => (j === i ? n : x)) });

  return (
    <>
      <fieldset>
        <legend>
          Cards <span className="soft">{activeCards} of 4 in use</span>
        </legend>
        <p className="hint mb10">
          Type straight into the cards as they will appear, and click an icon to change
          it. Leave a card empty to drop it. Two cards fill a row; with an odd number the
          last one spans the full width. Fewer cards means a larger allowance for the
          rest &mdash; currently about {b.lines_per_row} lines per row.
        </p>
        <p className="hint mb10">
          Text size on the page: <b>{onePagerSize(state)} pt</b> for
          all cards and short news. It grows to {MAX_PT} pt when there is little text and
          shrinks to {MIN_PT} pt when there is a lot.
        </p>
        <div className="ed-paper ed-cards">
        {state.cards.map((c, i) => (
          <Card
            key={c.id}
            card={c}
            index={i}
            activeCards={activeCards}
            activeNews={activeNews}
            ctx={ctx}
            onChange={(nc) => setCard(i, nc)}
            onClear={() =>
              setCard(i, { ...c, title: "", subtitle: "", text: "", draft: null, draftFrom: "" })
            }
          />
        ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>
          Short news <span className="soft">{activeNews} of 3 in use</span>
        </legend>
        <p className="hint mb10">
          Rows left empty do not appear in the document, and the space returns to the
          cards above.
        </p>
        <div className="ed-paper ed-news">
        {state.news.map((n, i) => (
          <NewsRow
            key={n.id}
            item={n}
            index={i}
            limit={b.news}
            ctx={ctx}
            onChange={(nn) => setNews(i, nn)}
            onClear={() => setNews(i, { ...n, label: "", text: "", draft: null, draftFrom: "" })}
          />
        ))}
        </div>
      </fieldset>
    </>
  );
}
