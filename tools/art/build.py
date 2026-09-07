#!/usr/bin/env python3
"""The art build (ADR 0006). Text and parameters in, PNG frames out.

Idempotent by construction: same manifest + same sources => byte-identical PNGs. That
matters because these outputs are committed, and a pipeline that rewrites every file on
every run makes the git history useless.

Stages:
  placeholders  every declared frame, as a labelled box at the declared size
  generate      real art where a generator exists; placeholder everywhere else

Runs locally only. Netlify runs `vite build` and nothing else (ADR 0006).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import manifest as manifest_mod  # noqa: E402
import placeholder  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_ROOT = REPO_ROOT / "assets"


def _generators() -> dict[str, object]:
    """Real generators, keyed by asset id. Empty until phase S2 fills it in.

    Anything absent here falls back to a placeholder, which is the whole point: the
    renderer is written against the manifest, not against whichever sprites happen to
    exist today.
    """
    try:
        import generate  # noqa: PLC0415
    except ModuleNotFoundError:
        return {}
    return getattr(generate, "GENERATORS", {})


def build(stage: str) -> int:
    man = manifest_mod.load()
    generators = {} if stage == "placeholders" else _generators()

    out_dir = OUT_ROOT / ("placeholder" if stage == "placeholders" else "src")
    out_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    real = 0
    index: list[dict] = []
    for asset in man.assets:
        generator = generators.get(asset.id)
        for key in asset.frame_keys():
            target = out_dir / f"{key}.png"
            if generator is not None:
                image = generator(asset, key, man)
                real += 1
            else:
                image = placeholder.render(asset.id, *asset.size, asset.layer)
            width, height = image.size
            if (width, height) != asset.size:
                raise ValueError(
                    f"{key}: generator produced {width}x{height}, "
                    f"manifest declares {asset.size[0]}x{asset.size[1]}"
                )
            image.save(target, "PNG", optimize=True)
            written += 1
            index.append(
                {
                    "key": key,
                    "asset": asset.id,
                    "atlas": asset.atlas,
                    "layer": asset.layer,
                    "size": list(asset.size),
                    "anchor": list(asset.anchor),
                    "real": generator is not None,
                }
            )

    # The index is the contract every downstream step reads: the packer groups by `atlas`,
    # the validator checks it against the filesystem and the packed JSON, and the renderer
    # gets anchors from it. Enumeration lives here and only here (ADR 0006).
    index_path = out_dir / "index.json"
    index_path.write_text(
        json.dumps(
            {"tileSize": man.tile_size, "frames": sorted(index, key=lambda f: f["key"])},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    label = "placeholder" if stage == "placeholders" else "art"
    print(
        f"{label}: {written} frames from {len(man.assets)} assets "
        f"({real} real, {written - real} placeholder) -> {out_dir.relative_to(REPO_ROOT)}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", choices=("placeholders", "generate"), default="generate")
    args = parser.parse_args()
    return build(args.stage)


if __name__ == "__main__":
    raise SystemExit(main())
