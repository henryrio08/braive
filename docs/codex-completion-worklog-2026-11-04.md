# Completion work, November 4, 2026

User authorized implementation of every improperly implemented or missing requirement after Wonder's export `conversation-2026-11-04-172017.txt`. Starting head: `ebfc9cc` on `rehearsal-worlds`. Preserve existing useful work and all original required capabilities. No user-photo flow. Reported remaining Wonder credits: **$30.06**, not a new additional allowance. Do not reset the existing backend ledger or cap.

## Baseline independently checked

- Reviewed the exported implementation history and current source/requirement ledger; the last implementation pass is `5df62a0`.
- Full backend suite: **328/328 passed** with approved temporary-file/loopback access. Earlier restricted-environment failures are not current product failures.
- No hands-on acceptance of this app version has occurred, per the user. Installation, fixtures, and compilation are not visual or whole-loop proof.

## Work in progress

1. Make world preparation/commit persistent, idempotent, canonical, and usable on restoration. Return compiled documents and validate before publishing. Fix active-edit ownership/cancellation and preserving complete runtime state.
2. Connect generated-texture service to bounded phone download, content verification, cache, offline saved restoration, and resource limits. Fix lifecycle/refcount/deletion and upload validation.
3. Finish intent, coherent adaptation/timing, dependency-safe audience changes, material/decorative/behavior targeting, and accurate unsupported-request handling.
4. Audit/revise asset selection around recognizable finished objects and coherent composition, not arbitrary mesh counts or solid-color constraints. Preserve old IDs/files for saved worlds. Create actual asset thumbnails/contact sheets and curated metadata; fill important verified gaps where useful.
5. Fix native presentation/controls and provide a reachable in-app offline diagnostic/render path rather than requiring unsupported launch arguments.
6. Run cross-system regressions, Swift/native build, and update the requirement/evidence ledger honestly. Complete all automatic work before isolating genuinely physical-viewer checks.

## Scope and verification rules

Full app journey, six diverse situations/three families with held-out descriptions, same-place editing and repeats, optional ratings/reflection/grounded feedback, durable records/CSV, STOP/stacked pauses/recovery, and submission materials remain required. No silent feature cuts. Native render/profile and human comfort results must be measured and labeled accurately. Preserve private export/logs/credentials outside commits.

## Live implementation notes

- Current generated-texture routes have no connected phone download/cache path; the native loader still accepts bundled textures only.
- Existing world-commit tests validate a simple legacy fixture and call the dialogue guard; they do not exercise real audience editing, compiled scene response, restart recovery, or cancellation.
- Active edits mutate shared session state across awaits without an edit request owner; checkpoint data lacks visibility/material/behavior state and rejects intentionally removed nodes.
- Existing six-family tests are hand-authored structural fixtures, not evidence of six new AI-generated native scenes.
- Existing asset library has 355 real CC0 GLBs, including four eligible 13-node Kenney characters. Broad source inventory is useful, but prototype assets, unverified fronts, and repeated kit pieces should not define generation's visual defaults.

## Implemented in this working tree (not yet final acceptance)

- `world-commits.ts`: atomic validated WorldStore; canonical response; idempotent commit; persistent WorldTransactions, cancellation tombstones, compensating exact-world rollback at a monotonic revision. `world-mutations.ts` reconciles real construction/cast dependencies without relocating geometry.
- Server supports prepare/commit/cancel/read/delete, persists first generated worlds as well as edits, and validates saved worlds on restart. Added regressions cover lost replies, cancellation/restart/stale edits.
- `GeneratedTextures.swift`: authenticated bounded streaming, SHA256/dimension verification, downsampling, content cache, offline restoration, and local lifecycle cleanup. Backend uses sharp to decode/normalize actual images, atomic registry, per-scene resource accounting, and protected referenced assets. Phone loader connected.
- `SessionWorldEditing.swift`: one owned transaction instead of four unguarded asynchronous mutation paths; native validation before commit, saved pending-transaction journal, rollback on cancel/failure, canonical documents, and restored full world state. Needs broader semantic edit coverage and end-to-end regressions.
- `World.swift`: non-installing preflight; checkpoints now include visibility, scale, material/environment overrides, actor behavior; dependency-aware removal. Textures now apply to environmental asset materials while preserving characters.
- `AttemptTiming.swift` retimes timed holds and global events/audio together without changing route geometry/velocity. `SessionAdaptation.swift` prepares a new same-world attempt before publishing, resets observations/stops/history correctly, preserves world identity, and explains actual changes. New repeatPreparation phase permits deliberate pre-start edits.
- Headset blackout/status use app-owned render order/depth settings; active STOP/status compact rather than a large central plane. Fixed edit-ending pause and pre-run draft deletion paths. Xcode generator now preserves texture folder resources and new Swift files.
- Native xtool build passed after the integrated changes above (41 seconds). No install of our new code yet. No paid Meta calls in this Codex pass.
- Focused backend suites passed (21 existing contract/world tests; then 15 transaction/texture tests). Full suite and native/Swift checks must be rerun after final edits.
- Actual GLB software contact sheets rendered in `docs/asset-review/` (all 355 assets). These are asset-inspection evidence, explicitly NOT native/stereo/animation acceptance. Front-view character comparison shows old `soft_adult` models are strongly chibi-proportioned.

## Local tools/candidate assets

Official portable Blender 4.5.9 was downloaded into ignored `backend/data/tools/blender-4.5.9-windows-x64/` and verified against the official SHA256 list. Local SVG renderer resvg-py is in ignored `backend/data/tools/pythonlibs` (prepend this to sys.path when used). Neither is a production dependency or paid service.

Verified Kenney CC0 Animated Characters Protagonists archive is `backend/data/asset-candidates/animated-characters-protagonists.zip`, SHA256 `ec3787de70fa2200256848d74201b10f6b6c3126594e9857bf989753312c2b84`. Official page `https://kenney.nl/assets/animated-characters-protagonists`; current direct links are generated by its public `/download-link/<data-download-id>` endpoint. Archive contains real characterMedium.fbx (1604 triangles), skin PNG+SVG, idle/run/jump FBXs, and explicit CC0 License.txt. Extracted candidates are under `backend/data/asset-candidates/protagonists/`; `inspection.json` records 58 bones including controls/finger ends. Potential improvement: retain actual source geometry, reduce unused rig overhead, use normal-proportioned friendly civilian skin derivatives from the licensed SVG source, preserve walking/sitting/gesture capability, then inspect and register only when valid. Do not ship the cyborg or threatening criminal presentation as ordinary practice defaults.

`scripts/inspect-character-source.py` ran in portable Blender successfully; user-profile cache warning was harmless. Use local Blender config paths for future runs. Current source model contains body bones Hips/Spine/Chest/UpperChest/Neck/Head, Left/RightShoulder/Arm/ForeArm/Hand, Left/RightUpLeg/Leg/Foot/Toes plus controls and finger chains. GLB export should include actual animation clips and materials; do not claim model/rig/pose acceptance before inspecting results.
