# Runtime follow-up before visual work

This work follows the independent review and first audit-fix commit. It incorporates `origin/codex/bundled-lowpoly-library` through `89fc366`, including the partner's automatic guided flow, natural conversation windows, STOP confirmation protection and four approved soft character models. No skybox or surface-effect implementation is included.

## Coverage of the remaining items

| Item | Implementation | Evidence and limits |
| --- | --- | --- |
| Branch-sensitive progression | Backend explores stage/motion-owner states, rejects stranded branches, replacement-path dependencies, unreachable stages and competing writers. Each completion path belongs to one viewer/actor. | Deterministic branch and ownership regression tests. Forward branching remains available to legacy/action graphs; new guided output preserves the partner's automatic flow. This proves executable reachability in the bounded declarative graph, not arbitrary eventual behavior from every possible user utterance. |
| Automatic behavior | Partner's guided scenes progress by time/movement; natural speech reaches only the authored conversation target. Motion completions are latched even when conversation defers advancement. Optional entry announcements allow quiet routine stages. | Guided backend fixture and portable native scenario-state recovery checks. No new command checklist is introduced. |
| Route clearance/support | Loaded meshes are probed along body center/perimeter segments; walking/running additionally samples floor support at 0.25m intervals. Explicit support-node references are checked. Water/decorative non-solids are declared separately. Relative travel is rechecked at its actual captured heading. | Native diagnostic controls cover a thin wall, supported floor, missing floor and unsupported travel modes. These controls require an Apple runtime to execute. Probes do not constitute exact continuous capsule collision or a physics engine. Moving/dynamic interactions can require runtime rejection even after bounded preflight. |
| Later-stage checks | Bounded stage-graph review applies visibility/material operations and path endpoint transforms, checks declared support and renders authored review viewpoints/focal objects in both eyes. New provider output must supply stage-review and collision metadata; legacy saved schemas remain additive. | Backend validates references and enforces the new output contract. Native review still needs execution. Review samples are stage/end-state checks, not a frame-by-frame proof of all animation or translucent compositions. The post-load deadline is checked before reveal. |
| Viewpoint fade | A 0.6-second black fade runs on the shared active clock; relocation occurs at its midpoint. The stereo compositor uses the same shade for both eyes. | Source syntax check. GPU/STOP-resume behavior needs native execution. This is an existing transition requirement, not a new visual style. |
| Asset material overrides | Initial loaded assets retain source palette/textures; supported roughness/opacity/sidedness scalars apply without replacing whole materials. Explicit prop recoloring preserves unrelated material settings. Character palette/tint remains governed by the asset registry. | Source check; rendered comparison pending. Arbitrary texture IDs remain unsupported. |
| Alpha cutouts | Visibility masks retain original material/texture alpha and override RGB only. Added transparent and cutout positive controls alongside opaque/occluded/tiny/flat negative controls. | Native GPU controls added, not executed here. |
| Resources | Records include per-session CPU encoding timing, GPU command timing, resident-memory samples, Metal allocation peaks, render-target bytes, and estimated geometry-element submissions. | Instrumentation added. No measured phone values are claimed. SceneKit can add passes/batch internally: actual draw calls require a Metal GPU capture and are not equated with the estimate. |
| Tool scheduling | Registered typed scene/audio tools dispatch in setup/builder revision; declared feedback/adaptation handlers run only after the session. Duplicates/missing declarations fail before their handler runs. | Regression test verifies arguments, phase gating and no handler invocation on invalid schedules. Scene repair retains its stable audio plan and approved coordinator decisions. |
| Checkpoints/recovery | Atomic checkpoints every five active seconds and at pauses/stage changes retain scene/audio, active clock, node transforms, in-flight paths, fade progress, stage/completion state, fired events, observations and conversation history. Resume is an explicit lobby/phone-control action followed by headset confirmation. | Storage test verifies running-to-interrupted recovery, durable checkpoint values, and exclusion of completed runs. Scenario snapshot test verifies stage and latched completion restore. Full app recovery still needs a device test. |

## Recovery semantics

Say RESUME PRACTICE at the lobby or choose Resume interrupted practice in phone controls. Confirm the headset's forward direction again. Loading and validation run before restoring the saved state. The clock remains at its saved active time while the app was closed. In-flight motion keeps its stored origin, heading and timing; historical travel commands are not restarted. Background loops seek to their elapsed positions. Stage-entry operations are not replayed as new decisions.

The maximum ordinary checkpoint interval is five active seconds; a sudden process kill can lose that interval. Pauses and stage changes force a checkpoint. This is an interrupted-practice recovery mechanism, not a guarantee that every last frame was saved. Pending provider replies and mid-utterance TTS are not replayed automatically; this avoids duplicate paid requests or stale speech. The current prompt remains available in phone controls. Resume does not create a preset fallback or issue a new generation request.

If the backend has restarted, an optional conversation request may fail because its old approved scene is absent; local guided movement can still resume from the explicitly saved generated scene. This is labeled recovery, not fresh generation. Retry/revise/cancel remains the route for invalid scene data. Checkpoint write failures are shown in the local status instead of claiming a save succeeded.

## Verification in this checkout

- Backend type checking and 58 backend checks pass after integrating the partner update.
- Seven importer tests pass; dry-run validates all 355 CC0 GLBs.
- Native Swift source parsing passes. Portable native checks pass for 36 voice turns, 29 speech/STOP coordination assertions, scenario-state persistence/guided conversation restoration, and storage/checkpoint recovery.
- The Xcode project includes the added native files. The generator now uses portable forward-slash resource paths on Windows.
- No provider calls or phone installation were made from this Windows checkout. The partner's earlier native build and generated-output evidence are recorded separately in `guided-runtime-handoff.md`. The local cap remains $50; provider access remains disabled. Credentials and temporary tools are excluded from Git.

Apple SDK/framework type checking, GPU diagnostics, real scene review, physical headset comfort and sustained device profiling are still pending. Linux source parsing is not an iPhone build. The installed xtool still needs an authorized Apple SDK archive before those checks can run from this machine.

## Required device pass

Build the integrated branch, run `--preflight-audit` for mesh/visibility controls, and review a fresh guided scene. Check natural conversation and STOP/NO without playback echo. Exercise pause during a viewpoint fade, background/reopen, a forced process kill followed by RESUME PRACTICE, and a relative path after turning the head. Compare the saved countdown/positions/events to the recovered state. Inspect `render_metrics` in the saved record and capture a GPU frame for actual draw submissions. Keep the shared 120-second generation limit and use the approved local test launcher for any paid requests.

The separate visual-construction proposal remains the next implementation topic after this verification gate.
