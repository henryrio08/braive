# Wonder product revision handoff — November 4, 2026

Branch: `codex/wonder-product-revision` from `origin/main` (`703ae6b`).
Worktree: `.build/worktrees/wonder-revision`. The pre-existing `codex/braive-work`
checkout and its uncommitted iOS edits were left untouched.

## Root causes and fixes

**1. Backend/native route disagreement (reported native failure).**
The backend construction compiler validated references, relations, zones and
anchors, but never tested motion paths against solid geometry. Only the phone
did (mesh hit-tests in `RouteAudit`/`StageAudit`). A backend-accepted scene
could therefore fail on device with the generic message "Route clearance
failed on segment 0: body intersects solid geometry", which gave the single
device repair nothing actionable to fix.

Fix (`backend/src/construction.ts`): construction now sweeps every executed
viewer/node route against transformed solid bounds at the route's clearance
radius and eye height, and checks walk/run support every 0.25 m. Failures are
`route_clearance`/`route_support` issues naming the path, segment, blocking
node and measured gap, so the existing construction repair can correct them.
Bounds are conservative for concave assets; the native mesh check remains
authoritative and still rejects genuinely obstructed scenes. The builder
prompt now states this contract. Deterministic tests reproduce the old
disagreement (route through a wall; unsupported walk) and pass after the fix.
Evidential limit: the retained route-failure fixture
(`backend/data/construction-reference-live-check.json`) is not present in this
checkout, so the reproduction is a focused synthetic fixture, not the original
13-node scene. The available `last-rejected-scene.json` fails earlier on empty
asset IDs and was not used as route evidence.

**2. "Device repair allowance or generation deadline exhausted".**
Three distinct situations shared one misleading message: the repair record was
gone, the original ten-minute deadline had passed, or the one device repair
was already used. The device slot was also claimed before the repair model
call, so a provider failure (for example HTTP 503) consumed the repair without
producing a candidate, and the repair shared whatever time generation had
left, so it could be aborted mid-call.

Fix (`backend/src/job-lifecycle.ts`, `backend/src/server.ts`): blocks are now
distinguished with specific, input-preserving messages; a claimed device
repair grants a bounded four-minute window inside a hard cap of fifteen
minutes from job creation; provider/rate-limit failures release the claim and
keep the accepted scene so the phone can retry. The phone
(`ios/Braive/Session.swift`) extends its readiness deadline after the backend
accepts a repair and shows the backend stage text without appending builder
instructions on every poll.

**3. Native repair feedback.** `RouteAudit` errors now name the blocking node
(nearest named ancestor), matching the backend's feedback shape.

## UX and rendering changes

- Welcome screen: removed a redundant eyebrow and a repeated slogan; the
  remaining supporting line states the privacy fact ("Speech stays on this
  iPhone."). Approved mark, headline and consent flow are unchanged.
- Generation status shows the actual backend stage only (honest status per
  the UX research); STOP, pause, resume/quit, self-report, optional
  reflection/feedback, history/export and adapted-repeat flows are untouched.
- Legacy scenes without an authored environment keep fog to at least 30 m
  instead of 8 m; procedural clouds take the sky's horizon tint instead of
  pure white. Authored environments, posterization, shadows, SSAO and the
  stereo pipeline are unchanged. These two rendering edits are small and were
  chosen because no renderer is available in this environment to verify
  larger visual changes.

## Verification

- Backend: `tsc --noEmit` clean; full suite 127/127 passing (123 baseline plus
  4 new tests), including the two server-boot tests that need an escalated
  sandbox to bind a local port.
- Not run: Swift compilation, simulator and physical-device checks (no Swift
  toolchain or device in this environment), live Meta generation (no provider
  spend was authorized for this session; the `$50` ledger in this checkout
  shows $2.20 settled and was preserved untouched), stereo/visual review, and
  performance/memory measurement. Native edits were kept conservative and
  reviewed as diffs; they need the usual simulator + iPhone pass before demo.

## Running the updated product

Backend checks (no provider calls):

```sh
npm --prefix backend run check
npm --prefix backend test
```

Live phone testing still uses `node scripts/start-phone-test.mjs` under the
existing cumulative approval; ordinary launches keep Meta spending disabled.

## Remaining limitations

- Backend route clearance uses asset bounding boxes, so a concave asset whose
  bounds block a route the mesh would allow can still reach native preflight;
  it now fails there with the blocking node named, and the device repair
  receives that name.
- Relative viewer routes are checked at the initial viewpoint with identity
  heading on the backend; native heading-relative checks remain authoritative.
- The construction repair is still shared across planning stages; if planning
  consumes it, construction failures surface without a retry. Separating those
  budgets needs a product decision on cost.
