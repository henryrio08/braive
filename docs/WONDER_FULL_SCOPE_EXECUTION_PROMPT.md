# Braive: complete the full product and repair the end-to-end integrations

You are Muse Wonder 1.0, the implementation lead for Braive. This is an instruction to IMPLEMENT and VERIFY the entire approved product in the real repository. Continue the useful existing work. Do not stop after producing another plan, updating documentation, passing isolated unit tests, or installing an app whose complete experience has not been verified.

Project root: `C:\Users\rscot\Downloads\braive`

Authoritative project plan — absolute path:
`C:\Users\rscot\Downloads\braive\docs\rehearsal-worlds-implementation-plan-2026-11-04.md`

Latest independent review — absolute path:
`C:\Users\rscot\Downloads\braive\docs\rehearsal-worlds-recheck-2026-11-04.md`

Read both files completely. Also read `docs/handoff/original-framework.txt`, `docs/handoff/development-plan.md`, and `docs/handoff/requirements-map.md`, plus applicable repository instructions. Read the requirement ledger and evidence files critically against the code. This prompt supersedes outdated execution instructions in earlier Wonder prompts. The approved plan, original required product capabilities, and my latest explicit corrections remain binding.

## 1. Non-negotiable outcome and scope

DO NOT SACRIFICE ANY FEATURES FROM THE ORIGINALLY PROVIDED AMBITIOUS PLAN. Preserve the entire required product and required rehearsal-world additions. My explicit exclusion of user-provided reference-photo selection/upload remains in effect; vetted online/library references and our own renders are appropriate. Older preferences and implementation decisions may change when a better method improves the outcome.

The finished product must prove: a person can enter a situation that matters to them, practice within it, and deliberately reshape that same world for their next attempt.

Deliver convincing native iPhone/Cardboard VR, broad freeform scene generation, relevant natural conversation and automatic progression, immediate STOP and reliable recovery, deliberate same-world edits, reflection/feedback/saving, and meaningful same-place adapted repeats. Do not substitute a fixed presentation demo, a few preset environments, a web app, or renderer-only changes for these capabilities. Examples demonstrate quality and breadth; they do not limit supported situations.

Deadlines determine work order and urgency. They do not authorize feature cuts, permanent deferrals, or false completion. A fallback may change the technical method while preserving the required capability. Do not quietly change the plan or ledger to make an incomplete implementation appear compliant.

## 2. Start from current reality

At the latest review, local branch `rehearsal-worlds` was at `d14af90ef5b22b1f1e758a68ea447dbd3b7aef62`. It already included main `7fab391` through merge `055c7b2`, plus corrections in `33287cd`. Recheck the actual current state because work may have advanced. Do not repeat the obsolete old-base diagnosis or redo completed fixes.

Preserve tracked and untracked user work. Checkpoint useful changes explicitly, excluding credentials, private logs/transcripts, budget ledgers, caches, and generated build output. Do not blindly stage everything, reset the branch, overwrite work, or restart from scratch. Reconcile newer upstream changes if needed without losing local work. Coordinate with any active process before changing the same files or build outputs. This prompt does not request another subagent.

Confirmed progress to preserve: connected spatial-text updates, corrected initial opening sequence, typed bundled PNG registry, macro recompilation regression, serialized scene/plan edits, current upstream generation/transport/orientation work, and existing storage/speech safeguards.

The latest review independently passed the backend type check, all 310 backend tests, and all 17 existing Swift ScenePatch checks. Nevertheless, it reproduced defects that those checks miss. Do not use the green counts as proof that the full experience works.

## 3. Repair the defining loop as one coherent system

First read the review's concrete findings and verify their current status. Fix their root causes together, preserving cancellation, validation, ownership, and budget protections.

### Repeat transition

The normal repeat START handler clears `repeatAfterHeadset` and calls `adapt()` from `.lobby`, while the response guard requires that flag to remain true and phase `.headset`. Successful adaptation responses are discarded.

Use an explicit repeat-preparation state and request ownership token, aligned with the real journey. Preserve stale-response rejection. Prove YES -> headset confirmation -> START -> adaptation -> intro/reveal -> next active attempt, including retry/cancel. Do not merely delete the guard.

### Canonical revisions across app, backend, and storage

Successful local audience/lighting edits increment the app revision without coherently updating scene/plan/audio revisions or backend approval. Dialogue then receives HTTP 409. A new same-world attempt likewise needs valid backend approval for its new session ID.

Implement a validated, authenticated revision/attempt commit that keeps the app, backend, saved documents, and assets consistent. Reuse existing interfaces where appropriate; add a properly contracted patch/commit interface if necessary. Require the expected base revision; reject stale or cancelled work. Preserve explicit world identity across distinct attempt IDs. Ensure backend restart and saved-session recovery can restore a validated approved world without paid regeneration or bypassing validation.

Publish a candidate only after all relevant schema, reference, spatial, route, resource, and native checks pass. Persist the accepted canonical state and handle storage failures explicitly. Do not silence failures with `try?` and announce success. Keep the prior usable world intact until the new candidate can commit atomically.

### Complete records and dependencies

Added audience characters currently omit required `appearance_brief`, `goal`, `behavior_boundaries`, and `voice_id`. Construct complete valid Character records. Validate the complete plan/scene/audio combination through the shared contracts. Keep construction groups, assembly parameters, seed, requirement bindings, support/contact data, asset references, and revision metadata coherent after additions/removals.

Check every dependency before removing a person or object: conversation targets, timed events, stage operations, interactions, paths, anchors, support links, groups, and requirement bindings. Protect required roles and participant boundaries. Do not weaken schemas or hard checks to accept invalid edits.

### Spatially correct edits and complete runtime preservation

Replace the generic audience arc based on the initial viewpoint and assumed floor. Use the actual scene's audience/group layout, transforms, measured supports, current execution context, available space, and route clearance. In the reviewed code, added people appear behind a negative-Z-facing viewer. A confined space, elevated platform, outdoor gathering, and library require different feasible arrangements.

The requested count must actually fit and render convincingly. If it cannot, explain the constraint and retain the original scene. Never silently invent extra people in a quiet non-social situation. Demonstrate 8 -> 16 in an appropriate audience situation with measured performance.

Preserve the current stage, remaining timer, viewer position/orientation and motion, conversation target, existing actor identities, visibility, materials, behaviors, and already-executed operations during an active edit. Current checkpoint restoration ignores errors and does not retain all visual/behavior state. Make restoration complete and dependency-aware; validate rollback too. Keep the original world resident and frozen during preparation. Cancellation/failure retains it. Only deliberate RESUME continues practice after a prepared edit.

## 4. Implement real intent and adaptation

Collect active-builder speech using the planned explicit THAT'S ALL completion, START OVER, clarification, and cancellation behavior. Do not apply each transcript fragment as a finished request. Ordinary conversation about "people", "change", "make", or "light" must not unexpectedly invoke the builder. Preserve explicit HEY BUILDER and recognize other edits only when the intent is clear.

Use typed intent with target, direction, absolute count versus delta, unchanged dimensions, allowed scope, and expected base revision. A structured model interpreter or a genuinely adequate bounded parser is acceptable; broad substring precedence is not sufficient. These cases must work:

- Starting at 8, "add 3 people" requests 11, while "remove 2 audience members" requests 6.
- "Make the audience 12 people" requests exactly 12 where feasible.
- "Make the audience larger but keep the lighting" changes population and preserves lighting.
- "Less light" dims; "more light" brightens without adding people.
- Ambiguous requests get a brief clarification and retain the current world.
- Ordinary interview speech about working with people remains conversation.

Support the full required active-edit surface: approved population/groups, materials and textures, lighting/environment appearance, supported decorative placement, and actor behavior within current roles. Preserve task, routes, stage order, and timing during an active attempt. Defer requested changes to those latter dimensions to the next attempt, as specified.

Deferred means implemented later in the actual next attempt, not discarded. Persist typed pending intent, include it in adaptation context, apply and validate its semantic effect, and remove it from the queue only after successful commit. Never record an unexecuted string as `deferred_applied`. Retain and explain unresolved intent after failure.

Honor adaptation direction, evidence, boundaries, requested changes, and current difficulty. Do not translate absolute intensity above 5 into unconditional crowd growth. A maintain result must not escalate difficulty; a quiet trail must not acquire an irrelevant audience. Apply appropriate meaningful dimensions relative to the current attempt while retaining place identity. When changing duration or stages, keep plan, scenario completions, motion/events, narration, and audio timing coherent. Record what changed and why; preserve everything not intentionally changed.

## 5. Finish the complete user journey and presentation

Maintain one authoritative transition specification covering presentation/audio, spoken prompt, accepted input, completion trigger, next state, durable state, cancellation, and recovery for every reachable state and new edit/repeat substate.

Deliver the entire journey: launch -> outside-headset consent/connection/voice/calibration -> headset confirmation -> finished local forest -> START -> situation -> ability/boundaries -> optional relevant-history consent -> preparation/setup builder -> eight-second black introduction including STOP -> fade/blur reveal -> automatic timed practice with natural relevant conversation -> optional difficulty/readiness ratings -> optional spoken reflection -> independently optional grounded feedback -> durable save/CSV -> same-place adapted repeat or forest/finish.

Preserve explicit answer completion, repeated-command deduplication, history consent, nonclinical framing, quiet scenes, automatic movement/stage progression, null versus zero ratings, reflection naming/files, minimal saving independent of reflection/feedback, and existing export/deletion behavior. Do not add spoken navigation, mandatory action menus, or invented observations.

Restore black intro, dimmed preparation/pause, controlled reveal, and readable urgent controls inside the stereo composition. The reviewed headset-ready gating removed blackout without a replacement. Put blackout/dimming behind app-owned spatial text; do not obscure panels with an opaque screen overlay. Text remains flat, crisp, rendered for both eyes through the same optical correction; essential countdown/listening/STOP stays compact. Verify actual pixels and viewer comfort.

STOP freezes participant-facing flow immediately and prevents pending reveal/commit. YES before practice cancels to forest without fabricated performance records or ratings. YES during practice ends the attempt and enters post-session handling. NO clears only the STOP pause; other pause reasons remain. Give STOP confirmation and urgent tracking/voice failures correct display priority over builder copy. Successful/cancelled edits never resume unsolicited.

Implement and verify every exception in the plan: permissions/speech assets, portrait, audio interruption, background/lock, voice failure, network/provider/validation/asset failure, failed/cancelled/stale edits, interrupted dialogue, storage failure, crash recovery, corrupt restoration, manual controls, deletion, and accurately labeled saved replay. An in-flight provider computation may finish after STOP; do not dispatch further stages while paused or let cancelled work commit. The wall-clock readiness deadline continues.

## 6. Complete visual quality and construction breadth

The initial problem was disappointing scenes. Fixing data structures alone does not solve it. Produce and inspect real native renders, improve the actual compositions, and retain evidence. Use finished recognizable assets, a coherent cinematic stylized aesthetic, verified proportions/fronts/floor contacts/seated fit, preserved character palettes, readable lighting, meaningful depth, and task-relevant detail. Primitive geometry may form genuine architecture or finished assemblies; it must not impersonate a missing required object by renaming a box.

Curate the existing library, add matching finished licensed assets where needed, and build a small rights-checked cached reference library and approved component/render gallery. No user-photo flow. Online/library references may be acquired during development; runtime web search must not block readiness.

Complete enclosures/openings, platforms/steps, repeated seating/actor groups, bounded scatter, and functional groups while preserving the general node/asset path. Validate idempotency, parameter changes, hierarchy transforms, supports, clearance, resource expansion, and requested counts. Keep containment-only versus placement semantics and legacy compatibility. Do not redo the fixed duplicate-expansion issue unless new evidence requires it.

Demonstrate two materially different generated situations in each family: indoor, open, and confined. Use library presentation, studio interview, garden toast, dusk trail, elevator, and service passage as quality examples, with held-out descriptions per family. Include the retained island/cove regression. Preserve broader freeform capability. Compare actual old/new native quality, task/boundary fidelity, recognizability, composition, contacts, latency, first-pass acceptance, repairs, and cost. Repair weak results; do not claim schemas prove visual improvement.

Complete the required trusted asset capability beyond the four bundled PNGs: typed image registry, authenticated generated-asset registration/retrieval, format/dimension validation, UV scale, safe decoding, content-based cache, persistent saved references, offline restoration, and deletion of unreferenced assets. Enforce the plan's generated download limit of 12 MB and decoded texture limit of 64 MB per scene, material size at most 1024x1024, and distant imagery at most 2048x1024. Preserve character materials. Optional dressing failure must leave a finished usable base. Generated images remain optional for an individual scene; the required service still must work. Do not fabricate provider endpoints or access.

Keep nearby floors, walls, actors, task objects, and openings as real stereo geometry. Distant imagery supplements context. Use development review of actual production renders; a new runtime VLM round trip is not required. Do not restart the research survey or introduce unnecessary GPU, hosting, account, or renderer migrations.

## 7. Verification must cross subsystem boundaries

Add meaningful regression/integration coverage for the failures, using real contracts and runtime paths rather than tests that repeat the faulty implementation. At minimum verify:

- Initial generation -> accepted scene -> conversation.
- Active audience and lighting edits -> consistent commit -> continued conversation -> feedback/adaptation request validation.
- Relative/absolute/compound edits, ambiguity, ordinary conversation, and explicit answer completion.
- Deferred task/timing changes actually applied on the next attempt; failed changes retained honestly.
- Same-world repeat through its real transition path, valid backend approval, separate records, and relevant adaptations.
- Failed/cancelled/stale revisions, rollback, save failure, and edited-world checkpoint restoration after restart.
- Stage/pose/motion/remaining time/visibility/material/behavior preservation and protected dependencies.
- Black intro/reveal, STOP before/during practice/editing, stacked pauses, and correct urgent text.
- Assets, offline cache/restoration, invalid kind/size/download, budgets, and containment/macro regressions.

Run the appropriate complete existing checks and native build on the final integrated tree. Maintain both SwiftPM/xtool and Xcode source/resource membership. Use the established `braive-xtool-ready` environment and the instructions in `docs/PHONE_TEST_HANDOFF.txt`, `docs/xtool-windows.md`, and current `docs/active-work.md`. Prior inspection verified xtool 1.24.0, Darwin SDK, saved sign-in, and successful pairing via `host.docker.internal:27015`. Docker access may need scoped approval. Verify current state; do not diagnose missing SDK/authentication from an access denial, reset working pairing, or rebuild the toolchain unnecessarily. Programmatic launch may be unavailable; the installed icon can be tapped.

Complete two consecutive physical-phone loops, one successful and one cancelled edit, changed-world saving/restoration, visibly same-place adaptation, six-situation native gallery, and three sustained minutes with the larger audience. Measure preparation/edit latency and 60-fps/p95-frame targets; report actual results. Optimize rendering cost before changing task semantics.

Inspect what can be verified automatically. For genuinely human-only headset comfort, tapping, or recording, prepare a working build and exact short check instructions, identify that dependency honestly, and continue all independent engineering work. Do not classify unimplemented code as human-blocked. Build success and installation do not establish visual or full-loop acceptance.

## 8. Time, spending, evidence, and stopping rule

Read current America/Chicago time. The plan's times are latest completion deadlines, not scheduled start times; advance immediately when ahead. Protect video/submission time. An elapsed timestamp never permits removing a required capability or claiming incomplete work is done.

US$69.77 was a previously reported remaining balance, not a fresh allowance for this continuation. Reconcile actual coding/app spend and uncertain reservations before paid batches. Preserve the existing backend ledger, historical charges, reservations, and cumulative cap. Never reset it or silently raise the cap. Prefer offline fixtures before necessary paid validation. Use the bounded launcher, account for concurrent spending, and avoid unattended or duplicate billable processes. No new paid accounts, subscriptions, or GPU rental without authorization. Keep secrets/private transcripts out of commits and reports.

Expand the requirement ledger to cover every original requirement and every required addition. For each, record its source, implementation, integration, automated evidence, native/device evidence where needed, status, and next action. Use honest statuses: incomplete implementation is not merely Device-pending, and a parser/class/field/demo script is not a completed feature. Preserve missing requirements in the ledger until delivered; never delete them to improve completion numbers.

Prepare the approximately three-minute demonstration and submission materials showing convincing generation, personally relevant interaction, deliberate same-world change, immediate STOP/resumption, evidenced feedback, and adapted repeat, with outdoor/confined breadth. Label compression/replay. Do all authorized preparation before requesting any genuinely required publication/submission approval. Never claim upload, publication, recording, or a receipt without evidence.

Continue implementation and all unblocked verification until the full product and acceptance criteria are satisfied. If an external dependency truly prevents completion, identify the exact unmet requirement and concrete dependency, finish every independent task, and provide the smallest specific action needed. Do not use lack of phone evidence as a reason to stop coding unrelated missing features. Do not mark the goal complete while required implementation or acceptance evidence remains open.

Your final report must give the actual delivered behavior, requirement-ledger status, tests and native evidence, measured limits, remaining defects/blockers, known credit use, and precise demonstration/submission status. Do not replace implementation with reassuring prose.

Begin now: inspect the current tree, update the full requirement ledger, repair the repeat/revision/contract integration, and proceed through the remaining implementation, visual, device, and demonstration work. Preserve the full goal and all useful progress.
