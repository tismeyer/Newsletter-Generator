import { useState } from "react";
import { revise } from "../api.js";
import { draftStale } from "../model.js";

/**
 * Shown under a box once its text has been generated: ask the AI for changes
 * to this box only, or throw the text away and go back to the notes.
 *
 * The current text, hand edits included, is what gets revised, so fixing a
 * word by hand and then asking for "shorter" keeps the fix.
 */
export default function ReviseBar({
  kind, item, heading, limit, style, provider, onText, onDiscard, notify,
}) {
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const manual = provider === "manual";

  const run = async () => {
    if (!ask.trim() || busy) return;
    setBusy(true);
    try {
      const r = await revise({
        provider, style, kind, heading,
        notes: item.draftFrom ?? item.text,
        current: item.draft,
        instruction: ask,
        limit: limit || null,
      });
      onText(r.text);
      setAsk("");
      notify("Text revised.");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="revise">
      <div className="revise-row">
        <input
          type="text"
          value={ask}
          disabled={busy || manual}
          placeholder={
            manual
              ? "Pick an AI writer at the top to ask for changes"
              : "Ask for changes, e.g. “shorter, mention the 14 October deadline”"
          }
          aria-label="Ask for changes to this text"
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <button
          type="button"
          className="btn small"
          disabled={busy || manual || !ask.trim()}
          onClick={run}
        >
          {busy ? "Revising…" : "Revise"}
        </button>
      </div>
      <div className="revise-foot">
        {draftStale(item) ? (
          <span className="stale">Your notes changed after this text was written.</span>
        ) : (
          <span>AI text. Edit it directly, or ask for changes above.</span>
        )}
        <span className="spacer" />
        <button type="button" className="btn link" onClick={onDiscard}>
          Back to my notes
        </button>
      </div>
    </div>
  );
}
