"""Reference outputs of the export filter pipeline, for the preview parity test.

Usage: python scripts/filter_reference.py <photo> <cases.json> <max_side>
Prints JSON: {"width", "height", "input": base64 RGBA, "cases": [{"name", "output": base64 RGB}]}

Each case is {"name", "filter" (sparse; omitted fields are identity), "frame"}.
Built-ins can be referenced as {"builtin": "<slug>"} and are read from
frontend/src/filters/builtins.json, the same file the app uses.
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.services.filters import FilterDefinition, apply_filter_array  # noqa: E402

IDENTITY = {
    "version": 1, "brightness": 1, "contrast": 1, "saturation": 1, "grayscale": 0, "warmth": 0, "hue": 0, "fade": 0,
    "tint": {"color": "#ffffff", "blend": "soft-light", "strength": 0},
    "vignette": {"strength": 0, "size": 0.5},
    "grain": {"amount": 0, "size": 0.5},
}


def full(sparse: dict) -> FilterDefinition:
    data = {**IDENTITY, **{k: v for k, v in sparse.items() if k not in ("tint", "vignette", "grain")}}
    for group in ("tint", "vignette", "grain"):
        data[group] = {**IDENTITY[group], **sparse.get(group, {})}
    return FilterDefinition.model_validate(data)


def main() -> None:
    photo_path, cases_path, max_side = sys.argv[1], sys.argv[2], int(sys.argv[3])
    builtins = {b["slug"]: b["filter"] for b in json.loads((ROOT / "frontend/src/filters/builtins.json").read_text())}
    with Image.open(photo_path) as source:
        photo = source.convert("RGB")
        photo.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    rgb = np.asarray(photo)
    rgba = np.concatenate([rgb, np.full(rgb.shape[:2] + (1,), 255, np.uint8)], axis=2)
    cases = []
    for case in json.loads(Path(cases_path).read_text()):
        definition = full(builtins[case["builtin"]] if "builtin" in case else case.get("filter", {}))
        out = apply_filter_array(rgb, definition, case.get("frame", 0))
        cases.append({"name": case["name"], "definition": definition.model_dump(),
                      "frame": case.get("frame", 0), "output": base64.b64encode(out.tobytes()).decode()})
    json.dump({"width": rgb.shape[1], "height": rgb.shape[0],
               "input": base64.b64encode(rgba.tobytes()).decode(), "cases": cases}, sys.stdout)


if __name__ == "__main__":
    main()
