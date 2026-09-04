"""Remove baked-in placeholder text from certificate-template.png."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_TEMPLATE = ROOT / "public" / "certificate-template.png"
ASSETS_TEMPLATE = ROOT / "src" / "assets" / "certificate-template.png"
ORIGINAL_TEMPLATE = ROOT / "public" / "certificate-template.original.png"


def inpaint_rectangle(arr: np.ndarray, y1: int, y2: int, x1: int, x2: int, sample_y: int) -> None:
    h = arr.shape[0]
    sample_y = max(0, min(h - 1, sample_y))
    for y in range(y1, y2):
        arr[y, x1:x2] = arr[sample_y, x1:x2]


def load_source_image() -> Image.Image:
    if ORIGINAL_TEMPLATE.exists():
        return Image.open(ORIGINAL_TEMPLATE).convert("RGB")

    repo_root = ROOT.parent
    result = subprocess.run(
        ["git", "show", "HEAD:registration/public/certificate-template.png"],
        cwd=repo_root,
        capture_output=True,
        check=False,
    )
    if result.returncode == 0 and result.stdout[:4] == b"\x89PNG":
        ORIGINAL_TEMPLATE.write_bytes(result.stdout)
        return Image.open(ORIGINAL_TEMPLATE).convert("RGB")

    if PUBLIC_TEMPLATE.exists():
        return Image.open(PUBLIC_TEMPLATE).convert("RGB")

    raise FileNotFoundError("Could not locate certificate-template.png source image.")


def clean_template(arr: np.ndarray) -> None:
    h, w = arr.shape[:2]

    # Remove {{FULL NAME}} including {{ }} brackets and bottom decorative line in that band.
    inpaint_rectangle(
        arr,
        int(h * 0.396),
        int(h * 0.414),
        int(w * 0.10),
        int(w * 0.90),
        int(h * 0.3847),
    )

    # Remove URN: {{Registration Code}} placeholder.
    inpaint_rectangle(
        arr,
        int(h * 0.942),
        int(h * 0.966),
        int(w * 0.735),
        int(w * 0.928),
        int(h * 0.930),
    )


def main() -> None:
    img = load_source_image()
    arr = np.array(img)
    clean_template(arr)
    cleaned = Image.fromarray(arr)

    PUBLIC_TEMPLATE.parent.mkdir(parents=True, exist_ok=True)
    ASSETS_TEMPLATE.parent.mkdir(parents=True, exist_ok=True)
    cleaned.save(PUBLIC_TEMPLATE)
    cleaned.save(ASSETS_TEMPLATE)

    region = arr[int(arr.shape[0] * 0.396) : int(arr.shape[0] * 0.414), int(arr.shape[1] * 0.10) : int(arr.shape[1] * 0.90)]
    dark = int(np.sum(np.all(region < 100, axis=2)))
    print(f"Cleaned templates. Remaining dark pixels in name band: {dark}")
    if dark > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
