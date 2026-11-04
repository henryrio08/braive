# Device verification handoff for Henry — November 4, 2026

Physical-device testing is performed by Henry on his device. This document
is the complete package needed; results are externally performed/pending
and are not claimed as verified by the backend work.

## What to install / restart

- Branch: `codex/wonder-recovery-pipeline` (commits `aa29d8a`, `b5ec620`,
  plus the anchor-operations commit on top; backend-only changes since the
  last app build, plus `ios/` changes from the already-merged
  `codex/wonder-generation-reliability` work).
- Backend: restart the backend from this branch (`node
  scripts/start-phone-test.mjs` under the existing cumulative approval, or
  the normal launcher). No database or ledger reset: the existing
  `backend/data/meta-test-approval.json` must be kept as-is.
- App: rebuild with the documented Windows path if picking up the merged
  iOS changes (`xtool dev build` in the `braive-xtool-build` container,
  project at the worktree root), then install the produced
  `xtool/Braive.app` as usual. Compilation was verified here on
  2026-11-04 ("Build complete!").

## Device checks relevant to these changes

1. Fresh generation (library-style indoor request with seated audience):
   confirm the scene reaches "Ready for device validation", passes native
   preflight (including the route audit naming any blocking node), reveals
   after the readiness blackout, and plays with automatic progression.
2. STOP during practice, pause, resume-or-quit, then completion: ratings,
   optional reflection/feedback, session saved to history, export works.
3. Adapted repeat of the saved session at the offered intensity.
4. Recovery behavior: if native preflight fails, the phone should show the
   specific backend stage/message and offer retry/revise/cancel with the
   practice details retained (REVISE keeps situation and boundaries).
5. Headset legibility: Speaking vs Listening status, stage prompt text,
   STOP hint readability in both landscape orientations.
6. Forest lobby on launch: composed clearing, no paid generation, trees
   grounded, clear space around the participant, sky/fog consistent with
   generated scenes.

## Known backend behavior to expect

- Small zone overflows may be accepted with recorded diagnostics
  (`accepted_defects` in the scene report); obstructed routes, missing
  support and broken references still fail.
- Localized failures repair via a scoped patch; semantic/structural
  failures via one bounded rebuild. The scene report's `recovery` field
  records which path produced the accepted scene.
- Failures keep per-attempt artifacts privately under
  `backend/data/rejected/` and `backend/data/live-test/`.
