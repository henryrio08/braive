# First pass readiness without automatic scene repair

Branch: `codex/first-pass-no-repair`, based on integrated main `7fdf924`.

Normal generation uses the author, editor and one spatial-builder call, followed by local preparation. Automatic scene patches, complete rebuilds and native-triggered paid scene repairs are disabled by default. Existing bounded planning correction is unchanged. A developer can explicitly enable the old scene-recovery path with `BRAIVE_AUTO_SCENE_REPAIR=true`; ordinary launches must leave it unset or false. User-requested revisions remain available.

## Acceptance

In default permissive mode, scenery support annotations, construction requirement bookkeeping, anchor bounds/footprints, grouping-zone fit, model-authored containment insets, orientation and spacing are recorded diagnostics. They do not veto an otherwise executable scene. `BRAIVE_VISUAL_STRICTNESS=standard` retains the historical construction diagnostics as blocking checks for deliberate developer investigation. It does not automatically enable paid recovery.

Actual scene references/hierarchy, registered resources, participant-route clearance and walk/run support, resource limits, and approved experience execution are still checked. Model-authored construction constraints are not treated as new user boundaries. Cast, approved props, stage order, timing and participant activity retain independent validation.

Native composition checks (three depth groups, minimum focal pixel size, depth-band pixel counts) and object support-contact quality now warn by default. Renderer failures, completely invisible initial task focus and actual participant routes still reject. Strict native visual review is an explicit diagnostic argument; DEBUG negative controls use it. Native errors survive a rejected automatic-repair request instead of being replaced by the backend opt-out message.

## Schema correction

Planning already uses a JSON-schema ExperienceDraft. The completed SessionPlan, SceneSpec and other wire contracts derive from `docs/handoff/openapi.json`.

The builder was instructed to omit compiler-owned stage fields but its output was immediately checked as a completed playback scene. `sceneBuilderSchema` now derives a model-facing draft schema from the same OpenAPI-based schema, allowing those fields to be omitted. The same draft schema validates the received model output locally. The stage compiler fills terminal state, completion, conversation policy/bindings and review defaults; the completed result then passes full SceneSpec/provider and semantic validation before delivery. Required geometry and reference structure are still typed. Provider requests continue to use `response_format.type=json_schema`; this change does not claim that provider `strict:false` guarantees semantic correctness.

## Verification

- Backend typecheck and all 163 tests pass. New regressions cover no paid scene recovery under the default policy, missing support metadata reaching readiness locally, draft-schema/compiler agreement, and model-authored hard visual flags remaining advisory. Historical strict-construction tests explicitly exercise standard mode.
- Read-only replay of the seven newest retained candidates: six pass preparation and backend/experience validation. The remaining indoor-walk candidate still fails its real participant-route/floor intersection. No generation calls or fixture edits were made.
- All four entries in Henry's recovery fixture (two rejected, two corrected) pass local preparation, full output validation and experience checks. Positive-time route points and destinations remain unchanged. Compiler-owned reports on corrected saved scenes are stripped before treating them as builder inputs.
- Native compilation passed using the existing Docker xtool environment: `xtool/Braive.app` was produced. No dependencies were installed or downloaded.
- Physical iPhone playback and Metal visual controls were not run here. An unchanged standalone API transport harness failed its byte-identical POST-body assertion under Linux; `API.swift`, `JSON.swift` and that harness were not modified. The native application itself compiles.
- No paid model-generation verification was performed.

## Henry's rollout

Use this branch (or merge it after review), then restart the backend. Leave `BRAIVE_AUTO_SCENE_REPAIR` unset/false and `BRAIVE_VISUAL_STRICTNESS` unset/permissive.

Install the rebuilt native app too: the previous installed build still contains strict visual and object-support gates. The compiled output is `xtool/Braive.app` in this worktree; follow the existing signing/install workflow for Henry's device.

Verify a stationary conversation, a swim and an indoor walk. Check readiness/reveal, automatic motion and stage completion, speech, STOP/resume/quit, and saved history. Imperfect scenery should remain visible with diagnostics rather than triggering a paid repair; genuinely blocked participant routes should retain their original error and intake. Record the backend revision and installed app build with the result.
