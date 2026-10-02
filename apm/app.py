"""
app.py
FastAPI service with three capabilities:
  1. GET  /          — serves the editor frontend (index.html)
  2. POST /generate  — notes → compliant draft, grounded in manual context
  3. POST /ingest    — upload a PDF manual → chunk → embed → store in Supabase
  4. GET  /manuals   — list all ingested manuals (for admin UI)

Environment variables (set in Railway):
  ANTHROPIC_API_KEY   — Claude API key
  VOYAGE_API_KEY      — Voyage embeddings key (same Anthropic account)
  SUPABASE_URL        — from Supabase project settings → API
  SUPABASE_KEY        — service_role key (server-side writes)

Optional:
  APM_MODEL           — defaults to claude-sonnet-4-6
  APM_RETRIEVAL       — set to "false" to disable retrieval (useful for testing)
"""

import os
import logging
import tempfile
from pathlib import Path
from typing import List, Optional

import uuid
import threading
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from anthropic import Anthropic

from prompt_builder import load_rules, build_system_prompt
from checker import run_checks, format_violations

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

MODEL          = os.environ.get("APM_MODEL", "claude-sonnet-4-6")
MAX_REVISIONS  = 2
USE_RETRIEVAL  = os.environ.get("APM_RETRIEVAL", "true").lower() != "false"

RULES  = load_rules("APM_rules.json")
client = Anthropic()

# Startup key check — logs first/last 4 chars so you can match against dashboard
_vk = os.environ.get("VOYAGE_API_KEY", "")
if _vk:
    log.info("VOYAGE_API_KEY present: %s...%s (len=%d)", _vk[:4], _vk[-4:], len(_vk))
else:
    log.warning("VOYAGE_API_KEY is NOT set")

# ── ingestion job store ───────────────────────────────────────────────────────
# Holds progress for each running/completed ingest job.
# Simple in-memory dict — fine for the editor use case (one job at a time).
_jobs: dict = {}   # job_id -> {status, progress, message, result, error}

def _job_update(job_id: str, **kwargs):
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)

# Retrieval clients — imported lazily so the app starts even without
# Supabase/Voyage keys (useful for local testing without the DB)
_retrieval_ready = False
try:
    from retriever import retrieve, format_context, list_manuals
    _retrieval_ready = True
except Exception as e:
    log.warning("Retrieval unavailable: %s", e)

app = FastAPI(title="helvetic APM content generator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Increase the maximum upload size to 200MB
# (FastAPI/Starlette default is 1MB which is too small for large PDFs)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class LargeUploadMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request._body_size_limit = 200 * 1024 * 1024  # 200MB
        return await call_next(request)

app.add_middleware(LargeUploadMiddleware)


# ── frontend ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def frontend():
    return HTMLResponse(content=Path("index.html").read_text(encoding="utf-8"))


# ── health ───────────────────────────────────────────────────────────────────

@app.get("/chunks/{manual_name}")
def show_chunks(manual_name: str):
    """Show all chunks for a manual — useful for diagnosing ingestion quality."""
    if not _retrieval_ready:
        return {"error": "retrieval not configured"}
    try:
        from retriever import _get_supa
        supa = _get_supa()
        res = (supa.table("manual_chunks")
                   .select("chunk_index,page,section,section_title,chunk_type,content")
                   .eq("manual_name", manual_name)
                   .order("chunk_index")
                   .execute())
        return {
            "manual": manual_name,
            "chunk_count": len(res.data),
            "chunks": [
                {
                    "idx":     c["chunk_index"],
                    "page":    c["page"],
                    "section": c["section"],
                    "title":   c["section_title"],
                    "type":    c["chunk_type"],
                    "chars":   len(c["content"]),
                    "preview": c["content"][:120].replace("\n", " "),
                }
                for c in res.data
            ]
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/debug-env")
def debug_env():
    """Safely check which environment variables are present (values masked)."""
    import os
    keys_to_check = ["ANTHROPIC_API_KEY", "VOYAGE_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"]
    return {
        k: ("SET (length=" + str(len(os.environ.get(k, ""))) + ")")
           if os.environ.get(k) else "NOT SET"
        for k in keys_to_check
    }

@app.get("/health")
def health():
    return {
        "ok":        True,
        "model":     MODEL,
        "rules":     len(RULES),
        "retrieval": _retrieval_ready and USE_RETRIEVAL,
    }


# ── generate ─────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    notes:     str
    target:    str           = "html"
    structure: Optional[str] = None
    tone:      Optional[str] = None
    audience:  Optional[str] = None
    length:    Optional[str] = None
    manuals:   Optional[List[str]] = None   # filter retrieval to specific manuals


class GenerateResponse(BaseModel):
    draft:      str
    violations: List[dict]
    iterations: int
    sources:    List[dict]   # chunks used as context, for display


def _call(system: str, messages: List[dict]) -> str:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=system,
        messages=messages,
    )
    return "".join(b.text for b in msg.content if b.type == "text").strip()


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    # ── 1. Retrieve relevant manual passages ─────────────────────────────
    sources = []
    context_block = ""
    if _retrieval_ready and USE_RETRIEVAL:
        try:
            sources = retrieve(
                query         = req.notes,
                top_k         = 6,
                manual_filter = req.manuals or None,
            )
            context_block = format_context(sources)
        except Exception as e:
            log.warning("Retrieval failed, proceeding without context: %s", e)

    # ── 2. Build system prompt ────────────────────────────────────────────
    system = build_system_prompt(
        RULES,
        target    = req.target,
        structure = req.structure,
        tone      = req.tone,
        audience  = req.audience,
        length    = req.length,
        context   = context_block,   # injected manual passages
    )

    # ── 3. Generate ───────────────────────────────────────────────────────
    messages   = [{"role": "user", "content": f"Editor's notes:\n{req.notes}"}]
    draft      = _call(system, messages)
    violations = run_checks(draft, RULES)
    iterations = 0

    # ── 4. Auto-revise on hard errors ────────────────────────────────────
    while iterations < MAX_REVISIONS:
        hard = [v for v in violations if v.get("severity") == "error"]
        if not hard:
            break
        messages.append({"role": "assistant", "content": draft})
        messages.append({
            "role":    "user",
            "content": (
                "The draft violates these house-style rules. "
                "Fix only these issues and return the full corrected content "
                "with no commentary:\n" + format_violations(hard)
            ),
        })
        draft      = _call(system, messages)
        violations = run_checks(draft, RULES)
        iterations += 1

    return GenerateResponse(
        draft      = draft,
        violations = violations,
        iterations = iterations,
        sources    = sources,
    )


# ── ingest ───────────────────────────────────────────────────────────────────

def _run_ingest(job_id: str, tmp_path: str, manual_name: str,
                revision: str, full_title: str, revision_date: str):
    """
    Background thread: chunk → embed → store, with progress updates.
    Patches ingestor functions to report back to the job store.
    """
    from ingestor import chunk_pdf, embed_chunks, delete_old_chunks, upsert_manual, store_chunks
    from pathlib import Path as _Path

    try:
        # Phase 1: chunking
        _job_update(job_id, status="chunking", progress=5,
                    message="Extracting text and structure…")
        chunks = chunk_pdf(tmp_path, manual_name, revision, full_title, revision_date)
        total  = len(chunks)
        _job_update(job_id, progress=15,
                    message=f"Extracted {total} chunks — generating embeddings…")

        # Phase 2: embed in batches, report per-batch progress
        from embedder import embed_texts, EMBED_BATCH
        import time
        texts      = [c["content"] for c in chunks]
        embeddings = []
        for i in range(0, len(texts), EMBED_BATCH):
            batch = texts[i : i + EMBED_BATCH]
            # Retry loop (same as embedder.py but with progress updates)
            max_retries = 5
            for attempt in range(max_retries):
                import httpx, os as _os
                headers = {
                    "Authorization": f"Bearer {_os.environ['VOYAGE_API_KEY']}",
                    "Content-Type": "application/json",
                }
                resp = httpx.post(
                    "https://api.voyageai.com/v1/embeddings",
                    headers=headers,
                    json={"model": "voyage-3", "input": batch, "input_type": "document"},
                    timeout=60,
                )
                if resp.status_code == 429:
                    wait = 20 * (attempt + 1)
                    _job_update(job_id,
                        message=f"Rate limit — waiting {wait}s (batch {i//EMBED_BATCH + 1})…")
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                break
            data = resp.json()
            ordered = sorted(data["data"], key=lambda x: x["index"])
            embeddings.extend(item["embedding"] for item in ordered)
            for chunk, vec in zip(chunks[i : i + EMBED_BATCH], embeddings[i:]):
                chunk["embedding"] = vec

            done_pct = 15 + int(70 * min(i + EMBED_BATCH, total) / total)
            _job_update(job_id, status="embedding", progress=done_pct,
                        message=f"Embedded {min(i + EMBED_BATCH, total)}/{total} chunks…")

        # Phase 3: store
        _job_update(job_id, status="storing", progress=88,
                    message="Saving to database…")
        delete_old_chunks(manual_name, revision)
        filename  = _Path(tmp_path).name
        manual_id = upsert_manual(manual_name, revision, full_title,
                                  revision_date, filename, len(chunks))
        store_chunks(manual_id, chunks)

        _job_update(job_id, status="done", progress=100,
                    message=f"✓ {total} chunks ingested",
                    result={"manual_name": manual_name, "revision": revision,
                            "chunks": total, "manual_id": manual_id})
    except Exception as e:
        log.error("Ingest job %s failed: %s", job_id, e)
        _job_update(job_id, status="error", progress=0,
                    message=str(e), error=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@app.post("/ingest")
async def ingest(
    file:          UploadFile = File(...),
    manual_name:   str        = Form(...),
    revision:      str        = Form(""),
    full_title:    str        = Form(""),
    revision_date: str        = Form(""),
):
    """
    Upload a PDF and start a background ingestion job.
    Returns immediately with a job_id.
    Poll GET /ingest-status/{job_id} for progress.
    """
    if not _retrieval_ready:
        return {"error": "Retrieval/ingestion not configured"}

    # Stream upload to temp file
    suffix = Path(file.filename or "upload.pdf").suffix or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        received = 0
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            tmp.write(chunk)
            received += len(chunk)

    size_mb = received / 1024 / 1024
    log.info("Upload saved: %s (%.1f MB)", file.filename, size_mb)

    # Create job and start background thread
    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {
        "status":   "uploading",
        "progress": 2,
        "message":  f"Received {size_mb:.1f} MB — starting ingestion…",
        "result":   None,
        "error":    None,
    }

    t = threading.Thread(
        target=_run_ingest,
        args=(job_id, tmp_path, manual_name, revision, full_title, revision_date),
        daemon=True,
    )
    t.start()

    return {"job_id": job_id}


@app.get("/ingest-status/{job_id}")
def ingest_status(job_id: str):
    """Poll this endpoint for ingestion progress."""
    job = _jobs.get(job_id)
    if not job:
        return {"status": "not_found", "progress": 0, "message": "Job not found"}
    return job


# ── chunked upload support ────────────────────────────────────────────────────
# Browsers time out on large single-request uploads via Railway.
# Instead, the frontend splits the file into 4MB chunks and sends them
# one at a time. The server reassembles them, then starts ingestion.

_upload_buffers: dict = {}   # upload_id -> {"path": str, "handle": file}

@app.post("/upload-chunk")
async def upload_chunk(
    file:        UploadFile = File(...),
    upload_id:   str        = Form(...),
    chunk_index: int        = Form(...),
    total_chunks: int       = Form(...),
    filename:    str        = Form("upload.pdf"),
):
    """Receive one chunk of a large file upload."""
    data = await file.read()

    if upload_id not in _upload_buffers:
        suffix   = Path(filename).suffix or ".pdf"
        tmp      = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        _upload_buffers[upload_id] = {"path": tmp.name, "handle": tmp,
                                       "received": 0, "total": total_chunks}

    buf = _upload_buffers[upload_id]
    buf["handle"].write(data)
    buf["received"] += 1

    if buf["received"] >= total_chunks:
        buf["handle"].close()
        log.info("Chunked upload complete: %s (%.1f MB)",
                 filename, os.path.getsize(buf["path"]) / 1024 / 1024)

    return {"ok": True, "received": buf["received"], "total": total_chunks}


@app.post("/ingest-assembled")
async def ingest_assembled(
    upload_id:    str = Form(...),
    manual_name:  str = Form(...),
    revision:     str = Form(""),
    full_title:   str = Form(""),
    revision_date: str = Form(""),
):
    """Start ingestion of a fully-assembled chunked upload."""
    if upload_id not in _upload_buffers:
        return {"error": "Upload not found — please re-upload the file"}

    buf = _upload_buffers.pop(upload_id)
    tmp_path = buf["path"]

    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {
        "status":   "starting",
        "progress": 2,
        "message":  "Starting ingestion…",
        "result":   None,
        "error":    None,
    }

    t = threading.Thread(
        target=_run_ingest,
        args=(job_id, tmp_path, manual_name, revision, full_title, revision_date),
        daemon=True,
    )
    t.start()

    return {"job_id": job_id}


# ── manuals list ─────────────────────────────────────────────────────────────

@app.get("/chunks/{manual_name}")
def chunks(manual_name: str):
    """
    Return all stored chunks for a manual — useful for diagnosing
    whether the chunker captured all content correctly.
    Query: /chunks/OM-0%202%20Uniform%20Regulations
    """
    if not _retrieval_ready:
        return []
    try:
        supa = __import__("retriever")._get_supa()
        res  = (supa.table("manual_chunks")
                    .select("chunk_index,section,section_title,page,chunk_type,content")
                    .eq("manual_name", manual_name)
                    .order("chunk_index")
                    .execute())
        return res.data or []
    except Exception as e:
        log.warning("Could not fetch chunks for %s: %s", manual_name, e)
        return []


@app.get("/manuals")
def manuals():
    """Return all ingested manuals. Used by the admin panel in the frontend."""
    if not _retrieval_ready:
        return []
    try:
        return list_manuals()
    except Exception as e:
        log.warning("Could not list manuals: %s", e)
        return []


class DeleteRequest(BaseModel):
    manual_name: str
    revision: Optional[str] = None


@app.post("/delete-manual")
def delete_manual_endpoint(req: DeleteRequest):
    """Delete a manual and all its chunks from Supabase."""
    if not _retrieval_ready:
        return {"error": "Retrieval not configured"}
    try:
        from ingestor import delete_manual
        delete_manual(req.manual_name, req.revision)
        return {"ok": True, "deleted": req.manual_name,
                "revision": req.revision or "all"}
    except Exception as e:
        log.error("Delete failed: %s", e)
        return {"error": str(e)}
