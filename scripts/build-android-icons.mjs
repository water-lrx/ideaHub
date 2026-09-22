/**
 * Generates the Android launcher icon set from icons/icon-512.png.
 *
 * Android needs every density pre-rendered, plus a separate "foreground" layer
 * for adaptive icons (Android 8+). The adaptive foreground is drawn into the
 * central safe zone of a transparent canvas, because the launcher masks and
 * animates that layer. The original icon already paints a light-green
 * background, so the adaptive background colour is sampled from its own corner
 * to keep the launcher tile consistent with the source artwork.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "icons/icon-512.png");
const resDir = resolve(root, "android/app/src/main/res");

// Legacy icon: 48dp at mdpi, scaling by density.
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// Adaptive foreground canvas is 108dp, of which the central 72dp is the safe zone.
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

// Python + Pillow does the raster work; keeping it in one process avoids
// depending on ImageMagick being installed.
const script = `
import sys
from PIL import Image

SRC = sys.argv[1]
RES = sys.argv[2]
LEGACY = ${JSON.stringify(LEGACY)}
FOREGROUND = ${JSON.stringify(FOREGROUND)}

src = Image.open(SRC).convert("RGBA")

# Sample the artwork's own background so the adaptive tile matches it.
bg = src.getpixel((2, 2))
bg_hex = "#%02X%02X%02X" % bg[:3]

def squared(image, box):
    """Fit the source into a square canvas without distortion."""
    canvas = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    ratio = min(box / image.width, box / image.height)
    size = (max(1, round(image.width * ratio)), max(1, round(image.height * ratio)))
    resized = image.resize(size, Image.LANCZOS)
    canvas.paste(resized, ((box - size[0]) // 2, (box - size[1]) // 2), resized)
    return canvas

for density, px in LEGACY.items():
    # Legacy icons keep the full artwork including its own background.
    squared(src, px).save(f"{RES}/mipmap-{density}/ic_launcher.png")
    # Round variant: circular mask for launchers that ask for it.
    round_icon = squared(src, px)
    mask = Image.new("L", (px, px), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, px - 1, px - 1), fill=255)
    round_icon.putalpha(mask)
    round_icon.save(f"{RES}/mipmap-{density}/ic_launcher_round.png")

for density, canvas_px in FOREGROUND.items():
    # Only the central safe zone survives masking, so inset the artwork there
    # and leave the surrounding canvas transparent.
    safe = round(canvas_px * 0.62)
    layer = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    art = squared(src, safe)
    offset = (canvas_px - safe) // 2
    layer.paste(art, (offset, offset), art)
    layer.save(f"{RES}/mipmap-{density}/ic_launcher_foreground.png")

with open(f"{RES}/values/ic_launcher_background.xml", "w", encoding="utf-8") as fh:
    fh.write(
        '<?xml version="1.0" encoding="utf-8"?>\\n'
        "<resources>\\n"
        f'    <color name="ic_launcher_background">{bg_hex}</color>\\n'
        "</resources>\\n"
    )

print("background colour:", bg_hex)
`;

mkdirSync(resDir, { recursive: true });
writeFileSync(resolve(root, "scripts/.icons.py"), script);
const out = execFileSync("python3", [resolve(root, "scripts/.icons.py"), source, resDir], { encoding: "utf8" });
process.stdout.write(out);
console.log("Android 图标已生成");
