"""Generate TWmeme extension icons (16/48/128 PNG).

Visual: coral square (rounded) with white :m glyph centered. Matches
web/DESIGN.md primary color #FF5B4B.

Run once: `python extension/icons/_generate.py`. Output is committed.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).parent
CORAL = (255, 91, 75, 255)
WHITE = (255, 255, 255, 255)
CREAM = (252, 250, 246, 255)


def find_font(size):
    candidates = [
        "C:/Windows/Fonts/seguibl.ttf",     # Segoe UI Black (Windows)
        "C:/Windows/Fonts/seguisb.ttf",     # Segoe UI Semibold
        "C:/Windows/Fonts/arialbd.ttf",     # Arial Bold
        "/System/Library/Fonts/SFNS.ttf",   # macOS SF
    ]
    for f in candidates:
        if Path(f).exists():
            try:
                return ImageFont.truetype(f, size)
            except OSError:
                pass
    return ImageFont.load_default()


def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded coral square (radius scales with size)
    radius = max(2, size // 6)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=CORAL)

    # ":m" glyph centered. Font size ~60% of icon.
    glyph = ":m"
    font_size = int(size * 0.58)
    font = find_font(font_size)
    bbox = draw.textbbox((0, 0), glyph, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    # Optical centering: bbox includes ascender padding, nudge up slightly.
    tx = (size - tw) // 2 - bbox[0]
    ty = (size - th) // 2 - bbox[1] - max(1, size // 24)
    draw.text((tx, ty), glyph, font=font, fill=CREAM)

    return img


for s in (16, 48, 128):
    img = make_icon(s)
    img.save(OUT_DIR / f"icon-{s}.png")
    print(f"wrote icon-{s}.png ({s}x{s})")
