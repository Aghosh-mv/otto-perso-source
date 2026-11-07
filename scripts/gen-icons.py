"""Generate PWA icons for Otto Perso — Swiss-minimal 2x2 grid with bottom-right red quadrant."""
from PIL import Image, ImageDraw

INK = (10, 10, 10, 255)         # #0A0A0A
SIGNAL = (225, 29, 46, 255)     # #E11D2E
PAPER = (255, 255, 255, 255)    # #FFFFFF
TRANSPARENT = (0, 0, 0, 0)


def render_icon(size: int, maskable: bool = False) -> Image.Image:
    """Render the Otto mark at the given size.

    Non-maskable: square icon with full-bleed white background, ink border,
    thin internal crosshair lines, bottom-right quadrant in signal red.

    Maskable: same mark but with extra safe-zone padding so OS can crop into
    circle/squircle without cutting the mark.
    """
    img = Image.new("RGBA", (size, size), PAPER if not maskable else PAPER)
    draw = ImageDraw.Draw(img)

    # For maskable, leave a 10% safe zone on each side
    inset = int(size * 0.1) if maskable else int(size * 0.05)
    box_x0 = inset
    box_y0 = inset
    box_x1 = size - inset
    box_y1 = size - inset
    box_w = box_x1 - box_x0

    # Outer border (ink, 2px scaled)
    border_w = max(2, int(size * 0.012))
    draw.rectangle(
        [box_x0, box_y0, box_x1, box_y1],
        outline=INK,
        width=border_w,
    )

    # Internal crosshair lines (subtle)
    mid_x = box_x0 + box_w // 2
    mid_y = box_y0 + box_w // 2
    line_w = max(1, int(size * 0.005))
    line_color = (10, 10, 10, 80)  # ink at ~30% opacity
    draw.line(
        [(mid_x, box_y0 + border_w), (mid_x, box_y1 - border_w)],
        fill=line_color,
        width=line_w,
    )
    draw.line(
        [(box_x0 + border_w, mid_y), (box_x1 - border_w, mid_y)],
        fill=line_color,
        width=line_w,
    )

    # Bottom-right quadrant filled with signal red
    # Account for the border + leave a small inset from the crosshair
    pad = max(1, int(size * 0.008))
    quad_x0 = mid_x + pad
    quad_y0 = mid_y + pad
    quad_x1 = box_x1 - border_w - pad
    quad_y1 = box_y1 - border_w - pad
    draw.rectangle([quad_x0, quad_y0, quad_x1, quad_y1], fill=SIGNAL)

    return img


def main():
    import os
    out_dir = "/home/z/my-project/public"
    os.makedirs(out_dir, exist_ok=True)

    sizes = [
        (192, "icon-192.png", False),
        (512, "icon-512.png", False),
        (512, "icon-maskable-512.png", True),
        (180, "icon-180.png", False),  # iOS apple-touch-icon
        (32, "favicon-32.png", False),
        (16, "favicon-16.png", False),
    ]
    for size, name, maskable in sizes:
        img = render_icon(size, maskable=maskable)
        img.save(os.path.join(out_dir, name))
        print(f"  ✓ {name} ({size}x{size}{', maskable' if maskable else ''})")

    # Also write an ICO favicon
    ico_img = render_icon(64, maskable=False)
    ico_img.save(os.path.join(out_dir, "favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("  ✓ favicon.ico (multi-size)")

    # SVG version too
    svg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#FFFFFF"/>
  <rect x="32" y="32" width="448" height="448" fill="none" stroke="#0A0A0A" stroke-width="6"/>
  <line x1="256" y1="32" x2="256" y2="480" stroke="#0A0A0A" stroke-width="2" opacity="0.3"/>
  <line x1="32" y1="256" x2="480" y2="256" stroke="#0A0A0A" stroke-width="2" opacity="0.3"/>
  <rect x="262" y="262" width="212" height="212" fill="#E11D2E"/>
</svg>
"""
    with open(os.path.join(out_dir, "icon.svg"), "w") as f:
        f.write(svg)
    print("  ✓ icon.svg")


if __name__ == "__main__":
    main()
