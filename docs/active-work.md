# Current coordination — November 4, 2026

Rehearsal-worlds direction is implemented on branch `rehearsal-worlds` per docs/rehearsal-worlds-implementation-plan-2026-11-04.md: explicit inside containment behavior with the island/cove regression fixed generally, bounded assembly macros, registered texture references, in-world headset text panels, polished bundled forest clearing, and bounded same-world active edits (audience 8→16, lighting) with RESUME. See docs/rehearsal-worlds-evidence-2026-11-04.md for verified vs unverified status. Older contradictory flow/scene notes below are superseded where they conflict.

# Current coordination — November 4, 2026

## Current Windows build/deployment status

The Windows xtool route succeeded on November 3: the project compiled, signed, installed, and verified on the iPhone. Read [PHONE_TEST_HANDOFF.txt](PHONE_TEST_HANDOFF.txt) and [xtool-windows.md](xtool-windows.md) before treating older environment notes as current blockers. On November 4, read-only checks confirmed `braive-xtool-ready` is running, xtool reports version 1.24.0, `swift sdk list` reports `darwin`, `/work/Package.swift` and `/work/xtool.yml` exist, and `xtool auth status` reports **Logged in**. No credentials are recorded here.

Use `docker exec braive-xtool-ready sh -lc 'cd /work && xtool dev build'` for compilation. Signing/installation uses `USBMUXD_SOCKET_ADDRESS=host.docker.internal:27015 xtool dev run --usb` in that same container, with Apple Devices for Windows and an unlocked/trusted iPhone. Avoid the previously failed USBIPD deployment route. Tap the installed app's icon; a separate xtool launch failure is not a build or installation failure.

A default restricted command on November 4 could not open the Docker named pipe; the same read-only inspection succeeded through command approval. A Docker access denial does not establish a missing SDK, expired xtool login, or Swift compilation failure. Request scoped approval for the necessary Docker operation. These checks verified the environment and saved login; they did not rebuild or install the currently changing source.

## Earlier coordination notes

After a real generation exceeded the former two-minute ceiling, the phone and backend now allow ten minutes for the whole generation/readiness attempt, including the one shared repair and native loading. The authoring prompt targets a complete ordinary scene in a few minutes through concise, coherent construction rather than sacrificing task fidelity or visual checks. This is a target until measured on Henry's device. Henry's separate branch owns UI and repeat-transcription confirmation changes; do not overwrite those while merging.

November 3: Henry requested removal of readback/BEGIN PRACTICE and an orientation-independent black view until headset readiness. That change is on `codex/streamlined-intake`, to be pushed to main before phone installation. Timing work belongs to the other agent; its latest published change must be included in the combined phone build, without revising that logic here.

The partner's contextual loading tips, post-session save/feedback/repeat fixes, and generation cancellation fixes are integrated into BraveWork; see [loading-tips.md](loading-tips.md) and [post-session-audit.md](post-session-audit.md). The later branch-wide [consistency review](consistency-review-2026-11-02.md) is integrated too: audio mixing, deletion/recovery, consent, native preflight and import validation fixes. Its route support improvement is combined with BraveWork's explicit object contact-point check. Scene generation, visual construction and model prompts remain on BraveWork.

Historical November 2 check: xtool detected the iPhone 14 through WSL and validated pairing, but Braive was not installed at that time. The SDK, Apple sign-in, SwiftPM configuration, and successful installation were subsequently completed on November 3. Use the current Windows status and deployment handoff above; the former missing-SDK/login/project-format blockers are resolved.

Runtime handoff: the automatic-flow, pause-confirmation and approved soft-character changes are finished and pushed. Henry has assigned further scene generation and visual work to the Codex working on BraveWork. See [guided-runtime-handoff.md](guided-runtime-handoff.md) for exact evidence, limitations and installation status. Do not continue overlapping scene/visual work from this chat.

`codex/braive-work` has integrated `89fc366` and pushed the audit follow-up as `5cb7522`: stage/motion-owner validation, native route/stage checks, fade/material semantics, telemetry, typed dispatch, and checkpoint recovery. It now owns construction and visual implementation: measured bounds, spatial relations/routes, procedural sky, gentle context-adjustable shaders and updated authoring schemas. See [implementation evidence](visual-implementation-2026-11-02.md) and the [runtime follow-up](runtime-followup-2026-11-02.md) for verification limits. This Windows checkout has its own user-approved $50 cap; do not infer that it shares the Mac ledger file.

Henry clarified the product direction: fears/ability/boundaries become automatically unfolding sights, sounds, movement and events. No spoken navigation or recurring “what do you want to do?” questions. Routine stages stay quiet. Action experiences have no character dialogue; any required dialogue makes the whole experience conversation, with automatic physical movement retained where needed. Preserve the partner's STOP confirmation, natural speaking windows and approved soft character palettes.

The partner can take the three-minute demo story/script, submission description and presentation materials, or review copy/visuals and report findings. Useful independent files are `docs/demo-script.md`, `docs/demo-walkthrough.md` and new submission notes/assets. For code work, agree a separate area/branch before editing the runtime and backend files involved in the phone test.

The partner branch is `codex/bundled-lowpoly-library`; this checkout works on `codex/braive-work`. Fetch each other's changes periodically, especially before committing; push each commit immediately. Audit commit `c4e7061` is merged as `8d11d55`; guided/pause/character work is `1517bb6`. The selected mark is C (lowercase b with forward chevron). The visual source is version 0.4 (4), not yet built or installed. The partner's signed 0.3 (3) was not installed. An earlier phone check reported 0.2 (2), while the November 2 USB app listing showed no Braive entry on the connected phone. Session data was preserved during earlier development; this USB check did not change phone data.

Henry explicitly expanded the cumulative Meta allowance from $5 to **$50 total**. Preserve all existing ledger entries, settled charges and uncertain reservations. The ignored shared ledger remains authoritative. Ordinary unattended provider spending remains disabled; bounded tests retain the idle activity window.
