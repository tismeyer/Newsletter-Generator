"""
ingestor.py
PDF → structure-aware chunks → voyage-3 embeddings → Supabase.

Heading detection uses three strategies in combination:
  1. Bold font flag (PyMuPDF flags bit 4)
  2. Font size larger than the body text average for that page
  3. Numbered section pattern (1.2.3, 1.2.3.4, etc.)
This handles PDFs where headings aren't flagged bold in font metadata,
which is common with WebManuals exports and Word-converted PDFs.

Used by:
  - POST /ingest  in app.py  (upload via the web UI)
  - python3 ingestor.py path/to/manual.pdf  (CLI for bulk loading)

Environment variables:
  VOYAGE_API_KEY
  SUPABASE_URL
  SUPABASE_KEY
"""

import os
import re
import logging
from pathlib import Path
from typing import Optional

import fitz                        # PyMuPDF
from embedder import embed_texts
from supabase import create_client

log = logging.getLogger(__name__)

# ── Supabase client ──────────────────────────────────────────────────────────
_supa = None

def _get_supa():
    global _supa
    if _supa is None:
        _supa = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_KEY"],
        )
    return _supa


# ── heading detection ────────────────────────────────────────────────────────

# Matches helvetic section numbering: 1, 1.2, 1.2.3, 1.2.3.4, etc.
SECTION_RE = re.compile(r'^(\d+(?:\.\d+){0,4})\s{1,8}(.{3,80})$')

# Footer / header patterns to strip
# Lines to skip — ONLY genuine headers/footers, not content.
# Be conservative: it is better to include a spurious line than to
# drop real content. The OM- pattern was removed because it strips
# legitimate content in OM-0 documents.
SKIP_LINE_RE = re.compile(
    r'(©\s*Helvetic|All rights reserved|'
    # Page markers like "APM 1.3-4" or "OM-A 8.3-2" at line start/end
    r'(?:^|\s)(?:APM|OM-[A-Z0-9]+)\s+\d+\.\d+-\d+\s*$|'
    # Revision footer: "01/19 - 06.01.2026"
    r'^\s*\d{2}/\d{2}\s*[-–]\s*\d{2}\.\d{2}\.\d{4}\s*$)',
    re.IGNORECASE | re.MULTILINE
)

def _collect_page_font_sizes(page) -> float:
    """Return the median font size on a page — used as body text baseline."""
    sizes = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                s = span.get("size", 0)
                if s > 0:
                    sizes.append(s)
    if not sizes:
        return 10.0
    sizes.sort()
    return sizes[len(sizes) // 2]   # median


def _is_heading(span: dict, median_size: float, line_text: str) -> bool:
    """
    True if this span looks like a heading. Three independent signals:
    1. Bold flag in font metadata
    2. Font size meaningfully larger than median body text
    3. Text matches the helvetic numbered-section pattern
    Any one signal is sufficient.
    """
    flags = span.get("flags", 0)
    bold  = bool(flags & (1 << 4))          # bit 4 = bold
    size  = span.get("size", 10)
    large = size >= median_size * 1.08      # ≥8% larger than body

    numbered = bool(SECTION_RE.match(line_text.strip()))

    return bold or large or numbered


def _extract_section_number(text: str) -> tuple:
    """Return (section_number, section_title) or ('', text)."""
    m = SECTION_RE.match(text.strip())
    if m:
        return m.group(1), m.group(2).strip()
    return "", text.strip()


# ── chunk classification ─────────────────────────────────────────────────────

MAX_CHUNK_CHARS = 1600   # ~400 tokens — keep chunks focused

def _classify_type(text: str) -> str:
    t = text.strip().upper()[:20]
    if t.startswith("NOTE"):    return "note"
    if t.startswith("CAUTION"): return "caution"
    if t.startswith("WARNING"): return "warning"
    return "body"

def _extract_tables(page) -> list[tuple[int, str]]:
    """
    Extract tables from a PDF page using PyMuPDF's find_tables().
    Returns a list of (bbox_y0, markdown_text) tuples so the main
    chunker can insert table chunks at the right position on the page.
    Each table is converted to a plain-text grid that embeds well.
    """
    try:
        tabs = page.find_tables()
        results = []
        for tab in tabs.tables:
            rows = tab.extract()
            if not rows:
                continue
            # Convert to pipe-delimited text (readable, embeds well)
            lines = []
            for r, row in enumerate(rows):
                cells = [str(c).strip() if c is not None else "" for c in row]
                # Clean up multiline cell content
                cells = [" | ".join(c.splitlines()) if chr(10) in c else c for c in cells]
                lines.append("| " + " | ".join(cells) + " |")
                # Add a separator after the header row
                if r == 0:
                    lines.append("|" + "|".join(["---"] * len(cells)) + "|")
            results.append((tab.bbox[1], chr(10).join(lines)))
        return results
    except Exception as e:
        log.debug("Table extraction failed on page: %s", e)
        return []


def _make_citation(manual_name: str, section: str,
                   section_title: str, page: int) -> str:
    parts = [manual_name]
    if section:      parts.append(section)
    if section_title:parts.append(section_title)
    parts.append(f"(p.{page})")
    return " ".join(parts)


# ── chunking ─────────────────────────────────────────────────────────────────

def chunk_pdf(
    pdf_path: str,
    manual_name: str,
    revision: str       = "",
    full_title: str     = "",
    revision_date: str  = "",
) -> list:
    doc    = fitz.open(pdf_path)
    chunks = []
    idx    = 0

    current_section       = ""
    current_section_title = ""
    current_chapter       = ""
    current_text_parts    = []
    current_page          = 1
    current_type          = "body"

    def flush(page: int):
        nonlocal idx, current_text_parts, current_type
        text = "\n".join(current_text_parts).strip()
        # Skip very short chunks (likely headers/footers that slipped through)
        if len(text) < 30:
            current_text_parts = []
            return
        chunks.append({
            "manual_name":   manual_name,
            "revision":      revision,
            "chapter":       current_chapter,
            "section":       current_section,
            "section_title": current_section_title,
            "page":          page,
            "chunk_index":   idx,
            "chunk_type":    current_type,
            "content":       text,
            "citation":      _make_citation(
                                 manual_name, current_section,
                                 current_section_title, page),
        })
        idx += 1
        current_text_parts = []
        current_type       = "body"

    for page_num, page in enumerate(doc, start=1):
        median_size = _collect_page_font_sizes(page)
        blocks = page.get_text("dict",
                               flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
        # Flush at each new page boundary
        if current_text_parts:
            flush(page_num - 1)

        # Extract tables on this page and add as dedicated chunks
        for _y0, table_md in _extract_tables(page):
            if len(table_md.strip()) < 20:
                continue
            chunks.append({
                "manual_name":   manual_name,
                "revision":      revision,
                "chapter":       current_chapter,
                "section":       current_section,
                "section_title": current_section_title,
                "page":          page_num,
                "chunk_index":   idx,
                "chunk_type":    "table",
                "content":       table_md,
                "citation":      _make_citation(
                                     manual_name, current_section,
                                     current_section_title, page_num),
            })
            idx += 1

        for block in blocks:
            if block["type"] != 0:
                continue

            for line in block["lines"]:
                line_text = "".join(s["text"] for s in line["spans"]).strip()
                if not line_text:
                    continue
                if SKIP_LINE_RE.search(line_text):
                    continue

                # Check if ANY span in this line signals a heading
                is_head = any(
                    _is_heading(s, median_size, line_text)
                    for s in line["spans"]
                )

                if is_head:
                    flush(page_num)
                    sec_num, sec_title = _extract_section_number(line_text)
                    if sec_num:
                        current_section       = sec_num
                        current_section_title = sec_title
                        current_chapter       = sec_num.split(".")[0]
                    else:
                        # Bold/large but no number — use as section title only
                        current_section_title = line_text[:80]

                    current_type       = "heading"
                    current_text_parts = [line_text]
                    flush(page_num)      # heading = its own small chunk
                else:
                    # Detect note/caution/warning transitions
                    line_type = _classify_type(line_text)
                    if line_type != "body" and current_text_parts:
                        flush(page_num)
                        current_type = line_type

                    current_text_parts.append(line_text)
                    current_page = page_num

                    # Split oversized chunks at natural boundaries
                    if sum(len(t) for t in current_text_parts) > MAX_CHUNK_CHARS:
                        flush(page_num)

    flush(current_page)
    doc.close()
    log.info("Chunked %s → %d chunks", pdf_path, len(chunks))
    return chunks


# ── embedding ────────────────────────────────────────────────────────────────

def embed_chunks(chunks: list) -> list:
    """Add 'embedding' to each chunk. Uses ANTHROPIC_API_KEY via Voyage."""
    texts      = [c["content"] for c in chunks]
    embeddings = embed_texts(texts, input_type="document")
    for chunk, vec in zip(chunks, embeddings):
        chunk["embedding"] = vec
    log.info("Embedded %d chunks", len(chunks))
    return chunks


# ── Supabase upsert ──────────────────────────────────────────────────────────

def upsert_manual(manual_name, revision, full_title,
                  revision_date, filename, chunk_count) -> str:
    supa = _get_supa()
    row  = {
        "manual_name":   manual_name,
        "full_title":    full_title,
        "revision":      revision,
        "revision_date": revision_date,
        "filename":      filename,
        "chunk_count":   chunk_count,
    }
    res = (supa.table("manuals")
               .upsert(row, on_conflict="manual_name,revision")
               .execute())
    return res.data[0]["id"]


def delete_old_chunks(manual_name: str, revision: str):
    """
    Remove all chunks for this manual+revision before re-ingesting.
    Deletes in batches of 200 IDs to avoid Supabase statement timeouts
    on large manuals.
    """
    supa = _get_supa()
    while True:
        res = (supa.table("manual_chunks")
                   .select("id")
                   .eq("manual_name", manual_name)
                   .eq("revision", revision)
                   .limit(200)
                   .execute())
        ids = [row["id"] for row in (res.data or [])]
        if not ids:
            break
        supa.table("manual_chunks").delete().in_("id", ids).execute()
        log.info("Deleted batch of %d chunks for %s rev %s",
                 len(ids), manual_name, revision)
        if len(ids) < 200:
            break


def delete_manual(manual_name: str, revision: str = None):
    """
    Delete a manual and all its chunks.
    If revision is None, deletes all revisions of that manual.
    """
    supa = _get_supa()
    while True:
        q = (supa.table("manual_chunks")
                 .select("id")
                 .eq("manual_name", manual_name))
        if revision:
            q = q.eq("revision", revision)
        res = q.limit(200).execute()
        ids = [row["id"] for row in (res.data or [])]
        if not ids:
            break
        supa.table("manual_chunks").delete().in_("id", ids).execute()
        log.info("Deleted batch of %d chunks", len(ids))
        if len(ids) < 200:
            break
    q = supa.table("manuals").delete().eq("manual_name", manual_name)
    if revision:
        q = q.eq("revision", revision)
    q.execute()
    log.info("Deleted manual record: %s rev %s", manual_name, revision or "all")


def store_chunks(manual_id: str, chunks: list):
    supa = _get_supa()
    rows = [{
        "manual_id":     manual_id,
        "manual_name":   c["manual_name"],
        "revision":      c["revision"],
        "chapter":       c["chapter"],
        "section":       c["section"],
        "section_title": c["section_title"],
        "page":          c["page"],
        "chunk_index":   c["chunk_index"],
        "chunk_type":    c["chunk_type"],
        "content":       c["content"],
        "citation":      c["citation"],
        "embedding":     c["embedding"],
    } for c in chunks]

    for i in range(0, len(rows), 200):
        supa.table("manual_chunks").insert(rows[i:i+200]).execute()
    log.info("Stored %d chunks for %s rev %s",
             len(rows), chunks[0]["manual_name"], chunks[0]["revision"])


# ── full pipeline ────────────────────────────────────────────────────────────

def ingest_pdf(pdf_path, manual_name, revision="",
               full_title="", revision_date="") -> dict:
    filename = Path(pdf_path).name
    log.info("Starting ingestion: %s (%s rev %s)", filename, manual_name, revision)

    chunks = chunk_pdf(pdf_path, manual_name, revision, full_title, revision_date)
    if not chunks:
        return {"error": "No text extracted from PDF", "chunks": 0}

    chunks = embed_chunks(chunks)
    delete_old_chunks(manual_name, revision)
    manual_id = upsert_manual(
        manual_name, revision, full_title, revision_date,
        filename, len(chunks)
    )
    store_chunks(manual_id, chunks)

    return {
        "manual_name": manual_name,
        "revision":    revision,
        "filename":    filename,
        "chunks":      len(chunks),
        "manual_id":   manual_id,
    }


# ── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if len(sys.argv) < 3:
        print("Usage: python3 ingestor.py <pdf> <manual_name> [revision] [full_title]")
        sys.exit(1)
    result = ingest_pdf(
        pdf_path    = sys.argv[1],
        manual_name = sys.argv[2],
        revision    = sys.argv[3] if len(sys.argv) > 3 else "",
        full_title  = sys.argv[4] if len(sys.argv) > 4 else "",
    )
    print(result)
