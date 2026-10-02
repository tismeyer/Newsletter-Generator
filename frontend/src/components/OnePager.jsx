import { Segmented } from "./Bits.jsx";
import {
  ICONS,
  TREATMENTS,
  TREATMENT_COPY,
  cardFilled,
  newsFilled,
} from "../model.js";
import { budget, cardLimit, isFullWidth } from "../budget.js";

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

function IconPicker({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Icon">
      {ICONS.map((i) => (
        <option key={i.v} value={i.v}>
          {i.label}
        </option>
      ))}
    </select>
  );
}

function Card({ card, index, activeCards, activeNews, onChange, onClear }) {
  const set = (k, v) => onChange({ ...card, [k]: v });
  const limit = cardLimit(index, Math.max(activeCards, 1), activeNews);
  const full = isFullWidth(index, activeCards);
  const copy = TREATMENT_COPY[card.treatment];
  const filled = cardFilled(card);

  return (
    <details className={"chapter" + (filled ? "" : " muted")} open={filled || index < 2}>
      <summary>
        <span className="num">{index + 1}</span>
        <span className="ttl">{card.title || "Empty card"}</span>
        {filled ? (
          full ? (
            <span className="tag">full width</span>
          ) : (
            <span className="tag">half width</span>
          )
        ) : (
          <span className="tag">not used</span>
        )}
      </summary>
      <div className="inner">
        <div className="grid g2">
          <label className="f">
            <span>Title</span>
            <input
              type="text"
              placeholder="e.g. Flight Safety Spotlight"
              value={card.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label className="f">
            <span>Icon</span>
            <IconPicker value={card.icon} onChange={(v) => set("icon", v)} />
          </label>
        </div>

        <label className="f mt10">
          <span>Subtitle</span>
          <input
            type="text"
            placeholder="e.g. PRM and infant seating"
            value={card.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
          />
        </label>

        <label className="f mt10">
          <span className="rowlabel">
            {copy.label}
            <Counter used={card.text.length} limit={limit} />
          </span>
          <textarea
            placeholder={copy.placeholder}
            value={card.text}
            onChange={(e) => set("text", e.target.value)}
          />
        </label>

        <div className="mt8">
          <Segmented
            label="What should happen to this text?"
            options={TREATMENTS}
            value={card.treatment}
            onChange={(v) => set("treatment", v)}
          />
          <span className="hint">{copy.hint}</span>
        </div>

        {filled && (
          <div className="inline mt10">
            <span className="spacer" />
            <button type="button" className="btn link" onClick={onClear}>
              Clear this card
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

function NewsRow({ item, index, limit, onChange, onClear }) {
  const set = (k, v) => onChange({ ...item, [k]: v });
  const filled = newsFilled(item);
  return (
    <div className={"boxrow" + (filled ? "" : " muted")}>
      <div className="top">
        <strong>Short news {index + 1}</strong>
        {!filled && <span className="tag">not used</span>}
        <span className="spacer" />
        {filled && (
          <button type="button" className="btn link" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <div className="grid g2">
        <label className="f">
          <span>Label</span>
          <input
            type="text"
            placeholder="e.g. Team news"
            value={item.label}
            onChange={(e) => set("label", e.target.value)}
          />
        </label>
        <label className="f">
          <span>Icon</span>
          <IconPicker value={item.icon} onChange={(v) => set("icon", v)} />
        </label>
      </div>
      <label className="f mt8">
        <span className="rowlabel">
          Text
          <Counter used={item.text.length} limit={limit} />
        </span>
        <textarea
          className="short"
          placeholder="Two or three short lines."
          value={item.text}
          onChange={(e) => set("text", e.target.value)}
        />
      </label>
    </div>
  );
}

export default function OnePager({ state, patch }) {
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
          Leave a card empty to drop it. Two cards fill a row; with an odd number the
          last one spans the full width. Fewer cards means a larger allowance for the
          rest &mdash; currently about {b.lines_per_row} lines per row.
        </p>
        {state.cards.map((c, i) => (
          <Card
            key={c.id}
            card={c}
            index={i}
            activeCards={activeCards}
            activeNews={activeNews}
            onChange={(nc) => setCard(i, nc)}
            onClear={() => setCard(i, { ...c, title: "", subtitle: "", text: "" })}
          />
        ))}
      </fieldset>

      <fieldset>
        <legend>
          Short news <span className="soft">{activeNews} of 3 in use</span>
        </legend>
        <p className="hint mb10">
          Rows left empty do not appear in the document, and the space returns to the
          cards above.
        </p>
        {state.news.map((n, i) => (
          <NewsRow
            key={n.id}
            item={n}
            index={i}
            limit={b.news}
            onChange={(nn) => setNews(i, nn)}
            onClear={() => setNews(i, { ...n, label: "", text: "" })}
          />
        ))}
      </fieldset>
    </>
  );
}
