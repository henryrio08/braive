# Rehearsal-worlds follow-up review — November 4, 2026

Reviewed local branch `rehearsal-worlds` at `d14af90ef5b22b1f1e758a68ea447dbd3b7aef62` (08:26:32 Chicago), including correction commit `33287cd` and merge `055c7b2`. Application sources were clean during the review; only the two untracked server logs were present. No application source was changed by this review.

## Verdict

Substantially closer to the approved architecture, with meaningful corrections. The stale-base problem is resolved. However, the defining edit → continued practice → adapted repeat loop still contains reproducible integration defects. Required visual-development and asset-service capabilities also remain unimplemented or unverified. This is progress toward the full plan, not completion of it.

The authoritative plan remains `C:\Users\rscot\Downloads\braive\docs\rehearsal-worlds-implementation-plan-2026-11-04.md`, supplemented by the existing corrective handoff. The user's instruction remains binding: preserve every required feature. Repair the implementation and complete missing work; do not replace the goal with a smaller one.

## Corrections confirmed

- Current remote main `7fab391` is an ancestor of local HEAD. Its generation, transport, and orientation work is now incorporated.
- `refreshHeadsetPanels()` now has callers in normal state changes and ticks. The new Swift files are included in the Xcode project.
- Audience edits now change scene and plan JSON and save those documents instead of adding only anonymous renderer nodes.
- The parser distinguishes some lighting and audience requests and supports population reduction.
- `adaptPreservingWorld()` now exists and copies scene state instead of necessarily regenerating the place. Its normal caller is broken, as explained below.
- The texture registry contains four actual bundled PNGs and rejects mesh IDs as textures.
- Macro recompilation has a preservation mechanism and its idempotency regression passes.
- The initial connection now leads to headset confirmation, forest lobby, then START/intake.
- A requirement ledger now records some device evidence as pending.

## Remaining defects

### P1 — Normal adapted repeats discard successful responses

`ios/Braive/Session.swift:501` handles START in the repeat lobby with `repeatAfterHeadset = false; adapt()`. The phase remains `.lobby`. However, `adapt():1392` accepts its result only if `repeatAfterHeadset` is true and the phase is `.headset`.

Both conditions are false on the normal path. A successful paid adaptation response is discarded and `adaptPreservingWorld()` is never reached. The person remains in the lobby rather than entering the next attempt.

Use one explicit repeat-preparation state/ownership token from request dispatch through commit. Check actual current state in the response guard. Verify the complete YES → headset confirmation → START → adaptation → intro → active loop, including cancellation and retry. Do not simply remove stale-result protection.

### P1 — Local edits and repeats do not synchronize backend approval/revisions

Audience and environment edits increment `Session.revision` (`Session.swift:1027,1051`) without advancing all scene/plan/audio document revisions or updating the backend's approved scene and revision map. The next dialogue request uses the incremented value (`Session.swift:1219`). `backend/src/dialogue.ts:assertCurrentDialogue()` rejects it with HTTP 409 because the approved backend revision is still the original one.

An isolated check reproduced `CONFLICT 409: Dialogue revision has no current approved scene` using exactly that revision mismatch. A newly created same-world repeat similarly has a new session ID that the backend has not registered as an approved world. Fixing the repeat response guard alone therefore will not restore its dialogue.

Make revisions canonical across app, saved documents, audio, and backend approval. Implement an authenticated, validated revision commit using the existing architecture or a proper additive patch endpoint. Keep stale-base checks and ensure existing conversation targets remain usable after both lighting and audience edits and after a repeat.

### P1 — Newly added characters violate the shared schema

`ScenePatch.swift:144` creates characters with ID, name, role, node, asset, and color only. The shared Character schema also requires `appearance_brief`, `goal`, `behavior_boundaries`, and `voice_id` (`docs/handoff/contracts.ts:9`). Native loading does not validate this complete contract.

Passing an exact added-character object to the existing backend validator reproduced all four missing-field failures. Consequently, a locally successful audience increase makes plan-bearing feedback/adaptation requests invalid before provider work can begin.

Construct complete typed character records, preserve role/boundary rules, and validate the whole candidate through the shared contract before committing it. Include a regression that edits the audience and then uses feedback and adaptation APIs successfully.

### P1 — Edit collection, intent, and deferred execution are incomplete

The existing 17 ScenePatch checks pass, but supplemental probes against the real Swift implementation produced:

| Spoken request, starting with 8 audience members | Actual result |
| --- | --- |
| add 3 people | Sets total to 3 |
| remove 2 audience members | Sets total to 2 |
| make the audience larger but keep the lighting | Brightens lighting, leaves audience unchanged |
| less light | Brightens lighting |
| make it longer | Stored as a deferred string |

Parse absolute counts separately from relative changes, preserve explicit unchanged dimensions, and support compound intent without substring precedence changing the wrong property. `perform():1171` also intercepts ordinary conversation containing words such as "people", "make", "change", and "light" before the conversation handler. For example, an interview answer about working with people can become a builder edit. Prefer the explicit builder invocation, with carefully recognized edit intent when appropriate.

`collectActiveEdit()` immediately applies each final transcript rather than collecting an answer through THAT'S ALL. The planned collection/cancellation behavior must be implemented, with an honest prompt and no accidental scheduling of the words "that's all".

The deferred path is still a false completion claim: `adaptPreservingWorld():1113` appends `.deferred` and `.ambiguous` strings to `appliedDeferred` without applying them, then clears the pending queue. The adaptation request sends `user_preferences: []` at `Session.swift:1390`. A request such as "make it longer" neither reaches the model as a preference nor changes duration through the patch loop, yet is recorded as applied. Preserve pending requests until a validated semantic change is actually applied; retain and explain unsupported/ambiguous requests.

The same-world adaptation also ignores `direction` and most typed `changes`, adds/removes people according to absolute intensity relative to 5, and changes plan duration without coherently changing stages/routes/audio or plan intensity. It can add an audience to a quiet non-social setting or increase the crowd on a maintain response. Apply only relevant, requested/approved difficulty dimensions relative to the current attempt, preserving boundaries and place identity.

### P1 — Audience placement and checkpoint preservation still need real spatial integration

`ScenePatch.patchAudience():112` uses the *initial* viewpoint, assumes floor height is `viewpoint.y - 1.6`, and places actors along positive Z without using the existing audience's layout, group anchors, transforms, measured floor, available space, or current stage. A probe with viewpoint `[0,1.6,4]` and app forward negative Z placed the first added actor at `[-1.7259,0,7.1593]`, behind the opening viewpoint. Other scenes may put additions outside the room, through furniture, or on an incorrect floor.

The patch leaves construction assemblies, requirement bindings, support/contact relations, and macro parameters unchanged. Reductions can leave dangling metadata or references beyond `conversation_target`. Use the actual scene's supported groups and validate dependencies and placements; do not equate adding serialized nodes with a complete canonical spatial revision.

`Session.swift:1024` ignores checkpoint restoration failures with `try?`. Removing a node present in the old checkpoint makes `World.restore():607` throw "Saved scene node is unavailable". Restoration then stops partway through. Loading a candidate also starts from opening visibility/material/behavior state; checkpoint data contains transforms and motion, not all current stage visual state. Retain/replay the complete current execution state, allow only intentional dependency-aware removals, and treat restore failure as a rejected candidate with a verified rollback. Surface storage failures instead of silently declaring a durable revision after `try? store.save`.

### P1 — Black introduction and pause presentation regressed

`BraiveApp.swift:40` now applies the intro/planning/error black layer only while `headsetReady` is false. After the normal headset confirmation it is true. No equivalent in-world blackout/dimming was added to `World` or the panel presentation. The generated scene is loaded before introduction, so it is visible during the required eight-second black intro; reveal then starts by going black. Planning and pause backgrounds also lose the specified dimming.

Compose background blackout/dimming inside the stereo pipeline, behind the app-owned text, so panels remain readable and lens-corrected. Preserve black intro → controlled fade/blur reveal and readable pause/quit controls. Do not restore an opaque overlay above the headset text.

`pausedHeadsetCopy` checks `builder_edit` before `user_stop`, tracking, and voice failures. STOP during an edit therefore continues showing edit/resume copy while the actual input handler waits for YES/NO. Give urgent controls the correct display priority while keeping independent pause reasons.

### P2 — STOP before practice still creates post-performance handling

`canStop` includes preparation, introduction, and reveal. `confirmStop(end:true)` always calls `finish`, which enters self-report through `Session.swift:1284`. The approved plan explicitly distinguishes cancelling before a run from ending actual practice. Implement that branch and do not produce a performance record or ratings journey for a scene that never began.

## Required work missing from the ledger or still open

These remain required. They are not authorized feature cuts or automatically human-blocked implementation work.

- **Trusted generated-asset service:** four bundled textures are useful progress, but authenticated generated-asset registration/retrieval, content-based persistence/cache, per-scene generated download/decoded-memory limits, and saved-session asset lifecycle are absent. Current `World.textureImage` loads bundled files only; server routes expose no asset retrieval. Generated dressing remains optional for an individual scene; the specified delivery capability still belongs in the implementation.
- **Full edit surface:** no typed implementation for material/texture changes, supported decorative placement, or actor behavior changes within current roles. These requests mostly become unimplemented deferred strings.
- **Construction capabilities:** current new macros are seating, enclosure, and scatter. Platforms/steps, functional groups, and actor/seating integration remain uncovered. General nodes are retained, but that alone does not establish the planned tested higher-level capabilities.
- **Visual-development deliverables:** no vetted cached reference library, approved asset/contact gallery, or six new native scene comparisons is recorded. The registry does not establish that scene aesthetics have improved. Develop and inspect the actual scene compositions; preserve held-out examples in each of the three families.
- **Execution evidence:** two full physical-phone loops, edited-scene save/recovery, adapted-repeat identity, stacked pauses and failed/cancelled edits, 16-person sustained profile, measured latency, native render gallery, and completed demonstration remain open. The evidence file reports builds/installation, but this review did not independently rebuild, install, or inspect new phone pixels.
- **Journey coverage:** update the authoritative transitions and evidence ledger to cover the new substates and every required capability. The current 16-row ledger bundles too much under "full flow retained" and labels some incomplete implementations Done or Device-pending. A renderer feature, local parser, or passing unit test does not establish the whole connected feature.

## Verification in this review

- Backend type check: passed.
- Complete backend suite: **310/310 passed**. The initial restricted Windows run had temporary-file rename and loopback access failures; an approved rerun with the necessary access passed all tests. Do not carry forward those restrictions as current product test failures.
- Existing `scripts/check-scene-patch.swift`, compiled against the actual sources in the existing Swift 6.4.1 container: **17 checks passed**.
- Supplemental read-only Swift probes: reproduced relative-count mistakes, wrong target/direction, and behind-viewer placement above.
- Existing backend validators: reproduced invalid added-character schema and client-only revision conflict.
- Main ancestry and current working tree checked. GitHub's branch inventory still did not show a published `rehearsal-worlds` branch at the time checked; these findings concern the newer local implementation.
- No live model calls, application edits, build/install operations, or private server-log inspection during this review.

## Continue from here

Keep the current branch and full goal. Fix the repeated-session transition and canonical revision/contract integration first, then implement coherent edits/deferred adaptation, preserve full runtime state and presentation, and complete the missing capabilities and evidence. Reuse the good work. Add meaningful integration checks for edit → dialogue → feedback → save/recover → adapted repeat, because the currently green unit suites do not exercise that cross-system loop. Do not mark the goal complete or reduce required features to make the ledger green.
