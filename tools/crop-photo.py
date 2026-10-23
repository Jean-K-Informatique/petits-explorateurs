#!/usr/bin/env python3
"""Crop a downloaded photo for the game.

Animal (square, shown in bubbles, cards and puzzles):
  python3 tools/crop-photo.py animal SRC OUT --cx 0.5 --cy 0.45 --side 0.8
Theme background (16:9):
  python3 tools/crop-photo.py background SRC OUT --cy 0.5

--cx/--cy: centre of the crop as a fraction of the source width/height.
--side: side of the square as a fraction of the source's shorter dimension.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageOps

SIZES = {"animal": (768, 768), "background": (1600, 900)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=SIZES)
    parser.add_argument("src", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--cx", type=float, default=0.5)
    parser.add_argument("--cy", type=float, default=0.5)
    parser.add_argument("--side", type=float, default=1.0)
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()

    image = ImageOps.exif_transpose(Image.open(args.src)).convert("RGB")
    width, height = image.size
    target_w, target_h = SIZES[args.kind]
    ratio = target_w / target_h
    # Largest crop of the requested ratio, scaled by --side, kept inside the image.
    crop_h = min(height, width / ratio) * max(0.05, min(1.0, args.side))
    crop_w = crop_h * ratio
    left = min(max(args.cx * width - crop_w / 2, 0), width - crop_w)
    top = min(max(args.cy * height - crop_h / 2, 0), height - crop_h)
    crop = image.crop((round(left), round(top), round(left + crop_w), round(top + crop_h)))
    if crop.width < target_w * 0.6:
        print(f"warning: crop is only {crop.width}px wide, the result will look soft")
    crop = crop.resize((target_w, target_h), Image.LANCZOS)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    crop.save(args.out, "WEBP", quality=args.quality, method=6)
    print(f"saved {args.out} ({args.out.stat().st_size // 1024} KB) from crop {crop_w:.0f}x{crop_h:.0f} at ({left:.0f},{top:.0f})")


if __name__ == "__main__":
    main()
