#!/usr/bin/env python3
"""Generates the staff and admin Rich Menu images.

- assets/staff-rich-menu.png — 2 panels: order dashboard, switch to
  customer ordering. Linked to plain "staff"-role accounts.
- assets/admin-rich-menu.png — 3 panels: adds a reports panel. Linked
  to "admin"-role accounts.

These are two DIFFERENT LINE Rich Menus (not one menu with
role-aware content — LINE Rich Menus can't do that; a menu's image
and tap areas are fixed once linked to a person). Role-awareness
comes from linking a different menu per person in scripts/add-staff.mjs,
not from anything in the image itself.

Deliberately visually distinct from the customer menu (dark neutral
base vs. the customer menu's warm brown/orange/green), so there's no
chance of confusing which one you're looking at. The "switch to
customer" panel uses the same terracotta as the customer menu's
middle panel, as a visual hint of what it links to.

Requires: Pillow + Noto Sans CJK fonts — see
generate-rich-menu-image.py for details, same requirements.

Usage: python3 scripts/generate-staff-rich-menu-image.py
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 843
DARK = (38, 40, 45)
TERRACOTTA = (178, 94, 40)
GOLD = (168, 130, 40)
TEXT_LIGHT = (235, 236, 240)
TEXT_CREAM = (245, 232, 210)

FONT_BOLD_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
JP_INDEX = 0

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")


def draw_panel(draw, x0, x1, bg, title, subtitle, text_color, title_font, subtitle_font):
    draw.rectangle([x0, 0, x1, H], fill=bg)
    center_x = x0 + (x1 - x0) / 2

    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]
    subtitle_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    subtitle_w = subtitle_bbox[2] - subtitle_bbox[0]

    gap = 28
    block_h = title_h + gap + (subtitle_bbox[3] - subtitle_bbox[1])
    top = H / 2 - block_h / 2 - 10

    draw.text((center_x - title_w / 2, top - title_bbox[1]), title, font=title_font, fill=text_color)
    draw.text(
        (center_x - subtitle_w / 2, top + title_h + gap - subtitle_bbox[1]),
        subtitle,
        font=subtitle_font,
        fill=text_color,
    )


def build(panels, out_name):
    img = Image.new("RGB", (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    n = len(panels)
    width_each = W // n
    title_size = 64 if n == 3 else 72
    subtitle_size = 30 if n == 3 else 34
    title_font = ImageFont.truetype(FONT_BOLD_PATH, title_size, index=JP_INDEX)
    subtitle_font = ImageFont.truetype(FONT_REG_PATH, subtitle_size, index=JP_INDEX)

    for i, (bg, title, subtitle, text_color) in enumerate(panels):
        x0 = i * width_each
        x1 = W if i == n - 1 else (i + 1) * width_each
        draw_panel(draw, x0, x1, bg, title, subtitle, text_color, title_font, subtitle_font)

    for i in range(1, n):
        x = i * width_each
        draw.line([(x, 0), (x, H)], fill=(255, 255, 255), width=2)

    path = os.path.join(OUT_DIR, out_name)
    img.save(path)
    print(f"saved {path}")


ORDERS_PANEL = (DARK, "注文管理", "タップして開く", TEXT_LIGHT)
REPORTS_PANEL = (GOLD, "レポート", "売上・活動を見る", TEXT_LIGHT)
CUSTOMER_PANEL = (TERRACOTTA, "お客様として注文する", "ご注文はこちら", TEXT_CREAM)

build([ORDERS_PANEL, CUSTOMER_PANEL], "staff-rich-menu.png")
build([ORDERS_PANEL, REPORTS_PANEL, CUSTOMER_PANEL], "admin-rich-menu.png")
