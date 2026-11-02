# Bundled CC0 low-poly library

The shared allowlist contains **349 original GLBs** from the supplied pack. `assets/lowpoly_cc0/LICENSE_INDEX.csv` is the license authority. The importer rejects missing/duplicate rows, non-`CC0-1.0` licenses, unsafe paths, mismatched filename IDs, nonpositive scales, malformed/truncated GLBs, and external dependencies. It never downloads, regenerates, converts, remeshes, or substitutes models. Source and runtime GLBs have identical SHA-256 hashes.

## Rebuild and check

The pack is extracted under `assets/lowpoly_cc0/`, preserving category/subcategory directories. Both the source and bundle copies are committed (each copy is approximately 8.5 MB; Git deduplicates their identical contents). No Git LFS installation or private download is required after cloning.

```sh
python3 scripts/import-lowpoly-pack.py --dry-run
python3 scripts/import-lowpoly-pack.py
python3 scripts/generate-project.py
python3 -m unittest discover -s scripts/tests
npm --prefix backend run check
npm --prefix backend test
```

To re-extract the original archive, copy the contents of its `assets/` directory into `assets/lowpoly_cc0/` before running the importer. `--source /other/extracted/assets` accepts an alternate input root. Dry-run performs validation and prints counts/gaps without writing output.

The importer writes byte-identical manifests to:

- `assets/lowpoly_cc0/asset_manifest.json` (source inventory)
- `ios/Braive/Resources/asset_manifest.json` (runtime)
- `backend/assets/asset_manifest.json` (backend)

Each ID is the GLB filename stem: `category.subcategory.variant`. Records include path, tags, source/license metadata, scale, up-axis, rig/clip information, hashes, and normalization fixes. Xcode copies `Resources/LowPoly` as a folder resource, retaining the tree; runtime paths such as `LowPoly/furniture/chair/furniture.chair.classic_chair_01.glb` resolve inside the app bundle.

## Loading and normalization

GLTFKit2 **0.5.15**, pinned through Swift Package Manager, bridges the GLB directly into SceneKit while preserving meshes, embedded materials/textures, nodes, skins, and available clips. SceneKit/ModelIO alone do not supply the GLB bridge used here. The loader is MIT-licensed software; its notice is bundled separately. All model files remain CC0.

Assets are cached as normalized templates. Instances share immutable vertex data but have independent geometry/material objects and rebound skin joints, so recoloring or animating one figure cannot affect another. Scale is the CSV's meters-per-source-unit multiplier. Root transforms apply the manifest's up-axis correction, a +Z-to−Z forward convention, then center XZ and place minimum Y at zero. No bone or mesh vertices are independently repositioned.

**Orientation limitation:** the pack explicitly does not certify author-facing directions. The manifest records `source_forward_assumption: +Z` and `semantic_front_verified: false`; the −Z application convention is applied uniformly, rather than claiming every prop's semantic front was individually certified. Tune per-asset rotation metadata after visual inspection where an author's front differs. The neutral base and representative props should be reviewed from both sides when fitting real scenes. Scales are source suggestions, not certified physical dimensions.

## Characters and color

All app characters use `character.base.neutral_humanoid_01`. Other `character.crowd_proxy` meshes remain importable inventory objects but are rejected as character nodes. The coordinator chooses optional `Character.color_hex`; Wonder copies it into the existing character node's `Material.color`. The backend checks that match, and iOS applies a single solid diffuse UIColor to the neutral figure. If neither field supplies a valid hex, iOS chooses a random solid color. No wardrobe textures are generated or required. Other GLBs retain their source materials and textures.

The neutral asset has a skeleton and **no authored animation clips**, in its original T pose. `idle`, `listen`, `speak`, and `gesture` prefer a matching supplied clip; for this known base they use small app-owned chest/head/elbow joint motions around the original pose. They do not fabricate GLB clips, replace the skeleton, alter vertex/weight data, or claim a seated or lip-synced animation. An absent/unrecognized rig binding safely no-ops. Dialogue and TTS remain app services. Future authored, appropriately licensed clips can bind to the preserved rig.

## Authoring capabilities and gaps

Spark and Wonder receive named assets derived from the same manifest used for validation. Characters must use the neutral base with coordinator color; props must use registered GLBs. Box/plane/sphere/cylinder remain architecture fill only. Unknown IDs fail validation. SceneSpec's `geometry.kind: asset` and `asset_id` shape is unchanged. Previous procedural IDs were removed; development fixtures now select real manifest IDs.

Intentionally empty, with no invented replacement assets:

- `furniture.podium`
- `interior_prop.whiteboard`
- `confined.elevator_car`
- `confined.elevator_panel`
- `confined.vent`

Gaps do not remove speaking, interviewing, navigation, or confined-space product behavior. Models must use available assets and architecture honestly, without relabeling a generic object as a missing mesh.

## Offline runtime audit

Build for iPhone 17 Simulator, then launch with `--asset-audit`. It loads **every** manifest ID, checks that the neutral base retains a skin, checks cloned figures have distinct bones, and exercises all four behavior calls. A small selection is displayed after the full import audit. Failures appear explicitly in the app; no network or provider request is made. `--preflight-audit` uses a local fixture built from the library to exercise offscreen visibility checks. Real-device performance and semantic front-facing review remain separate from import validity.

`BRAIVE_ALLOW_META` remains false. This change adds no live provider tests or Meta network calls.
