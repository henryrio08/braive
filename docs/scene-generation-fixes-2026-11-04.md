# Scene-generation fixes — November 4, 2026

Branch: `codex/scene-generation-fixes`, based on main `67132bb` (including PRs #11 and #12). Main was fetched and its remote head independently checked again before finalizing. The open root checkout and its uncommitted work were preserved.

## Implemented

- The shared path/route body-depth range is 0.5–2.2 metres; standing defaults remain 1.6 metres. A declared envelope is never shrunk to make a collision pass.
- Support-position inference applies only to offsets whose three components are within 0.000001 of zero. Explicit nonzero offsets survive transformed parents and repeated preparation.
- Guided world routes are checked in compiled stage order from the preceding viewer endpoint, carrying position through stationary stages. Explicit starts must match within the existing native tolerance, `max(0.35, radius)`. Actor origins and existing relative-route execution behavior remain separate. Waypoints, times and destinations are preserved.
- Wonder's draft schema and instructions now agree with the stage compiler: stage content and routes come from the builder; stage mechanics and omitted review/content defaults come from code. Full playback validation still runs after compilation.
- The existing no-automatic-paid-scene-repair policy and native bounded-segment fix remain intact. A floor beyond the downward support probe is an additional native negative control.
- Model telemetry identifies the job, source, role, logical call/transport attempt, provider finish reason, schema outcome and timing. Local preparation phases report their own validation outcomes. New reports contain identifiers/codes/counts, not request text, model content, credentials or remote error messages.
- Authenticated `/v1/connection` adds `backend_revision`, `automatic_scene_repair` and `visual_strictness` while retaining `status`. The app records backend readiness and native acceptance/rejection separately, retaining the original native rule and bounded route details when repair is disabled.
- Native version is 0.4 (8). Xcode and the xtool wrapper stamp the source revision; About and audit reports expose build identity. Deleting local data includes preparation diagnostics.

The public generation result remains `{plan, scene, audio}`. Existing saved sessions need no migration.

## Verification performed

- Backend typecheck clean; **178/178 offline tests pass**. The complete suite was run with normal local file/loopback access because the restricted host denied temporary-ledger replacement and local HTTP connections.
- New coverage includes floating-body clearance versus solid intrusion, explicit offsets/transformed parents, correction idempotence, sequential L-shaped walks, real second-leg blockage, mismatched starts, compiler-owned draft omissions, concurrent diagnostic isolation/redaction, provider truncation/transport-retry accounting, and persistent verification budgets.
- Full arm64 iPhone app compilation/packaging passes using the existing Windows Docker xtool environment. The bundle contains all 355 GLBs and six WAVs. Foundation-only native preparation-diagnostic and storage checks pass.
- Retained successful library (`b1422ce0`), swim (`5fac233e`) and indoor-walk (`935a6fe1`) results pass the production backend replay path. Two retained blocked-route controls (`0620777b` swim and the first `935a6fe1` walk candidate) still reject with `route_clearance`. Input hashes remain unchanged. A broader replay accepts 20 of 26 historical rejected candidates; the remaining six fail genuine executable/reference/audio checks.
- A newer library wire-only result (`2131996d`) could not receive complete replay certification because its internal approved editor draft was not retained. The replay tool reports missing evidence instead of reconstructing that draft or counting the input as a passing negative control.
- **No live provider calls were made. No authoritative ledger was reset or charged.** Model transport tests use fake responses and isolated temporary ledgers.

## What remains unverified

The user confirmed that this Windows workspace has no Mac connection. A paired iPhone 14 on iOS 27.0.1 is available; it is not the planned iPhone 17. Existing automatic launch methods fail with `DebugserverClient.Error.unknown` or an unavailable debugserver/developer disk image. Compilation is not execution of SceneKit/Metal controls.

Actual native `--preflight-audit` and retained-scene `--generated-audit`/stage review, fresh generations, the 180-second readiness target, and physical reveal/motion/STOP/conversation/save/export remain pending. The US$5 live verification allowance is untouched until the native gates can run. Installation status should be checked independently on the intended device; the prior read-only listing showed build 5.

## Reproduce offline

From the branch root:

```powershell
npm --prefix backend run check
npm --prefix backend test
```

From `backend`, replay a retained candidate without changing it or contacting a provider:

```powershell
node --import tsx ../scripts/replay-scenes.ts <retained-candidate.json>
node --import tsx ../scripts/replay-scenes.ts --expect-rejected <blocked-route-candidate.json>
```

The script requires the exact retained approved experience. For wire-only successful results it looks for a rejected artifact with an identical approved plan in the sibling `rejected` directory; it never invents a missing editor decision.

On a Mac, build the Xcode project normally. For the existing Windows container and this isolated checkout:

```powershell
$nativeSource = (git rev-parse HEAD).Trim()
if (git status --porcelain --untracked-files=normal) { $nativeSource += '-dirty' }
docker exec -e "BRAIVE_SOURCE_REVISION=$nativeSource" braive-xtool-ready sh -lc 'cd /work/.build/worktrees/scene-generation-fixes && python3 scripts/build-native.py'
```

`scripts/build-native.py` stamps the revision before invoking xtool; use it instead of calling `xtool dev build` directly. The output is `xtool/Braive.app`. Signing/installing still uses the existing Windows Apple Devices path; do not uninstall the previous app or erase its data.

## Bounded live rollout after native checks

1. Run the DEBUG native preflight controls, requiring a passed report that includes `route_segment_and_support_controls`, then replay the retained conversation, swim and walk through native load/stage review. Keep real blocked routes rejected.
2. Build/install the same source revision used by the backend. Check app/backend identities in About and the diagnostic reports. Keep `BRAIVE_AUTO_SCENE_REPAIR=false` and permissive visual diagnostics.
3. Point `BRAIVE_BUDGET_LEDGER` to the existing authoritative ledger when using a separate worktree. Keep the key and pairing secret in the existing ignored configuration. Never create a replacement ledger for this verification.
4. Start `node scripts/start-phone-test.mjs --verification`. For an explicitly requested synthetic scenario, `node scripts/live-generation.mjs --verification` forwards the same fixed verification allowance. Native checks must precede either live route.
5. The ledger persists verification group `scene-generation-fixes-2026-11-04` with an incremental US$5 cap. Prior charges remain unchanged, uncertain calls retain their reservations, and transport retries/restarts share the same group. A different limit for the same group is rejected; the total existing ledger cap also applies. Ordinary launches do not activate this verification group.
6. Run one normal freeform conversation, swim and indoor-walk request. Each must reach native acceptance within 180 seconds without deliberate pauses, using one logical builder generation. Existing bounded planning correction and one temporary-provider transport retry remain separately visible and charged; invalid scene output does not buy a repair.
7. Verify reveal, correct stationary/moving behavior, automatic completion, STOP freezing time/motion and deliberate resumption; relevant conversation; one complete save/export flow. Correlate job IDs and builds across backend and phone records. Report every failed attempt. Stop at the verification cap and leave any missing acceptance evidence explicit.
