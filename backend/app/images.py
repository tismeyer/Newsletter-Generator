"""Pictures attached to chapters and cards.

The browser sends each picture as a data URL (already scaled down to a sensible
size), so no upload library or storage is needed: the picture travels inside
the draft and the request like the text does.
"""
from __future__ import annotations

import base64
import binascii
import io
import re

from PIL import Image, ImageOps

MAX_BYTES = 6 * 1024 * 1024
DATA_URL_RE = re.compile(r"^data:image/(png|jpe?g|gif|webp);base64,(.+)$", re.S)


def decode(data_url: str) -> bytes:
    """The picture's bytes, or ValueError when it is not a usable picture."""
    m = DATA_URL_RE.match(data_url.strip())
    if not m:
        raise ValueError("pictures must be PNG, JPEG, GIF or WebP")
    try:
        data = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError) as e:
        raise ValueError("the picture did not arrive intact") from e
    if len(data) > MAX_BYTES:
        raise ValueError("a picture may be at most 6 MB")
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
    except Exception as e:  # noqa: BLE001 - any decoder error means unusable
        raise ValueError("the picture could not be read") from e
    return data


def check(v: str) -> str:
    """Field validator: empty means no picture."""
    if v.strip():
        decode(v)
    return v


def _open(data_url: str) -> Image.Image:
    im = Image.open(io.BytesIO(decode(data_url)))
    im = ImageOps.exif_transpose(im)
    if im.mode not in ("RGB", "L"):
        # Flatten transparency onto white, as the page behind it is white.
        bg = Image.new("RGB", im.size, "white")
        rgba = im.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        im = bg
    return im


def _save(im: Image.Image) -> io.BytesIO:
    out = io.BytesIO()
    im.convert("RGB").save(out, "JPEG", quality=88)
    out.seek(0)
    return out


def as_stream(data_url: str) -> tuple[io.BytesIO, float]:
    """The whole picture for Word, and its height-to-width ratio."""
    im = _open(data_url)
    return _save(im), im.height / im.width


def ratio(data_url: str) -> float:
    """Height-to-width ratio as the picture will print; 0 for no picture."""
    if not data_url.strip():
        return 0.0
    im = _open(data_url)
    return im.height / im.width
