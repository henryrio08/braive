# Bundled CC0 low-poly library

The shared allowlist contains **355 GLBs**: all 349 supplied originals, two retained Quaternius adults, and four [Kenney Mini Characters](https://kenney.nl/assets/mini-characters) approved for new scenes. All are CC0. `assets/lowpoly_cc0/LICENSE_INDEX.csv` is the license authority; provenance records source URLs and generation eligibility. The importer rejects missing/duplicate rows, non-CC0 licenses, unsafe paths, malformed GLBs and unapproved dependencies. Source/runtime GLBs are byte-identical. The Kenney palette is a validated, hash-recorded local PNG dependency; remote, traversal and missing dependencies are rejected. No meshes, weights or skeletons are regenerated.

## Rebuild and check

The pack is extracted under `assets/lowpoly_cc0/`, preserving category/subcategory directories. Both the source and bundle copies are committed (each copy is approximately 10.5 MB; Git deduplicates their identical contents). No Git LFS installation or private download is required after cloning.

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

New generation selects `character.base.soft_adult_01` through `soft_adult_04`: deliberately soft, stylized Kenney people with unchanged source skin, hair and wardrobe palettes. Henry approved actual native-renderer previews. They normalize to approximately 1.65m standing height. `generation_enabled` excludes the original mannequin and the rejected casual adults from new coordinator output; those files remain available for historical records. Crowd proxies are not characters.

The source palette PNG is bundled beside the GLBs. The app preserves textured materials instead of replacing the complete character with a solid color. Older clothing-tint bindings remain narrow and never affect skin/hair/eyes. The importer copies all bundled author license notices and records dependency hashes. The original models and archive licensing are preserved.

Only appropriate idle, walk, sprint/run, gesture and sitting clips are registered. Other source clips are retained in the original GLB but never exposed as tools. Players and rigs remain independent. Sitting persists through listening/speaking; movement releases the posture. Furniture must fit the actual supported pose. The original mannequin retains app-owned motions for old records. No lip sync or full-body tracking is supplied.

The phone enforces 1,000 resolved nodes, 180,000 primitives and 24MB of geometry data. Texture, resident-memory and draw-call targets require physical profiling. The native 355-asset audit passes; a passing asset audit does not prove generated scene composition or comfort.

## Authoring capabilities and gaps

Spark and Wonder receive named assets derived from the same manifest used for validation. Characters must use a registered rigged base with coordinator clothing color. Prefer the clothed adults for everyday people. Props use registered GLBs or coherent procedural assemblies bound to approved plan props. Box/plane/sphere/cylinder can form environment and approved task assemblies. Unknown IDs fail validation. SceneSpec's `geometry.kind: asset` and `asset_id` shape is unchanged. Previous procedural IDs were removed; development fixtures now select real manifest IDs.

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
