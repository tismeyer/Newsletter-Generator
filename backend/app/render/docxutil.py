"""Small OOXML helpers for the things python-docx does not expose directly:
cell shading, single-sided borders, and 'keep row together'.
"""
from __future__ import annotations

from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def _el(tag: str, **attrs) -> OxmlElement:
    e = OxmlElement(tag)
    for k, v in attrs.items():
        e.set(qn("w:" + k), str(v))
    return e


def shade_cell(cell, fill: str) -> None:
    cell._tc.get_or_add_tcPr().append(_el("w:shd", val="clear", color="auto", fill=fill))


def cell_borders(cell, *, top=None, left=None, bottom=None, right=None, size=6) -> None:
    """Set individual borders; anything not named is removed."""
    tcPr = cell._tc.get_or_add_tcPr()
    for old in tcPr.findall(qn("w:tcBorders")):
        tcPr.remove(old)
    borders = OxmlElement("w:tcBorders")
    for side in ("top", "left", "bottom", "right"):
        colour = {"top": top, "left": left, "bottom": bottom, "right": right}.get(side)
        if colour:
            borders.append(_el(f"w:{side}", val="single", sz=size, space=0, color=colour))
        else:
            borders.append(_el(f"w:{side}", val="nil"))
    tcPr.append(borders)


def cell_margins(cell, top=90, bottom=90, left=140, right=140) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for side, val in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
        mar.append(_el(f"w:{side}", w=val, type="dxa"))
    tcPr.append(mar)


def row_cannot_split(row) -> None:
    row._tr.get_or_add_trPr().append(_el("w:cantSplit"))


def table_no_borders(table) -> None:
    tblPr = table._tbl.tblPr
    for old in tblPr.findall(qn("w:tblBorders")):
        tblPr.remove(old)
    borders = OxmlElement("w:tblBorders")
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        borders.append(_el(f"w:{side}", val="nil"))
    tblPr.append(borders)


def clear_body(doc) -> None:
    """Remove every paragraph and table, keeping the final sectPr (page setup,
    header/footer references) intact."""
    body = doc.element.body
    for child in list(body):
        if child.tag != qn("w:sectPr"):
            body.remove(child)


def find_bullet_numpr(doc):
    """Return the numbering reference to use for bullet lists.

    Normally read from a bullet paragraph in the template. The engine template
    has an empty body on purpose, so fall back to the first numbering
    definition in numbering.xml.
    """
    import copy

    for p in doc.paragraphs:
        pPr = p._p.find(qn("w:pPr"))
        if pPr is None:
            continue
        found = pPr.find(qn("w:numPr"))
        if found is not None:
            return copy.deepcopy(found)

    try:
        numbering = doc.part.numbering_part.element
    except (NotImplementedError, KeyError, AttributeError):
        return None

    # A template can hold several bullet definitions (Word adds its own).
    # Prefer the house bullet: the one whose marker is coloured Helvetic red.
    best_abstract, fallback_abstract = None, None
    for abstract in numbering.findall(qn("w:abstractNum")):
        lvl = abstract.find(qn("w:lvl"))
        if lvl is None:
            continue
        aid = abstract.get(qn("w:abstractNumId"))
        if fallback_abstract is None:
            fallback_abstract = aid
        colour = lvl.find(qn("w:rPr"))
        colour = colour.find(qn("w:color")) if colour is not None else None
        if colour is not None and (colour.get(qn("w:val")) or "").upper() == "E4032E":
            best_abstract = aid
            break
    abstract_id = best_abstract or fallback_abstract
    if abstract_id is None:
        return None

    num_id = None
    for num in numbering.findall(qn("w:num")):
        ref = num.find(qn("w:abstractNumId"))
        if ref is not None and ref.get(qn("w:val")) == abstract_id:
            num_id = num.get(qn("w:numId"))
            break
    if num_id is None:
        return None

    numPr = OxmlElement("w:numPr")
    numPr.append(_el("w:ilvl", val=0))
    numPr.append(_el("w:numId", val=num_id))
    return numPr


def apply_numpr(paragraph, numPr) -> None:
    import copy

    if numPr is None:
        return
    paragraph._p.get_or_add_pPr().append(copy.deepcopy(numPr))


def replace_in_part(part, mapping: dict[str, str]) -> None:
    """Replace {{TOKEN}} placeholders anywhere in a header/footer part.

    Works on the text nodes themselves rather than on runs, so paragraphs inside
    tables are reached, and runs carrying images or page-number fields are left
    untouched.
    """
    for t in part._element.iter(qn("w:t")):
        if not t.text or "{{" not in t.text:
            continue
        text = t.text
        for k, v in mapping.items():
            text = text.replace("{{" + k + "}}", v)
        t.text = text


def set_style(paragraph, style_id: str) -> None:
    """Apply a style by its ID rather than its display name.

    The template defines 'Heading 1' alongside Word's own latent style of the
    same name, so name lookup is ambiguous; IDs are not.
    """
    pPr = paragraph._p.get_or_add_pPr()
    for old in pPr.findall(qn("w:pStyle")):
        pPr.remove(old)
    pStyle = OxmlElement("w:pStyle")
    pStyle.set(qn("w:val"), style_id)
    pPr.insert(0, pStyle)


def row_min_height(row, twips: int) -> None:
    """Minimum row height ('at least'), so cards in a row match but can grow."""
    trPr = row._tr.get_or_add_trPr()
    h = OxmlElement("w:trHeight")
    h.set(qn("w:val"), str(twips))
    h.set(qn("w:hRule"), "atLeast")
    trPr.append(h)


def merge_across(cell, count: int) -> None:
    """Make a cell span `count` grid columns (used by a full-width card)."""
    tcPr = cell._tc.get_or_add_tcPr()
    span = OxmlElement("w:gridSpan")
    span.set(qn("w:val"), str(count))
    tcPr.append(span)


def all_borders(cell, colour: str, size: int = 4) -> None:
    """Full frame around a cell, replacing any existing border set."""
    tcPr = cell._tc.get_or_add_tcPr()
    for old in tcPr.findall(qn("w:tcBorders")):
        tcPr.remove(old)
    borders = OxmlElement("w:tcBorders")
    for side in ("top", "left", "bottom", "right"):
        borders.append(_el(f"w:{side}", val="single", sz=size, space=0, color=colour))
    tcPr.append(borders)


def clear_borders(cell) -> None:
    """Remove every border from a cell (used for the gap column)."""
    tcPr = cell._tc.get_or_add_tcPr()
    for old in tcPr.findall(qn("w:tcBorders")):
        tcPr.remove(old)
    borders = OxmlElement("w:tcBorders")
    for side in ("top", "left", "bottom", "right"):
        borders.append(_el(f"w:{side}", val="nil"))
    tcPr.append(borders)


def fixed_columns(table, widths: list[int]) -> None:
    """Pin a table to exact column widths.

    python-docx honours cell widths only when the table layout is fixed and the
    grid matches, so both are written here; otherwise Word redistributes the
    columns evenly and the card/gap proportions collapse.
    """
    tbl = table._tbl
    tblPr = tbl.tblPr

    for old in tblPr.findall(qn("w:tblLayout")):
        tblPr.remove(old)
    tblPr.append(_el("w:tblLayout", type="fixed"))

    for old in tblPr.findall(qn("w:tblW")):
        tblPr.remove(old)
    tblPr.append(_el("w:tblW", w=sum(widths), type="dxa"))

    for old in tbl.findall(qn("w:tblGrid")):
        tbl.remove(old)
    grid = OxmlElement("w:tblGrid")
    for w in widths:
        grid.append(_el("w:gridCol", w=w))
    tbl.insert(1, grid)

    for row in table.rows:
        for cell, w in zip(row.cells, widths):
            tcPr = cell._tc.get_or_add_tcPr()
            for old in tcPr.findall(qn("w:tcW")):
                tcPr.remove(old)
            tcPr.append(_el("w:tcW", w=w, type="dxa"))
