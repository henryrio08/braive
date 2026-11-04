# Rehearsal-worlds implementation evidence — November 4, 2026

Branch: `rehearsal-worlds` (from current `codex/braive-work` HEAD, which descends from `main`; all pre-existing uncommitted changes preserved).

Chicago time at start: 2026-11-04 06:59 CST. Submission deadline: 20:00 CST.

## Implemented

### Backend
- `inside` containment is explicit: `containment_behavior: preserve_position` checks containment at the authored position without moving the subject; `place_by_offset` (and the legacy absent value) moves the subject origin to target center plus offset, where offset = intended world position minus target center. Failure messages name the responsible relation, the resulting world position, and measured bounds. Zone-fit errors name the placing relation and position. Builder/repair guidance in `docs/handoff/scene-authoring-prompts.md` explains both behaviors with the retained island/cove offset `[0,-1.9,-12]`.
- Empty `asset_id` values are rejected at scene validation with an explicit message.
- Bounded assembly macros lower into existing `SceneSpec`/`ConstructionPlan` contracts: `seating_rows`, `enclosure` (walls with a real opening), and seeded `scatter`. Macros generate environment geometry only; cast, task, and stage semantics stay authored. The general individual-asset/node path is unchanged.
- Registered texture references: `material.texture_asset_id` must name a bundled manifest asset; `texture_scale` must be positive. Unregistered IDs are rejected.
- Saved scenes persist `construction_plan` (including macros and containment behavior) with the session record, so restoration does not require regeneration.

### iOS
- Headset text is rendered in-world: flat textured panels (`HeadsetPanels.swift`) attached to the head node, drawn through both eye cameras and the same lens correction as the world — main panel ~2.5 m ahead, small low status panel. No extruded letters, no transcript wall. The SwiftUI eye HUD now shows only outside the headset (`headsetReady == false`); pause visibility is preserved through the in-world paused copy.
- Forest clearing (bundled, no network/generation): warm directional light, fog depth, grass floor, worn earth path, layered bushes/ground patches, rocks, near trees, and a distant tree ring. The centre stays clear for the welcome panel.
- Active same-world edit: during practice, "hey builder" or an audience/lighting request freezes the run (independent `builder_edit` pause; stage, remaining timer, pose, and conversation target preserved), collects the change with THAT'S ALL, applies bounded revisions in the same loaded scene — audience growth 8→16 seated library characters with chairs, warmer/brighter or calmer/dimmer environment — speaks a short description, and waits for RESUME. Task/route/duration changes are recorded for the next attempt and explained as such. STOP during the edit still ends the attempt through the existing confirmation; cancelling via RESUME retains the exact frozen run.
- Registered texture loading in `World.material`: bundled image assets only, decoded bounded to 1024 px, cached (24 entries), UV repeat from `texture_scale`; failure leaves the finished library/color appearance.

## Verified
- Backend type check: clean (`tsc --noEmit`).
- Backend tests: 86 total. New regression coverage: island/cove `preserve_position` pass and relation-named failure, legacy place-by-offset placement at zone center, empty asset ID rejection, seating-rows macro lowering, enclosure + scatter macro lowering, registered vs unregistered texture references. Focused files pass (construction/contracts/scenarios: 50/50).
- Remaining failures: `test/phone-server.test.ts` (2 tests) — the spawned loopback server is blocked in the managed sandbox; same environment class as the historical 80/81 result. Not a product failure observed here.
- Native build: `xtool dev build` in `braive-xtool-ready` — **Build complete**, `Braive.app` written. One patched string-literal defect was found by this build and fixed.
- Phone-test server: started with the approved bounded launcher; `/health` returns ok with the ledger intact (US$50 cap, US$17.98 charged/reserved of record). No Meta requests made yet (`meta_requests: 0`). The Apple USB Ethernet address (172.20.10.2) is not currently active; Wi-Fi 10.192.44.3 is the reachable address to try from the phone, or restore the USB network path.
- Programmatic device launch is blocked: `idevicedebug` needs a DeveloperDiskImage for iOS 27.0.1 that the container does not have. Per the phone handoff, the app launches by tapping its icon; launch-argument audit modes therefore remain human-triggered.
- Device install: `xtool dev run --usb` reached Signing, Packaging, Connecting, Installing, and Verifying 100% on the connected iPhone (USB composite device present). The build is on the phone; in-viewer visual inspection still needs a person wearing the viewer.

## Additional offline verification

- Swift logic checks compiled with the container's Swift 6.4.1 against the real app sources pass: sky model, loading tips, post-session ratings/saving (13 rating cases, null distinct from zero), speech coordination (29 checks, STOP confirmation), and storage (idempotent save, CSV escaping, reflection file, durable recovery). Scenario-runtime checks need Darwin `simd` and remain device-side.
- Submission materials prepared in `docs/submission-pack-2026-11-04.md`; nothing submitted.

## Not yet verified (explicit)
- Physical-device install, in-viewer readability of the new panels, forest/audience visual quality through the optics, 3-minute 16-person profiling, and two consecutive complete phone practice loops require the connected iPhone and the approved phone-test server. No live Meta calls were made in this session; the backend ledger is untouched ($50 cap, $17.98 settled of record at last read, $32.02 remaining).
- Development-time native render gallery (appearance/character/scenario review launch modes) still requires a device or simulator run.

## Budget
No provider calls were started. Existing backend ledger preserved; do not reset. Project envelope ($69.77 reported remaining) unspent in this session apart from coding-model usage.
