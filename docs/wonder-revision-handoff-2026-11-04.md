# Braive revision handoff — current state, November 4, 2026

Working branch: `codex/wonder-generation-reliability` from integrated main
`6daf896`. Earlier work (backend route audit, repair accounting, forest
lobby, containment semantics) is merged in main via PRs #5–#7. This file
describes the present state; older play-by-play is in git history.

## Generation reliability (verified live)

Root causes found across retained failures, each fixed generally:

- Backend never checked routes against solid geometry (native-only check).
  Construction now sweeps executed routes against transformed bounds with
  walk/run support sampling, naming path, segment, blocking node and gap.
- `inside` both placed and contained, relocating authored objects (island).
  `within` now checks containment at the authored position without moving;
  `inside` keeps legacy placement, including zero-offset placement at a
  target center. Henry's island offset `[0,-1.9,-12]` and waypoint
  `[0, 0.35, -20.5]` pass on the attached scene.
- Window assets are thin in X / wide in Z at rest, contradicting the generic
  forward-axis assumption; the builder yawed them through the wall. Zone and
  containment diagnostics now report rest bounds, authored rotation/scale,
  transformed bounds, per-axis overflow and the responsible relation;
  capabilities and builder instructions state the rest-bounds contract.
- Repair starvation and opacity: planning (author/editor) and construction
  (builder) each own one bounded repair; provider failures release the
  device repair; missing/expired/used repairs have distinct messages;
  rejected candidates are retained per job under `backend/data/rejected/`.
- Dangling route-anchor annotations no longer fail valid routes (trajectory
  is authoritative; the annotation is dropped with a warning).
- Builder reasoning experiment: one medium-reasoning builder run failed on
  requirement bookkeeping at similar cost, so the default stays low;
  `BRAIVE_BUILDER_REASONING` can repeat the experiment.

Fresh live evidence (real author → editor → builder, bounded repair as
noted; artifacts in `backend/data/live-test/result-<scenario>-<job>.json`):

| Attempt | Scenario | Outcome | Calls | Settled |
| --- | --- | --- | --- | --- |
| library | indoor library proposal | success (repaired) | 4 | ~$0.73 |
| swim | cove-to-island swim | success (repaired) | 4 | ~$0.53 |
| library | indoor library proposal | success (repaired) | 4 | ~$0.79 |
| swim | cove-to-island swim | success (repaired) | 4 | ~$0.65 |

The last three are consecutive. All successes used the one construction
repair; no first-pass successes in this set. Earlier failed attempts
(window rotation, floor/window zone overflow, swim body depth, palm/zone
height, dangling anchor, one medium-reasoning coverage drop) are preserved
in the same artifact folder and drove the fixes above. Backend validation
enforces preservation of the approved stages, cast, props, timing and
movement on every accepted result; character counts above come from the
validated scenes.

Ledger: 58 entries, $9.71 charged of the $50 file cap, $40.29 remaining
(includes one retained $1.10 unsettled reservation; nothing was reset).
The $50 file cap is superseded as policy per the project prompt; it was not
reached and no funds were added.

## UX and forest (implemented; compile-verified)

- Forest lobby: deterministic composed clearing (foreground tufts, five
  clustered tree groups, background tree line, grounded rocks, clear
  participant area), sharing the generated-scene procedural sky, fog,
  lighting environment and posterized style; sun casts shadows. No paid
  call. Grounding uses measured asset bases; participant clearing and a
  forward corridor stay empty by construction.
- Phone: flat setup presentation, connection readiness always visible,
  discoverable Add details during generation, live backend stage text.
- Headset: Speaking is now distinguished from Listening, active stages
  surface authored speech labels, error cue excerpts what happened,
  REVISE keeps situation/boundaries and asks only for changes, cues are
  12 pt with higher contrast. STOP/pause, ratings, reflection/feedback,
  history/export and adapted repeats are behaviorally unchanged.

## Recovery pipeline revision (this branch)

- Acceptance policy (`backend/src/acceptance.ts`): zone defects carry
  normalized severity (overflow against the larger of 0.3 m or 5% of the
  containing dimension). Soft defects are accepted only under an individual
  severity limit (1), a per-category count budget and a total severity
  budget, and are recorded in `construction_report.accepted_defects`.
  Severe or accumulated defects stay hard; valid content cannot dilute
  them. Routes, support, references and requirement coverage remain hard.
- Deterministic corrections run before any model repair: an unsupported
  texture reference with an authored color fallback is dropped and the
  color retained, recorded in `construction_report.corrections`. Raw
  candidates are preserved separately (per-attempt artifacts).
- Scoped repair (`backend/src/repair-patch.ts`): localized failures repair
  through a typed SceneRepairPatch against a hashed base candidate with a
  backend-computed scope (violations plus parent/child, support, anchor,
  relation, route and zone dependencies). Stale, out-of-scope, oversized
  or unsupported patches are rejected; `remove_node` requires proof that
  nothing necessary depends on the content. Structural failures remain
  eligible for one bounded complete rebuild. The repair role uses Wonder
  with its own instructions, schema and 7000-token limit; the generic
  system prompt no longer forbids patches for that role.
- Live evidence on this branch (spend-conscious): one library success via
  the bounded rebuild path (~$0.82 settled). Three swim attempts failed
  legitimately (water/zone sizing and containment slips) and were
  diagnosed from retained artifacts rather than retried blindly; a fourth
  was terminated early at the user's request to conserve credit. Offline
  replay of 13 retained candidates shows the router behaving as designed:
  fit/zone-only profiles are patch-eligible (with usable computed scopes),
  reference/coverage profiles correctly take the rebuild path. A live
  patched success is therefore not yet demonstrated; the patch mechanism
  is covered by unit and chain tests plus this offline replay.
- Ledger at last sync: 77 entries, $13.14 charged of the $50 file cap,
  $36.86 remaining, including retained unsettled reservations. No further
  live runs were made after the conservation request.

## Verification status

- Backend: full suite passing (151/151: `npm --prefix backend test`),
  `tsc --noEmit` clean, including acceptance, deterministic-correction,
  scoped-patch, omission and repair-allocation regression tests. New regression coverage: island
  containment/placement, rotated-asset diagnostics, dangling anchors,
  planning-vs-construction repair allocation, doorway/transformed/relative
  routes.
- Native compilation: verified on Windows via Docker xtool
  (`xtool dev build`, Swift 6.4.1 + Darwin SDK 27.1): "Build complete!",
  `xtool/Braive.app` produced, after both the merged UX work and this
  branch's Swift edits. One known benign warning was fixed (feedback task
  capture).
- Not available here: simulator/device playback, stereo renderer captures,
  and physical-headset checks (the paired iPhone is locked/asleep and Mac
  mini access is denied from this shell). Native preflight/playback of a
  generated scene remains a device task: install `xtool/Braive.app`, run
  the DEBUG PreflightAudit/StageAudit/`--render-scenario-review` paths.
  These are unverified, not passed.

## Running

```sh
npm --prefix backend run check
npm --prefix backend test
node scripts/live-generation.mjs            # BRAIVE_LIVE_SCENARIO=library|swim
node scripts/start-phone-test.mjs           # live phone testing (test mode)
```
