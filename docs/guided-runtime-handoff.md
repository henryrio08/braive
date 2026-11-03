# Runtime handoff to BraveWork — November 2, 2026

Henry assigned the Codex on BraveWork to take over scene generation and visuals after these changes. The current branch is `codex/bundled-lowpoly-library`. Commit `1517bb6` implements automatic flow, safer pause confirmation and the approved softer characters. Merge `8d11d55` integrates BraveWork audit commit `c4e7061`, including its audio, preflight, feedback, reveal and persistence fixes. Both were pushed immediately. The final documentation/version commit is also pushed. Fetch before work and push every commit, as requested.

## Product correction

The command-driven phone run was rejected: too many instructions and small actions, frightening characters, and an unsolicited resume. New experiences unfold automatically. There are no WALK/SIT/ASK/NEXT requirements, no topic-specific generators, and no fixed practice fallback. Quiet experiences require no dialogue. Normal speech reaches an approved character only during an authored conversation window. Intake, readback approval and global STOP remain voice controls.

Both new ExperiencePlan and ScenarioSpec declare `progression: guided`. Stage action lists are empty, each nonterminal stage advances by time or motion completion, and the completed terminal stage is separate from ongoing activity. Natural windows use `conversation_target: Character.id` and timed completion. The active HUD is quiet: status/countdown and a small STOP hint. Legacy stored command scenes remain readable.

The quit question no longer speaks YES/NO to itself. Recognition discards stale audio ranges, confirmation arms only after prompt completion and a short echo tail, and only an exact fresh answer resumes/ends. Multiword playback echoes are filtered while immediate standalone STOP remains available. Other interruptions keep their independent pause reasons. This closes reachable false-confirmation paths; the reported physical failure has not yet been retested with this build.

## Approved visual direction

Henry explicitly selected the four softer, stylized Kenney Mini Characters after native-renderer previews. New generation uses `character.base.soft_adult_01` through `_04` with original palettes and rigs, normalized to about 1.65m. The two rejected casual adults and original mannequin are retained for old records but excluded from new generation. All 355 source/runtime GLBs remain byte-identical; the palette PNG dependency is locally validated and hashed. No character remeshing or invented assets were introduced. Keep logo C.

Scene quality still belongs to the next pass. Current checks do not prove support/furniture fit, swept route clearance, semantic completeness, later-stage composition, physical comfort or arbitrary new simulation mechanics. The generated library render is simple and sparsely furnished; passing preflight is not a realism claim. Use the existing `visual-construction-design.md` as design context and preserve Henry's latest automatic-experience direction. Do not restore a spoken-command checklist.

## Evidence

- Combined backend type checking and 51 tests pass; seven importer tests pass.
- Portable native checks: 46 scenario/movement, 36 voice-turn and 29 speech-coordination assertions pass. These are offline checks, not microphone evidence.
- Native simulator build and signed iPhone build pass. Strict signature verification passes. The 0.3 (3) app contains 355 GLBs and no private generated-scene replay.
- A fresh provider-authored library request succeeded in 60.129 seconds as measured by the caller, using three model requests and no repair. It generated 38 nodes and `soft_adult_02` for Maya. Its stages are arrival, automatic walk, 55-second natural conversation window and completed; all action lists are empty.
- That exact output passed actual native both-eye preflight and rendered entrance, travel and destination frames. This was explicitly offline review of generated data. It was not a physical-phone walkthrough.
- A separate offline execution of that exact output through ScenarioRuntime/ViewerMotion reached all four stages and the planned destination with zero injected speech commands.
- The shared development ledger now contains 88 entries, $5.231586 charged/reserved and $44.768414 remaining of Henry's same cumulative $50 allowance. Preserve charges and uncertain reservations. No additional allowance was created; ordinary `.env` spending remains disabled.

Private generated output is in ignored `backend/data/guided-live-generation.json`; it is not a shipped preset. Simulator render results are in the app's Documents/ScenarioReview folder. Earlier review PNGs can remain there; use the current `result.json` frame list to distinguish this run. Normal project generation excludes `ios/Braive/Review`.

## Installation and next physical check

The signed build is `/tmp/braive-lowpoly-phone/Build/Products/Debug-iphoneos/Braive.app`. Device `00008150-001428140EDB401C`, bundle `edu.uiuc.braive`. Apple rejected the install as unavailable; Henry then confirmed the phone is disconnected. It still has 0.2 (2), so do not describe the guided fix as installed or phone-verified.

The matching backend is running through `scripts/start-phone-test.mjs` on 8788; health passed after restart and it had zero new model requests. The completed isolated 8789 test server and old phone backend were stopped. The Mac returned to campus address `10.194.238.214`; recheck interfaces before pairing. A private `/tmp/BraiveLocalPairing.json` was prepared but not copied to the disconnected phone. Never print/commit its secret. Install with existing app data preserved, update pairing to the actually reachable address, then launch.

First physical check after installation: describe any suitable practice, approve the readback, and let its movement happen without commands. Say STOP, wait without answering and verify it remains paused; deliberately say NO to resume. During a conversation window, speak normally. This combined phone check, sustained performance and optics remain pending. Do not ask Henry to repeat WALK/SIT/ASK sequences.
