"""Create privacy-safe storefront assets for the plugin market.

Crops the reminder column out of real UI screenshots (so no conversation text is
published) and draws a 180x180 raster icon (the market only accepts raster
icons hosted on GitHub).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"C:\Users\shibu\Documents\deepseek-harness\default-workspace")
PLUGIN = ROOT / "dsh-approval-notifier"
DEBUG = ROOT / ".dsh-debug"
OUT = PLUGIN / "assets"
OUT.mkdir(parents=True, exist_ok=True)
FONT = r"C:\Windows\Fonts\msyh.ttc"

# (source, target, crop box, card top) — crop starts exactly at the card column
crops = [
    ("test-normal-3.png", "screenshot-normal.png", (1307, 780, 1721, 1399), 185),
    ("test-compact-12.png", "screenshot-compact.png", (1307, 560, 1721, 1399), 352),
    ("escalated-compact3.png", "screenshot-levels.png", (1310, 420, 1721, 1399), 217),
]

for source, target, box, card_top in crops:
    src = DEBUG / source
    if not src.exists():
        print("missing", src)
        continue
    image = Image.open(src).convert("RGB")
    width, height = image.size
    left, top, right, bottom = box
    cropped = image.crop((min(left, width), min(top, height), min(right, width), min(bottom, height)))
    cw, ch = cropped.size
    # Privacy: mask the strip above the first card so no chat text is published.
    draw = ImageDraw.Draw(cropped)
    draw.rectangle([0, 0, cw, card_top], fill=(30, 30, 32))
    cropped.save(OUT / target, "PNG")
    print("saved", OUT / target, cropped.size, "mask top", card_top)

# 180x180 raster icon: dark rounded square + orange bell + check badge
size = 180
icon = Image.new("RGBA", (size, size), (29, 23, 18, 255))
draw = ImageDraw.Draw(icon)
draw.rounded_rectangle([0, 0, size - 1, size - 1], 42, fill=(29, 23, 18, 255))
# bell
draw.pieslice([34, 30, 146, 132], 180, 360, fill=(255, 159, 67, 255))
draw.rectangle([34, 78, 146, 104], fill=(255, 159, 67, 255))
draw.rounded_rectangle([26, 100, 154, 118], 9, fill=(255, 159, 67, 255))
draw.ellipse([74, 116, 106, 146], fill=(255, 159, 67, 255))
draw.ellipse([88, 8, 140, 60], fill=(255, 159, 67, 255), outline=(29, 23, 18, 255), width=5)
draw.line([104, 34, 112, 43], fill=(35, 26, 16, 255), width=6)
draw.line([112, 43, 128, 24], fill=(35, 26, 16, 255), width=6)
icon.save(OUT / "icon-180.png", "PNG")
print("saved", OUT / "icon-180.png")

(PLUGIN / "screenshots.json").write_text(
    '[\n  "assets/screenshot-normal.png",\n  "assets/screenshot-compact.png",\n  "assets/screenshot-levels.png"\n]\n',
    encoding="utf-8",
)
print("saved screenshots.json")
