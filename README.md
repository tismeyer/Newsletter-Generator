# Newsletter Builder

Produces Helvetic Airways department newsletters and bulletins as branded Word
documents. Editors supply facts; a language model supplies sentences; the Word
template supplies the design.

The design lives in `backend/app/assets/template.docx` and nowhere else. To
change how documents look, edit that file in Word — no code changes.

```
frontend/   React + Vite. The form, the live A4 preview, the download.
backend/    FastAPI. Prompts, providers, .docx rendering.
```

## Running locally

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173, /api proxied to :8000
```

Without an API key the app still runs: the provider selector falls back to
**No AI**, which uses the editor's text exactly as typed.

## How text is produced

Each chapter carries a `treatment` that decides what happens to what the editor
wrote:

| treatment  | what happens                                                   |
|------------|----------------------------------------------------------------|
| `verbatim` | used word for word; **never sent to a model**                  |
| `polish`   | spelling, grammar and punctuation corrected; wording untouched  |
| `draft`    | notes turned into finished prose in the house style             |

`verbatim` short-circuits before any network call, so text that must not change
cannot change — and it costs nothing to generate.

Highlight boxes follow a three-level policy: a document default, a per-chapter
override, and a hard rule that `verbatim` chapters never receive generated
boxes.

## Providers

`backend/app/providers/` holds one class per generator behind a single
interface:

- `claude.py` — Anthropic Messages API. Works today.
- `copilot.py` — Microsoft Graph Copilot Chat API. Fill in the three
  `COPILOT_*` variables once the Entra app registration exists. The endpoint is
  in preview, so its request/response shapes are the part most likely to need
  updating; nothing outside this file depends on them.
- `manual.py` — no model at all.

Prompts live in `prompts.py`, above the interface, so every provider receives
identical instructions and output stays comparable when you switch.

`GET /api/providers` reports which are configured; the frontend only offers
those.

## API

| method | path            | purpose                                        |
|--------|-----------------|------------------------------------------------|
| GET    | `/api/health`   | liveness                                        |
| GET    | `/api/providers`| which generators are configured                 |
| POST   | `/api/draft`    | generate text, return it for review             |
| POST   | `/api/render`   | build the `.docx` from reviewed text            |
| POST   | `/api/document` | draft and build in one call                     |

Splitting draft from render is deliberate: editors see the generated text before
it becomes a file, and corrections do not cost another generation.

## Deploying

Backend on Railway (`uvicorn app.main:app --host 0.0.0.0 --port $PORT`), frontend
on Vercel with `VITE_API_BASE` pointing at it. Add the Vercel URL to
`CORS_ORIGINS` on the backend.

## Changing the template

1. Open `backend/app/assets/template.docx` in Word.
2. Edit styles, header or footer. Keep the style **IDs** (`Body`, `Lead`,
   `Heading1`, `Heading2`, `CalloutTitle`, `Callout`, `DocTitle`, `DocHeadline`,
   `DocDate`) and the `{{KICKER}}`, `{{ISSUED_BY}}`, `{{REVISION}}`,
   `{{PUB_DATE}}` placeholders.
3. Save. The next generated document picks it up.

The renderer clears the template body and writes fresh content, so any sample
text left in the file is discarded — but the header, footer, page setup,
numbering and styles are kept.
