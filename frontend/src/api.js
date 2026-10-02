// Tolerate a trailing slash or an accidental "/api" suffix in the configured
// base URL: both produce 404s that look like a server fault rather than a
// configuration one.
const BASE = (import.meta.env.VITE_API_BASE || "")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let detail = `Request failed (${r.status}).`;
    try {
      const j = await r.json();
      if (j.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* keep the status message */
    }
    throw new Error(detail);
  }
  return r;
}

export const getProviders = async () => {
  const r = await fetch(BASE + "/api/providers");
  if (!r.ok) throw new Error("Could not reach the server.");
  return r.json();
};

export const draft = async (payload) => (await post("/api/draft", payload)).json();

export const revise = async (body) => (await post("/api/revise", body)).json();

/**
 * Build and download the .docx. Boxes that already have text are sent as
 * finished text, so this only reaches a model for boxes not yet written.
 */
export async function renderDocument(payload) {
  const r = await post("/api/document", payload);
  const blob = await r.blob();
  const name =
    (r.headers.get("Content-Disposition") || "").match(/filename="(.+?)"/)?.[1] ||
    "newsletter.docx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}

/** Send a Word file to be restructured into our layouts. Text is copied, not rewritten. */
export const importWord = async (body) => (await post("/api/import", body)).json();
