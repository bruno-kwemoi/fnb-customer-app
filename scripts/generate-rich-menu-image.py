#!/usr/bin/env python3
"""Generates assets/rich-menu.png — the 3-panel customer Rich Menu image.

Run this whenever you change the panel copy, colors, or add/remove a
panel; then run `npm run setup-rich-menu` to push the new image (and
matching tap areas, which you edit separately in
scripts/setup-rich-menu.mjs) to LINE.

Requires: Pillow (`pip install pillow`) and the Noto Sans CJK font
family available on the system (both regular and bold weights). On
Debian/Ubuntu: `apt install fonts-noto-cjk`. If your fonts live
elsewhere, update FONT_BOLD_PATH / FONT_REG_PATH below.

Usage: python3 scripts/generate-rich-menu-image.py
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 843
COLS = [
    {"x0": 0,    "x1": 833,  "bg": (92, 58, 33),   "title": "ご注文はこちら", "subtitle": "メニューを見る"},
    {"x0": 833,  "x1": 1667, "bg": (178, 94, 40),  "title": "注文状況を確認", "subtitle": "今の状況をチェック"},
    {"x0": 1667, "x1": 2500, "bg": (107, 143, 71), "title": "ポイント確認",   "subtitle": "現在のポイントを見る"},
]
TEXT_COLOR = (245, 232, 210)
FONT_BOLD_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
JP_INDEX = 0  # "Noto Sans CJK JP" is index 0 in both collections

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "rich-menu.png")


def main():
    title_font = ImageFont.truetype(FONT_BOLD_PATH, 72, index=JP_INDEX)
    subtitle_font = ImageFont.truetype(FONT_REG_PATH, 34, index=JP_INDEX)

    img = Image.new("RGB", (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    for col in COLS:
        cx0, cx1 = col["x0"], col["x1"]
        cw = cx1 - cx0
        draw.rectangle([cx0, 0, cx1, H], fill=col["bg"])

        center_x = cx0 + cw / 2
        # Vertically center the title+subtitle block as a group.
        title_bbox = draw.textbbox((0, 0), col["title"], font=title_font)
        title_w = title_bbox[2] - title_bbox[0]
        title_h = title_bbox[3] - title_bbox[1]
        subtitle_bbox = draw.textbbox((0, 0), col["subtitle"], font=subtitle_font)
        subtitle_w = subtitle_bbox[2] - subtitle_bbox[0]

        gap = 28
        block_h = title_h + gap + (subtitle_bbox[3] - subtitle_bbox[1])
        top = H / 2 - block_h / 2 - 10

        draw.text((center_x - title_w / 2, top - title_bbox[1]), col["title"], font=title_font, fill=TEXT_COLOR)
        draw.text(
            (center_x - subtitle_w / 2, top + title_h + gap - subtitle_bbox[1]),
            col["subtitle"],
            font=subtitle_font,
            fill=TEXT_COLOR,
        )

    # Thin white separators between panels.
    for col in COLS[1:]:
        draw.line([(col["x0"], 0), (col["x0"], H)], fill=(255, 255, 255), width=2)

    img.save(OUTPUT_PATH)
    print(f"saved {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

