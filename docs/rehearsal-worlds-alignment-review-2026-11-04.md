# Rehearsal-worlds alignment review — November 4, 2026

## Conclusion and latest user instruction

The current work partially implements the approved direction, but is not yet a faithful, complete implementation. Building on existing Braive code was explicitly intended. The problems are an outdated starting revision, disconnected presentation code, hardcoded runtime effects outside authoritative scene state, incomplete asset delivery, and missing acceptance evidence. A from-scratch rewrite would not fix those problems automatically.

The user's latest instruction is explicit: **do not sacrifice any features from the originally provided ambitious plan**. Deadline fallbacks may change implementation method and ordering; they must not silently remove required capabilities or redefine incomplete work as complete. Explicit user corrections, including no user-photo selection/upload, remain in force.

This is a review and corrective handoff. No application implementation, checkout, merge, reset, or provider call was performed for this review.

## What was actually reviewed

- Current local branch: `rehearsal-worlds`.
- Local HEAD: `019e9e15421ccd83e75cb18fadb0ee3ca66f70d1`, dated November 3. Its rehearsal-world changes are uncommitted, including the new `HeadsetPanels.swift` file.
- At inspection, GitHub had no published `rehearsal-worlds` branch. The most recently updated feature head was `codex/reliable-scene-readiness` at `f860da1c99b8eb7695c1441e03d4195965b0c250`, already merged into `main` at `7fab391fa34f21f69eb4dc9a21025fdcb333bfd1`.
- GitHub's comparison showed current main **45 commits ahead of the local HEAD**, including merge commits. This does not mean 45 independent product fixes, and does not imply every main policy should be accepted without reconciliation with the approved plan.
- Reviewed the local working changes, authoritative rehearsal-worlds plan, Wonder handoff, implementation evidence, selected tests, and remote main's change history and generation/acceptance policies.

Remote evidence:

- https://github.com/henryrio08/braive/compare/019e9e15421ccd83e75cb18fadb0ee3ca66f70d1...7fab391fa34f21f69eb4dc9a21025fdcb333bfd1
- https://github.com/henryrio08/braive/tree/codex/reliable-scene-readiness

## Findings, in priority order

### P1 — Headset text implementation is disconnected

`ios/Braive/Session.swift:970` defines `refreshHeadsetPanels()`, but a repository search found no callers. `World.setHeadsetText()` is called only by that method. The new panel starts empty, while `BraiveApp.swift:47` and `:56` hide the old headset and pause HUDs when `headsetReady` is true. Thus merely building the panel class does not deliver visible headset instructions or STOP confirmation.

Wire presentation updates to real state/voice/countdown/pause changes. Also fix compositing: SwiftUI black/dimming layers remain above the entire stereo image, including newly spatial text. Essential messages must remain legible during intro, pause, generation, and errors. Give active-builder collection and revision-ready their own correct copy; the present pause copy falls through to generic "paused" text.

### P1 — Active edits bypass the scene contract and persistence

`World.swift:34` adds characters/chairs directly to `scene.rootNode` at hardcoded positions near the global origin. These additions do not update `Session.scene`, approved plan cast, scene revision, `nodes`, requirement bindings, or normal preflight/resource/route checks. `World.checkpoint()` serializes `nodes`, which excludes `addedAudience`. Restoring loads the original saved scene. The new crowd is therefore not a durable, validated revision of the generated world and may collide with furniture, walls, or travel paths.

Use a canonical candidate scene/plan revision and typed parameter patches. Generate supported placements from the actual scene's group anchors, floor/support geometry, remaining routes, and current pose. Validate before atomic commit. Persist the result so save/recovery/repeat see exactly the same world. Keep the old scene frozen and recoverable while preparing the candidate.

### P1 — Edit intent is inverted or discarded

`Session.swift:1001` routes any text containing "audience", "people", "crowd", "larger", "bigger", or "more" into audience growth. Consequently "fewer people", "smaller audience", and "more light" increase the crowd. No reduction path exists. Lighting changes use fixed values rather than a bounded change to the current environment.

`pendingNextAttemptChange` is declared and assigned but never consumed by adaptation. The app tells the participant a change will shape their next attempt without actually applying it.

Parse typed intent with direction, quantity, target group, and allowed scope. Support increases and decreases, exact counts where feasible, explicit boundaries, and ambiguity handling. Persist deferred changes and actually consume them in the next attempt. Do not claim an unimplemented change has been scheduled.

### P1 — Adapted repeats still regenerate the world

`Session.swift:1193` retains the old adaptation path: request an adaptation, call `newSession()`, turn change descriptions into additions, and call `generate()`. It does not reuse a frozen canonical scene/seed and apply a bounded patch. The defining same-place repeat is therefore not implemented merely because live nodes can be added.

Persist a shared world identity and copy the prior accepted scene/assembly state into the next attempt. Apply approved parameter changes while preserving unchanged identities, materials, layout, and assets. Revalidate and keep the appropriate separate attempt record.

### P1 — The local starting point omits substantial newer integration

The branch base predates main's head-tracking/orientation fixes, idempotent generation submission and transport handling, author/editor/local-audio pipeline, improved route handling, stage compilation, and recovery diagnostics. Some local edits duplicate fixes already in main. The containment feature itself already has an upstream implementation.

Preserve all working changes before integrating current main. Merge normally or otherwise reconcile safely; do not blindly reset, rebase away work, overwrite files, or duplicate upstream features. Review policy differences deliberately: main includes permissive visual-annotation acceptance and developer-opt-in scene repair, while the plan describes hard critical checks and bounded recovery. Preserve real executability, user boundaries, route safety, source fidelity, and spending limits. Do not equate suppressing a warning with improving a visual result.

### P2 — Registered texture delivery currently cannot load a texture

`backend/src/contracts.ts:61` accepts a texture reference if it names any mesh asset ID. All 355 current manifest entries point to `.glb` files. `World.textureImage()` requires a manifest entry ending in PNG/JPG/JPEG, so none can load. The new test accepts a grass GLB as a texture ID, establishing validator acceptance rather than successful image loading. The authoring prompt still says no texture IDs are registered.

Create a genuine typed image registry, usable bundled/reference materials, authenticated generated-asset delivery, bounded decoding, UV controls, cache/persistence, and consistent model capabilities. Test a real image loading and invalid-kind rejection. Generated imagery can be optional for a particular scene while the specified delivery capability still must be implemented.

### P2 — Macro recompilation is not idempotent

`compileConstruction()` expands `construction_plan.macros` every time. Expanded nodes and macros both remain in the compiled result. A read-only probe using the existing seating test fixture passed first compilation, then failed recompilation with `Macro aud generated duplicate node aud_seat_0_0`.

Separate authoring instructions from expanded output or track deterministic expansion so recompilation, validation repair, saved-scene processing, and patches cannot duplicate nodes. Preserve stable identities. Check ancestor transforms, placement feasibility, and requested counts when generalizing macros.

### P2 — The opening sequence remains unchanged

`Session.connect()` still enters the lobby with `headsetReady=false`; `BraiveApp.swift:35` masks the forest. START then enters headset confirmation. The approved sequence is setup -> headset confirmation -> visible forest lobby -> START -> intake. The intended flow has not been delivered by adding more forest geometry.

### P2 — Visual breadth and full experience remain unverified

The work contains useful containment, macro, forest, and panel scaffolding. However there is no new native regression gallery, approved asset/contact sheet, six-situation comparison, two verified full practice loops, or completed recorded demonstration in the inspected evidence. The evidence file also both reports installation and lists installation as unverified; reconcile those statements precisely.

Do not label these gaps as feature removals, scope exclusions, or completed implementation. Maintain a requirement ledger and supply evidence for every completed claim. Verify the SwiftPM/xtool build and keep the Xcode source list current for the added Swift file as well.

## What aligns and should be preserved

- Reuse of native Braive and existing schemas/runtime.
- Explicit containment semantics and regression intent.
- Reusable scene-assembly macros and preservation of general nodes.
- Flat spatial panel architecture, once connected and visibly composed.
- Local forest detail and attempt to preserve participant position.
- Explicit RESUME after an active edit.
- Existing speech/preview/polling fixes and conservative ledger handling.
- Honest statements that new physical visual/loop evidence is pending.

## Checks performed

- Current local backend type check passed.
- Current local construction/scenario/contracts suites passed: **51/51**.
- Manifest inspection: **355 GLBs, zero registered PNG/JPEG images**.
- Repository reference search: no callers of `refreshHeadsetPanels`; no consumption of `pendingNextAttemptChange`.
- Macro recompile probe reproduced duplicate-node failure after an initially successful compile.
- Remote comparison confirmed the old base and 45-commit gap.
- No live model calls, native rebuild, installation, or new phone visual inspection was performed during this review. Build/install claims in existing evidence were read, not independently repeated.

## Completion rule

Retain the full original product vision and all required additions in the approved rehearsal-world plan, with explicit user corrections applied. Technical sequencing can change. No required capability is complete merely because an API field, class, keyword branch, written demo script, or passing mirror test exists. Every feature must be connected to normal operation, preserve canonical state, survive its failure/recovery paths, and have appropriate evidence.
