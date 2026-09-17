from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import settings
from .generate import build_draft
from .providers import GenerationError, available, get_provider
from .render.renderer import filename_for, render_document
from .schemas import DocumentRequest, DraftResponse, RenderRequest

log = logging.getLogger("newsletter")
app = FastAPI(title="Newsletter Builder", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/providers")
async def providers() -> dict:
    """Which generators the frontend may offer, and which is preselected."""
    return {"available": available(), "default": settings.default_provider}


@app.post("/api/draft", response_model=DraftResponse)
async def draft(req: DocumentRequest) -> DraftResponse:
    """Generate the text and return it for review, without building the file."""
    try:
        provider = get_provider(req.provider)
    except GenerationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        chapters = await build_draft(req, provider)
    except GenerationError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    finally:
        await provider.aclose()
    return DraftResponse(masthead=req.masthead, chapters=chapters)


@app.post("/api/render")
async def render(req: RenderRequest) -> Response:
    """Build the .docx from reviewed text."""
    try:
        data = render_document(req.masthead, req.chapters)
    except Exception as e:  # noqa: BLE001 - surfaced to the editor as a message
        log.exception("render failed")
        raise HTTPException(status_code=500, detail="The document could not be built.") from e
    name = filename_for(req.masthead)
    return Response(
        content=data,
        media_type=DOCX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@app.post("/api/document")
async def document(req: DocumentRequest) -> Response:
    """Draft and build in one call, for editors who do not want the review step."""
    drafted = await draft(req)
    return await render(RenderRequest(masthead=drafted.masthead, chapters=drafted.chapters))
