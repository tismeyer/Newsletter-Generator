from __future__ import annotations

import base64
import binascii
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import settings
from .budget import budget as compute_budget
from .generate import build_draft, build_one_pager, revise as revise_box
from .importer import map_document
from .providers import GenerationError, available, get_provider
from .render.onepager import render_one_pager
from .render.renderer import filename_for, render_document
from .schemas import (
    DocumentRequest,
    DraftResponse,
    Layout,
    RenderRequest,
    ImportRequest,
    ReviseRequest,
    ReviseResponse,
)

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


@app.get("/api/budget")
async def budget(cards: int = 4, news: int = 3, moves: bool = False, editorial: int = 0) -> dict:
    """Character allowances for the one-page layout, given how many boxes are in
    use. The frontend mirrors this calculation for the live counters; this
    endpoint is the authority if the two ever disagree. `editorial` is the
    length of the editorial text in characters, 0 when there is none."""
    return compute_budget(cards, news, moves, ["x" * editorial] if editorial > 0 else None)


@app.post("/api/draft", response_model=DraftResponse)
async def draft(req: DocumentRequest) -> DraftResponse:
    """Generate the text and return it for review, without building the file."""
    try:
        provider = get_provider(req.provider)
    except GenerationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        if req.layout is Layout.ONE_PAGER:
            cards, news = await build_one_pager(req, provider)
            return DraftResponse(
                masthead=req.masthead, layout=req.layout, cards=cards, news=news,
                editorial=req.editorial,
            )
        chapters = await build_draft(req, provider)
    except GenerationError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    finally:
        await provider.aclose()
    return DraftResponse(masthead=req.masthead, layout=req.layout, chapters=chapters)


@app.post("/api/revise", response_model=ReviseResponse)
async def revise(req: ReviseRequest) -> ReviseResponse:
    """Amend one generated box as the editor asks, leaving every other box alone."""
    try:
        provider = get_provider(req.provider)
    except GenerationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        text, used = await revise_box(req, provider)
    except GenerationError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    finally:
        await provider.aclose()
    return ReviseResponse(text=text, provider_used=used)


MAX_IMPORT_BYTES = 15 * 1024 * 1024


@app.post("/api/import")
async def import_word(req: ImportRequest) -> dict:
    """Restructure an existing Word document into this app's layouts.

    Text is copied, not rewritten; anything the model had to guess comes back
    in `flags` for the editor to check."""
    try:
        data = base64.b64decode(req.data_base64, validate=True)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(status_code=400, detail="The file did not arrive intact.") from e
    if len(data) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="That file is larger than 15 MB.")
    try:
        provider = get_provider(req.provider)
    except GenerationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        result, count = await map_document(data, req.layout, provider, req.icons, req.kickers)
    except GenerationError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    finally:
        await provider.aclose()
    return {**result.model_dump(), "elements": count}


@app.post("/api/render")
async def render(req: RenderRequest) -> Response:
    """Build the .docx from reviewed text."""
    try:
        if req.layout is Layout.ONE_PAGER:
            data = render_one_pager(
                req.masthead, req.cards, req.news, req.moves, req.editorial
            )
        else:
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
    return await render(RenderRequest(
        masthead=drafted.masthead, layout=drafted.layout,
        chapters=drafted.chapters, cards=drafted.cards, news=drafted.news,
        moves=req.moves, editorial=drafted.editorial,
    ))
