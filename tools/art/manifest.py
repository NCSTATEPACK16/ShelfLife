"""Reading `content/asset-manifest.json` and enumerating its frames.

The frame-key format defined here is a **contract with the TypeScript side**
(`src/view/asset-manifest.ts`). Both implementations enumerate the same manifest and must
produce byte-identical key lists; `tools/validate/assets.mjs` checks that they do. If you
change the format, change it in both places and update the test.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO_ROOT / "content" / "asset-manifest.json"

VALID_ROUTES = {"procedural", "text", "blender", "generated"}
VALID_LAYERS = {"floor", "fixture", "agent", "overlay", "ui"}


@dataclass(frozen=True)
class Asset:
    id: str
    route: str
    atlas: str
    size: tuple[int, int]
    anchor: tuple[float, float]
    layer: str
    states: tuple[str, ...] = ()
    rotations: int = 1
    frames: int = 1
    palettes: tuple[str, ...] = ()
    variants: int = 1
    footprint: tuple[int, int] | None = None

    def frame_keys(self) -> list[str]:
        """Every frame this asset expands to, in a stable, deterministic order.

        Suffix order is fixed: state, rotation, frame, palette, variant. Suffixes are
        omitted entirely when the dimension is trivial (one state, one rotation, ...), so
        a simple asset's key is just its id.
        """
        keys = [self.id]
        for suffix_values in (
            [f"__{state}" for state in self.states],
            [f"__r{i}" for i in range(self.rotations)] if self.rotations > 1 else [],
            [f"__f{i}" for i in range(self.frames)] if self.frames > 1 else [],
            [f"__p{name}" for name in self.palettes],
            [f"__v{i}" for i in range(self.variants)] if self.variants > 1 else [],
        ):
            if not suffix_values:
                continue
            keys = [key + suffix for key in keys for suffix in suffix_values]
        return keys


@dataclass(frozen=True)
class Manifest:
    tile_size: int
    palettes: dict[str, dict[str, str]]
    assets: tuple[Asset, ...] = field(default=())

    def frame_count(self) -> int:
        return sum(len(asset.frame_keys()) for asset in self.assets)


def load(path: Path = MANIFEST_PATH) -> Manifest:
    with path.open(encoding="utf-8") as handle:
        raw = json.load(handle)

    palettes = {k: v for k, v in raw.get("palettes", {}).items() if not k.startswith("$")}

    assets: list[Asset] = []
    seen: set[str] = set()
    for entry in raw["assets"]:
        asset_id = entry["id"]
        if asset_id in seen:
            raise ValueError(f"Duplicate asset id {asset_id!r} in the manifest.")
        seen.add(asset_id)

        if entry["route"] not in VALID_ROUTES:
            raise ValueError(f"{asset_id}: unknown route {entry['route']!r}.")
        if entry["layer"] not in VALID_LAYERS:
            raise ValueError(f"{asset_id}: unknown layer {entry['layer']!r}.")

        for name in entry.get("palettes", []):
            if name not in palettes:
                raise ValueError(f"{asset_id}: references undeclared palette {name!r}.")

        width, height = entry["size"]
        if width <= 0 or height <= 0:
            raise ValueError(f"{asset_id}: size must be positive, got {entry['size']}.")

        footprint = entry.get("footprint")
        assets.append(
            Asset(
                id=asset_id,
                route=entry["route"],
                atlas=entry["atlas"],
                size=(width, height),
                anchor=tuple(entry["anchor"]),
                layer=entry["layer"],
                states=tuple(entry.get("states", ())),
                rotations=int(entry.get("rotations", 1)),
                frames=int(entry.get("frames", 1)),
                palettes=tuple(entry.get("palettes", ())),
                variants=int(entry.get("variants", 1)),
                footprint=tuple(footprint) if footprint else None,
            )
        )

    return Manifest(
        tile_size=int(raw["$meta"]["tileSize"]),
        palettes=palettes,
        assets=tuple(assets),
    )


if __name__ == "__main__":
    manifest = load()
    print(f"{len(manifest.assets)} assets -> {manifest.frame_count()} frames")
    for asset in manifest.assets:
        keys = asset.frame_keys()
        preview = keys[0] if len(keys) == 1 else f"{keys[0]} ... {keys[-1]}"
        print(f"  {asset.id:<32} {len(keys):>4}  {preview}")


def parse_key(asset: Asset, key: str) -> dict[str, object]:
    """Decompose a frame key back into the selector that produced it.

    Generators receive a key and need to know which state / rotation / frame / palette it
    stands for. Parsing here rather than in each generator keeps the key format in one
    place -- the same reason `frame_keys` lives here.
    """
    if not key.startswith(asset.id):
        raise ValueError(f"key {key!r} does not belong to asset {asset.id!r}")

    selector: dict[str, object] = {
        "state": asset.states[0] if asset.states else None,
        "rotation": 0,
        "frame": 0,
        "palette": asset.palettes[0] if asset.palettes else None,
        "variant": 0,
    }

    for part in key[len(asset.id):].split("__"):
        if not part:
            continue
        if part in asset.states:
            selector["state"] = part
        elif part.startswith("r") and part[1:].isdigit():
            selector["rotation"] = int(part[1:])
        elif part.startswith("f") and part[1:].isdigit():
            selector["frame"] = int(part[1:])
        elif part.startswith("v") and part[1:].isdigit():
            selector["variant"] = int(part[1:])
        elif part.startswith("p"):
            selector["palette"] = part[1:]
        else:
            raise ValueError(f"unrecognised key segment {part!r} in {key!r}")

    return selector
