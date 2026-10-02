"""
pages.py
How much of a WebManuals page a draft fills, and where it has to be split.

WebManuals does not break pages by itself: a page that is too long simply runs
past the printable area and the rest is not printed. A full page holds about
3000 characters of plain running text (measured by the S&P team on a
text-only page, 2 October 2026). Headings, bullets with their blank lines and
Note/Caution/Warning tables take more room than their characters suggest, so
everything is counted in text lines at full page width:

    3000 characters in ordinary paragraphs  ≈ 44 lines + paragraph spacing
                                            = PAGE_LINES

The figures are estimates, deliberately on the safe side. Calibrate them
here if pages come out too full or too empty in WebManuals.
"""

from html import escape
from html.parser import HTMLParser
import math

PAGE_CHARS = 3000      # plain text that fills one WebManuals page
CPL = 68               # characters per line at full page width
PAGE_LINES = 48.0      # PAGE_CHARS of paragraphs, with their spacing
PARA_GAP = 0.55        # space after a paragraph, in lines
LIST_CPL = 65          # bullets are indented
SUB_CPL = 58           # sub-bullets more so
NOTE_CPL = 62          # Note text column (656 of 718 px)
CAUTION_CPL = 57       # Caution/Warning text column (606-616 of 718 px)
HEADING_LINES = {"h1": 2.2, "h2": 2.0, "h3": 1.7, "h4": 1.6, "h5": 1.6, "h6": 1.6}
HEADING_CPL = {"h1": 40, "h2": 45, "h3": 52, "h4": 58, "h5": 60, "h6": 60}

VOID = {"br", "img", "hr", "meta", "link", "input", "col", "wbr"}
BLOCK_HEADINGS = set(HEADING_LINES)


# ── a small tree, enough to measure and re-serialise the draft ───────────────

class Node:
    def __init__(self, tag, attrs=None, parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, attrs or [], parent, []


class _Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def parse(html: str) -> Node:
    b = _Builder()
    b.feed(html or "")
    b.close()
    return b.root


def to_html(node) -> str:
    if isinstance(node, str):
        return escape(node, quote=False).replace("\xa0", "&nbsp;")
    if node.tag == "#root":
        return "".join(to_html(c) for c in node.children)
    attrs = "".join(
        f' {k}' if v is None else f' {k}="{escape(v)}"' for k, v in node.attrs
    )
    if node.tag in VOID:
        return f"<{node.tag}{attrs} />"
    return f"<{node.tag}{attrs}>" + "".join(to_html(c) for c in node.children) + f"</{node.tag}>"


def text_of(node) -> str:
    if isinstance(node, str):
        return node
    if node.tag == "br":
        return "\n"
    return "".join(text_of(c) for c in node.children)


def _visible(s: str) -> str:
    return " ".join(s.replace("\xa0", " ").split())


# ── measuring ────────────────────────────────────────────────────────────────

def _lines(text: str, cpl: int) -> float:
    """Lines a run of text takes, honouring its own line breaks."""
    segs = text.replace("\xa0", " ").split("\n")
    total = 0
    for s in segs:
        s = " ".join(s.split())
        total += max(1, math.ceil(len(s) / cpl)) if s else 1
    # a trailing break plus blank is one empty line, not two
    return float(total)


def _list_lines(ul: Node, cpl: int) -> float:
    total = 0.0
    for li in ul.children:
        if isinstance(li, str) or li.tag != "li":
            continue
        own, subs = [], []
        for c in li.children:
            (subs if not isinstance(c, str) and c.tag in ("ul", "ol") else own).append(c)
        own_text = "".join(text_of(c) for c in own).rstrip(" \t\r")
        total += _lines(own_text, cpl) if own_text.strip("\n ") or own_text.count("\n") else 1
        for s in subs:
            total += _list_lines(s, SUB_CPL)
    return total


def _table_lines(t: Node) -> float:
    txt = _visible(text_of(t))
    label = txt.split(":", 1)[0].strip().lower() if ":" in txt[:12] else ""
    body = txt.split(":", 1)[1] if label else txt
    cpl = NOTE_CPL if label == "note" else CAUTION_CPL
    return max(1, math.ceil(len(body.strip()) / cpl)) + 0.6


def block_lines(n) -> float:
    """Height of one top-level element, in full-width text lines."""
    if isinstance(n, str):
        return 0.0 if not n.strip() else _lines(n, CPL) + PARA_GAP
    if n.tag in BLOCK_HEADINGS:
        t = _visible(text_of(n))
        extra = max(0, math.ceil(len(t) / HEADING_CPL[n.tag]) - 1) * 1.3
        return HEADING_LINES[n.tag] + extra
    if n.tag in ("ul", "ol"):
        return _list_lines(n, LIST_CPL) + PARA_GAP
    if n.tag == "table":
        return _table_lines(n)
    if n.tag == "br":
        return 1.0
    t = text_of(n)
    if not _visible(t):
        return 1.0  # an empty paragraph is a blank line
    return _lines(t.strip("\n"), CPL) + PARA_GAP


def visible_chars(html: str) -> int:
    return len(_visible(text_of(parse(html))))


# ── splitting into pages ─────────────────────────────────────────────────────

def _is_blank(n) -> bool:
    return isinstance(n, str) and not n.strip() or (
        not isinstance(n, str) and n.tag in ("p", "br") and not _visible(text_of(n))
    )


def _split_list(ul: Node, room: float):
    """Bullets that still fit in `room` lines, and the rest as a new list."""
    items = [c for c in ul.children if not isinstance(c, str) and c.tag == "li"]
    head = Node(ul.tag, ul.attrs)
    used = 0.0
    k = 0
    for li in items:
        probe = Node(ul.tag, ul.attrs)
        probe.children = [li]
        h = _list_lines(probe, LIST_CPL)
        if used + h > room:
            break
        used += h
        k += 1
    if k == 0 or k == len(items):
        return None
    head.children = items[:k]
    tail = Node(ul.tag, ul.attrs)
    tail.children = items[k:]
    return head, tail


def paginate(html: str) -> list:
    """Split the draft where WebManuals pages end.

    Returns [{"html": str, "fill": float, "chars": int}], one entry per page;
    fill is the share of the page used (1.0 = full). Pages break between
    blocks, between bullets if a list is too long, and never right after a
    heading."""
    blocks = [c for c in parse(html).children if not (isinstance(c, str) and not c.strip())]
    pages, cur, used = [], [], 0.0

    def close():
        nonlocal cur, used
        while cur and _is_blank(cur[-1]):
            cur.pop()
        if cur:
            body = "".join(to_html(b) for b in cur)
            pages.append({"html": body, "fill": round(used / PAGE_LINES, 2),
                          "chars": visible_chars(body)})
        cur, used = [], 0.0

    i = 0
    while i < len(blocks):
        b = blocks[i]
        if not cur and _is_blank(b):
            i += 1
            continue
        h = block_lines(b)
        if used + h <= PAGE_LINES:
            # keep a heading together with what follows it
            if not isinstance(b, str) and b.tag in BLOCK_HEADINGS and i + 1 < len(blocks):
                nxt = blocks[i + 1]
                first = block_lines(nxt)
                if not isinstance(nxt, str) and nxt.tag in ("ul", "ol"):
                    first = min(first, 3.0)  # the first bullets are enough
                if used + h + min(first, 3.0) > PAGE_LINES and cur:
                    close()
                    continue
            cur.append(b)
            used += h
            i += 1
            continue
        if not isinstance(b, str) and b.tag in ("ul", "ol"):
            parts = _split_list(b, PAGE_LINES - used)
            if parts:
                cur.append(parts[0])
                used += block_lines(parts[0])
                blocks[i] = parts[1]
                close()
                continue
        if cur:
            close()
            continue
        # a single block taller than a page: give it a page of its own
        cur.append(b)
        used += h
        i += 1
        close()
    close()
    return pages or [{"html": "", "fill": 0.0, "chars": 0}]
