import { FlagNotes, GrowText, flagCls, unflag } from "./Bits.jsx";
import ReviseBar from "./DraftTools.jsx";
import IconButton from "./IconButton.jsx";
import PicturePicker from "./PicturePicker.jsx";
import { ICON_SRC } from "../icons.js";
import {
  TREATMENTS,
  TREATMENT_COPY,
  cardFilled,
  editorialParas,
  hasDraft,
  imageRatio,
  newsFilled,
  onePagerSize,
} from "../model.js";
import { MAX_PT, MIN_PT, budget, cardLimit, editorialCm, isFullWidth, lineCm } from "../budget.js";

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

/** Your notes, tucked away once generated text has taken their place. */
function Notes({ value, onChange, ariaLabel }) {
  return (
    <details className="mynotes">
      <summary>My notes</summary>
      <GrowText className="ed-notes" value={value} onChange={onChange} ariaLabel={ariaLabel} />
    </details>
  );
}

const CARD_FLAGS = { title: "Title", subtitle: "Subtitle", icon: "Icon", text: "Text" };
const NEWS_FLAGS = { label: "Label", icon: "Icon", text: "Text" };

/** Changing a field settles any import note on it. */
const setter = (x, onChange) => (k, v) =>
  onChange({ ...x, [k]: v, flags: unflag(x.flags, k === "draft" ? "text" : k) });

function Card({ card, index, activeCards, activeNews, ctx, onChange, onClear }) {
  const set = setter(card, onChange);
  const flags = card.flags;
  const limit = cardLimit(
    index, Math.max(activeCards, 1), activeNews, ctx.moves, ctx.editorial, imageRatio(card.image)
  );
  const filled = cardFilled(card);
  const full = filled && isFullWidth(index, activeCards);
  const copy = TREATMENT_COPY[card.treatment];
  const drafted = hasDraft(card);
  const name = "Card " + (index + 1);

  return (
    <div className={"ed-cardslot" + (full ? " full" : "") + (filled ? "" : " unused")}>
      <div className={"ed-card" + (drafted ? " drafted" : "")}>
        <div className="ed-cardhead">
          <span className={"flagwrap" + flagCls(flags, "icon")}>
            <IconButton value={card.icon} onChange={(v) => set("icon", v)} size={30} />
          </span>
          <div className="ed-cardtitles">
            <input
              type="text"
              className={"inline-field ed-cardtitle" + flagCls(flags, "title")}
              placeholder={name + " title"}
              aria-label={name + " title"}
              value={card.title}
              onChange={(e) => set("title", e.target.value)}
            />
            <input
              type="text"
              className={"inline-field ed-cardsub" + flagCls(flags, "subtitle")}
              placeholder="Subtitle (optional)"
              aria-label={name + " subtitle"}
              value={card.subtitle}
              onChange={(e) => set("subtitle", e.target.value)}
            />
          </div>
        </div>
        <PicturePicker
          value={card.image}
          onChange={(v) => set("image", v)}
          notify={ctx.notify}
          label={name + " picture"}
        />
        {drafted ? (
          <GrowText
            className={"ed-cardbody" + flagCls(flags, "text")}
            value={card.draft}
            onChange={(v) => set("draft", v)}
            ariaLabel={name + " generated text"}
          />
        ) : (
          <GrowText
            className={"ed-cardbody" + flagCls(flags, "text")}
            value={card.text}
            onChange={(v) => set("text", v)}
            placeholder={copy.placeholder}
            ariaLabel={name + " text"}
          />
        )}
      </div>
      <FlagNotes
        flags={flags}
        labels={CARD_FLAGS}
        onDismiss={(k) => onChange({ ...card, flags: unflag(flags, k) })}
      />
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
  const set = setter(item, onChange);
  const flags = item.flags;
  const filled = newsFilled(item);
  const drafted = hasDraft(item);
  const name = "Short news " + (index + 1);
  return (
    <div className={"ed-newsslot" + (filled ? "" : " unused")}>
      <FlagNotes
        flags={flags}
        labels={NEWS_FLAGS}
        onDismiss={(k) => onChange({ ...item, flags: unflag(flags, k) })}
      />
      <div className={"ed-newsrow" + (drafted ? " drafted" : "")}>
        <div className="ed-newslabel">
          <span className={"flagwrap" + flagCls(flags, "icon")}>
            <IconButton value={item.icon} onChange={(v) => set("icon", v)} size={26} />
          </span>
          <GrowText
            className={"ed-newslabeltext" + flagCls(flags, "label")}
            value={item.label}
            onChange={(v) => set("label", v.replace(/\n/g, " "))}
            placeholder={name}
            ariaLabel={name + " label"}
          />
        </div>
        {drafted ? (
          <GrowText
            className={"ed-newstext" + flagCls(flags, "text")}
            value={item.draft}
            onChange={(v) => set("draft", v)}
            ariaLabel={name + " generated text"}
          />
        ) : (
          <GrowText
            className={"ed-newstext" + flagCls(flags, "text")}
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
  const moves = state.moves || { on: false, entries: "", exits: "" };
  const setMoves = (m) => patch({ moves: { ...moves, ...m } });
  const activeCards = state.cards.filter(cardFilled).length;
  const activeNews = state.news.filter(newsFilled).length;
  const editorial = state.editorial || { on: false, icon: "pencil", title: "Editorial", text: "" };
  const setEditorial = (e) => patch({ editorial: { ...editorial, ...e } });
  const edParas = editorialParas(state);
  const b = budget(Math.max(activeCards, 1), activeNews, moves.on, edParas);
  // Lines of card text the editorial costs, at the smallest text size.
  const edLines = edParas ? Math.round(editorialCm(edParas, MIN_PT) / lineCm(MIN_PT)) : 0;

  const setCard = (i, c) => patch({ cards: state.cards.map((x, j) => (j === i ? c : x)) });
  const setNews = (i, n) => patch({ news: state.news.map((x, j) => (j === i ? n : x)) });

  return (
    <>
      <fieldset>
        <legend>Editorial</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={editorial.on}
            onChange={(e) => setEditorial({ on: e.target.checked })}
          />
          <span>Add an editorial above the cards</span>
        </label>
        {editorial.on && (
          <div className="ed-paper ed-editorial">
            <div className="ed-cardhead">
              <IconButton value={editorial.icon} onChange={(v) => setEditorial({ icon: v })} size={30} />
              <input
                type="text"
                className="inline-field ed-cardtitle"
                placeholder="Editorial"
                aria-label="Editorial title"
                value={editorial.title}
                onChange={(e) => setEditorial({ title: e.target.value })}
              />
            </div>
            <GrowText
              className="ed-cardbody"
              value={editorial.text}
              onChange={(v) => setEditorial({ text: v })}
              placeholder="A few words to open this issue. Printed exactly as typed."
              ariaLabel="Editorial text"
            />
          </div>
        )}
        <p className="hint">
          Spans the full width above the cards and is printed exactly as typed.
          {edLines > 0 && <> It takes about {edLines} lines of space from the cards.</>}
        </p>
      </fieldset>

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
            ctx={{ ...ctx, moves: moves.on, editorial: edParas }}
            onChange={(nc) => setCard(i, nc)}
            onClear={() =>
              setCard(i, { ...c, title: "", subtitle: "", text: "", draft: null, draftFrom: "", flags: {}, image: null })
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
            onClear={() => setNews(i, { ...n, label: "", text: "", draft: null, draftFrom: "", flags: {} })}
          />
        ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Entries and exits</legend>
        <label className="check">
          <input type="checkbox" checked={moves.on} onChange={(e) => setMoves({ on: e.target.checked })} />
          <span>Add an entries and exits row at the foot of the page</span>
        </label>
        {moves.on && (
          <div className="ed-paper ed-moves">
            {[
              ["entries", "Entries", "e.g. Anna Muster (F/O), Ben Beispiel (CC)"],
              ["exits", "Exits", "e.g. Carla Test (CPT)"],
            ].map(([k, label, ph]) => (
              <div className="ed-move" key={k}>
                <img className="ed-moveicon" src={ICON_SRC[k]} alt="" />
                <b>{label}</b>
                <GrowText
                  className="ed-movetext"
                  value={moves[k]}
                  onChange={(v) => setMoves({ [k]: v.replace(/\n/g, " ") })}
                  placeholder={ph}
                  ariaLabel={label}
                />
              </div>
            ))}
          </div>
        )}
        <p className="hint">
          Names are printed exactly as typed. The row takes about one line of space from the cards.
        </p>
      </fieldset>
    </>
  );
}
