# Wonder correction handoff: complete the full plan without feature cuts

Implement the complete Braive project and correct the deviations found in the latest local work. This is an execution request, not a request for another plan. Preserve useful work; do not restart the app from scratch.

Project: `C:\Users\rscot\Downloads\braive`

Read these files fully, in this order:

1. `C:\Users\rscot\Downloads\braive\docs\rehearsal-worlds-alignment-review-2026-11-04.md`
2. `C:\Users\rscot\Downloads\braive\docs\rehearsal-worlds-implementation-plan-2026-11-04.md`
3. `C:\Users\rscot\Downloads\braive\docs\WONDER_IMPLEMENTATION_PROMPT.md`
4. `C:\Users\rscot\Downloads\braive\docs\handoff\original-framework.txt`, `development-plan.md`, and `requirements-map.md` in that same handoff directory.

## Authority: no feature sacrifices

My latest instruction is: **Do not sacrifice any features from the originally provided ambitious plan.** Deliver the full original product experience and required rehearsal-world additions, applying my explicit corrections, including no user-provided photo selection/upload. Architecture and implementation methods can change; required capabilities cannot be silently removed, reduced to one hardcoded demonstration, or relabeled as optional/incomplete-but-done to satisfy a deadline.

The signature capability remains: a person can enter a situation that matters to them, practice within it, and deliberately reshape that same world for their next attempt.

Use a requirement ledger with source, implementation path, verification evidence, and actual status for every feature. Distinguish required product capabilities from suggested technical methods. Where planning documents disagree, follow my latest explicit instructions and the approved product outcome; record the reconciliation. A schedule fallback changes method/order, not the full required outcome. Do not use a passed deadline as permission to declare completion with missing features.

## First correct the starting point safely

At review, local `rehearsal-worlds` pointed to `019e9e15421ccd83e75cb18fadb0ee3ca66f70d1`; its new code and handoff files were uncommitted. GitHub main was `7fab391fa34f21f69eb4dc9a21025fdcb333bfd1`, 45 commits ahead including merges. The newest updated remote feature branch was `codex/reliable-scene-readiness` at `f860da1c99b8eb7695c1441e03d4195965b0c250`; the rehearsal-world branch was not published at inspection.

Inspect current state again. Preserve every tracked/untracked user change and the new plan files in a recoverable checkpoint, excluding credentials, ledger, transcripts, caches, build output, and private artifacts. Do not blindly stage everything, discard work, or hide it with automatic stashing. Fetch current main and safely reconcile the useful new work with the latest integrated code, preferably by a normal merge after preserving changes. Do not force-push, destructively reset, or revert to the older base.

Keep current head tracking, transport/idempotency, canonical construction, route, stage, storage, and speech fixes. Reconcile conflicting repair and visual-acceptance policies against the full approved requirements. Preserve hard actual executability, critical route/support checks, user boundaries, and spending controls. Merely turning off rejection of poor scenes does not establish visual quality. Avoid duplicate alternative implementations of fixes already upstream.

## Fix the concrete failures

1. **Connect spatial text.** `refreshHeadsetPanels()` currently has no callers, while the old headset HUD is hidden. Wire updates to real state/voice/countdown/pause changes. Keep prompts and STOP confirmation visibly rendered through the stereo optics. Resolve above-world SwiftUI dim/black layers that also obscure spatial text. Supply correct active-builder, revision-ready, error, and interruption copy. Verify actual pixels, not just class existence.

2. **Implement canonical world revisions.** Replace `growAudience()`'s direct root-node insertion at fixed global coordinates with typed patches to authoritative scene/plan/group state. Resolve positions from the generated scene, supports, clearance, viewer and route context. Maintain stable IDs, approved cast bindings, revisions, actual resource checks, and atomic acceptance. Retain the old frozen scene until the candidate succeeds. Persist the accepted scene and assets so recovery reproduces the edited world.

3. **Understand requested changes.** "Fewer people" must reduce the audience; "more light" must not add people. Handle direction, requested count, target group, boundaries, mixed/ambiguous instructions, and reductions as well as increases. Use structured model interpretation or a correctly bounded general parser, not a few broad substring checks. Apply appearance changes relative to the existing environment. Never invent an audience in a situation that does not call for one.

4. **Make deferred changes real.** `pendingNextAttemptChange` is assigned but never consumed. Persist and carry deferred task/path/timing changes into the next attempt; do not say a change was scheduled unless it will actually be applied.

5. **Preserve the world across repeats.** The old `adapt()` resets the session and regenerates from prose. Keep separate attempt records but reuse the canonical prior world, seed, identities, assets, and unchanged layout. Apply bounded approved adaptations and revalidate. Verify place identity after repeat and after checkpoint restoration.

6. **Deliver real textures and assets.** All current registry entries are GLBs, yet the image loader requires PNG/JPEG. A test accepting a GLB as a texture ID is incorrect evidence. Add a typed image registry, real vetted materials/reference assets, authenticated generated-asset delivery, bounded decoding, UV scale, caching and offline restoration; align model prompts/capabilities. Test actual successful loading, wrong-kind rejection, missing files, size limits, cache/recovery, and character-palette preservation. Per-scene generated dressing may remain optional; the required capability must still exist and work.

7. **Make assembly compilation repeatable.** Current macro output recompilation produces duplicate IDs. Separate source and expanded output or implement explicit idempotent expansion. Preserve IDs and semantics across validation, patches, persistence, and repairs. Check transforms, support, resource expansion, and insufficient placement space. Preserve the general node/asset path and all three construction families.

8. **Finish the opening and full state machine.** Implement setup -> headset confirmation -> visible forest -> START -> intake. Define and verify every normal/exception transition in the plan, including stacked pauses, ambiguity, repeated commands, STOP before a run versus during a run, active edit cancellation, explicit RESUME, feedback/storage failures, and crash restoration.

9. **Earn the visual and breadth claims.** Inspect real native renders, curate components/materials, verify fronts/proportions/seating, and improve actual generated scenes. Complete the six varied descriptions, including held-out examples, plus the full original situation/interaction capabilities. Record real render evidence. A generic macro or additional forest objects alone is not proof of compelling scene generation.

## Full delivery and verification

Keep the entire app-open-to-app-close loop: consent/setup, optical calibration and headset readiness, polished local forest, voice intake/ability/boundaries, optional authorized history, generated situations, coherent automatic progression/movement, natural relevant conversation, immediate STOP, independent pauses, same-world editing, optional ratings/reflection/grounded feedback, durable records and CSV, adapted repeats, deletion and recovery, manual controls, and all specified failure paths. No user-photo feature. Preserve nonclinical framing and evidence-grounded feedback.

The local review passed type checking and 51 focused backend tests, but found the functional gaps above. Add meaningful regression coverage for those gaps, not tests that simply accept the faulty implementation. Build the current integrated tree and run the appropriate existing checks. Keep Xcode source/resource membership consistent with SwiftPM/xtool when adding files. Show the actual headset text and appearance; validate two complete phone loops, one accepted and one cancelled edit, persistence/restoration of a changed crowd, and a same-place adapted repeat. Profile sustained performance. Reconcile contradictory evidence statements about installation.

Use the established `braive-xtool-ready` container and the working Windows Apple Devices connection. Read `docs/PHONE_TEST_HANDOFF.txt`, `docs/xtool-windows.md`, and the updated build section in `docs/active-work.md`. A prior read-only check confirmed xtool 1.24.0, Darwin SDK present, saved Apple sign-in active, and successful pairing validation through `host.docker.internal:27015`. Docker named-pipe access needed scoped approval; the approved check succeeded. Do not declare the environment unusable because an unapproved Docker command was denied. Do not reinstall/reset trusted setup unnecessarily. Verify current state and use the existing compile/install procedures; launch by tapping the installed icon when programmatic launch is unavailable.

Do not run concurrent builds or paid test servers against the same mutable workspace without coordination. Check for other active workers/processes and preserve their useful work. No new subagent or expensive parallel provider run is required by this prompt.

## Time, credits, and completion

Read current Chicago time. Implementation timestamps are latest completion deadlines; proceed immediately when ahead. Protect recording/submission time and report schedule risk honestly. Do not turn an elapsed deadline into a feature cut or a false completion claim.

The previously reported US$69.77 was a remaining balance, not a fresh allowance for this continuation. Reconcile actual remaining credits including coding spend and uncertain reservations. Preserve the backend ledger/cap, bounded launcher, and the project's budget safeguards. Use retained fixtures and offline tests before paid generation. Do not create accounts, rent GPUs, add subscriptions, or reset the ledger.

Keep evidence concise and current. Complete demonstration materials and recording; obtain only genuinely required external access/actions. Keep working on all unblocked requirements. Your final report must include the requirement ledger, actual verification/render/device evidence, remaining defects/blockers, credit usage where available, and precise submission status. Do not mark the goal complete while required features or acceptance evidence are missing.

Start with the old-base reconciliation and the broken headset presentation, then implement the canonical persistent editing/repeat path while completing all remaining requirements. Preserve useful code; complete the intended product.
