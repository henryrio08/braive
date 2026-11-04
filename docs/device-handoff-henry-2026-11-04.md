# Device verification handoff for Henry — November 4, 2026

Physical-device testing is performed by Henry on his device. This document
is the complete package needed; results are externally performed/pending
and are not claimed as verified by the backend work.

## What to install / restart

- Branch: `codex/wonder-first-pass-readiness` (on top of merged
  `7523a92`). This branch changes the BACKEND only; the native app tree is
  identical to the already-built one, so no app rebuild is required for
  these changes (rebuild only if you also pull other native work).
- Backend: restart the backend from this branch (`node
  scripts/start-phone-test.mjs`, or the normal launcher). No database or
  ledger reset: keep `backend/data/meta-test-approval.json` as-is.
- Native compilation of this exact native tree was verified on
  2026-11-04 via Docker xtool ("Build complete!"); Docker was unavailable
  in the final session, and no native code changed since.

## What changed (first-pass readiness revision)

- Permissive visual acceptance by default: zone_fit/fit/placement/
  orientation/clearance findings are recorded diagnostics, not rejection,
  with no defect-count budget. Outdoor grouping zones are layout metadata
  (higher tolerance); interiors/enclosures, explicit clearance insets,
  cannot-fit containment, blocked routes, missing support and broken
  references remain hard. `BRAIVE_VISUAL_STRICTNESS=standard` restores the
  stricter historical budgets for developer inspection.
- The backend now compiles the executable stage graph from the approved
  plan (order, durations, completions, conversation targets, terminal
  step, move_viewer binding for the uniquely bound route). The builder
  only supplies content, route geometry and preserved step operations.
- Deterministic preparation (recorded in `construction_report.corrections`,
  originals preserved): time-zero waypoint → route origin; missing support
  and subject-contact anchors materialized; containment anchor references
  dropped; support offsets derived from authored placement at the support
  (XZ); faces relations retargeted to the viewer; requirement flags
  derived from approved bindings; protected-character surface overrides and
  unsupported texture references removed; operations naming missing nodes
  dropped.
- Repair feedback now evaluates the candidate AFTER preparation and stage
  compilation, so it no longer contains spurious stage complaints.

## Verified here (2026-11-04)

- Backend suite 159/159, `tsc --noEmit` clean.
- Henry's recovery fixture (both rejected swim candidates, both corrected
  candidates) replayed through the production preparation + stage-compiler
  + validation path: all four accepted; the rejected candidates needed no
  model call, and the swim route, positive-time waypoints and destination
  survive unchanged.
- Retained failures replayed offline: the library window candidate and a
  seated-audience candidate now pass locally; one swim candidate now fails
  only on a genuine route blockage (swim body intersects shallow sand),
  which stays hard.
- Fresh live generations this session (all attempts reported):
  library stationary conversation succeeded after initial generation +
  local preparation (`recovery=deterministic`, no model repair); indoor
  hallway walk and two swim attempts succeeded via one bounded rebuild
  each (first candidates had genuine anchor/route geometry errors); one
  swim attempt failed after its rebuild on outdoor-zone overflows that the
  revised policy now accepts — its exact candidate passes offline under
  the shipped code. A final swim attempt was terminated early at the
  user's credit-conservation request and is not counted.

## Device checks relevant to these changes

1. Fresh generation (any request): confirm the scene reaches "Ready for
   device validation", passes native preflight, reveals after the
   readiness blackout, and plays with automatic progression. Travel stages
   should start moving automatically; stationary stages must not move.
2. A swimming/water request and an indoor walking request, end to end.
3. STOP during practice, pause, resume-or-quit, then completion: ratings,
   optional reflection/feedback, session saved to history, export works.
4. Adapted repeat of a saved session.
5. Recovery behavior on failure: concise message, retry/revise/cancel with
   practice details retained.
6. Forest lobby on launch: composed clearing, no paid generation, clear
   space around the participant.
