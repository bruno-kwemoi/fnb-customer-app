#!/usr/bin/env python3
"""Generates assets/staff-rich-menu.png — the staff/admin Rich Menu.

Deliberately visually distinct from the customer menu (dark
neutral vs. the customer menu's warm brown/orange/green) so there's
no chance of confusing which one you're looking at. This is NOT the
account's default rich menu — it's linked per-person to registered
staff via scripts/add-staff.mjs, so a customer opening the same OA
never sees it.

Requires: Pillow + Noto Sans CJK fonts — see
generate-rich-menu-image.py for details, same requirements.

Usage: python3 scripts/generate-staff-rich-menu-image.py
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 843
BG = (38, 40, 45)  # dark slate — visually distinct from the customer menu
TEXT_COLOR = (235, 236, 240)
TITLE = "スタッフ注文管理"
SUBTITLE = "タップして注文状況を開く"

FONT_BOLD_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
JP_INDEX = 0

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "staff-rich-menu.png")


def main():
    title_font = ImageFont.truetype(FONT_BOLD_PATH, 88, index=JP_INDEX)
    subtitle_font = ImageFont.truetype(FONT_REG_PATH, 38, index=JP_INDEX)

    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    title_bbox = draw.textbbox((0, 0), TITLE, font=title_font)
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]
    subtitle_bbox = draw.textbbox((0, 0), SUBTITLE, font=subtitle_font)
    subtitle_w = subtitle_bbox[2] - subtitle_bbox[0]

    gap = 32
    block_h = title_h + gap + (subtitle_bbox[3] - subtitle_bbox[1])
    top = H / 2 - block_h / 2 - 10

    draw.text((W / 2 - title_w / 2, top - title_bbox[1]), TITLE, font=title_font, fill=TEXT_COLOR)
    draw.text(
        (W / 2 - subtitle_w / 2, top + title_h + gap - subtitle_bbox[1]),
        SUBTITLE,
        font=subtitle_font,
        fill=TEXT_COLOR,
    )

    img.save(OUTPUT_PATH)
    print(f"saved {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
