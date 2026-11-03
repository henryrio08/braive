# Branch consistency review — November 2, 2026

Reviewed the first-party native app, backend, project contracts and build/import/test tooling on `codex/bundled-lowpoly-library`, starting at `de4efb3`. The original product framework remains the minimum. This is a source review plus offline verification, not proof of arbitrary generated quality or physical headset behavior. No provider requests were made.

BraveWork was fetched throughout. Its latest inspected commit is `240e47c`; that visual-construction work is not merged into this review branch. These fixes need to be merged there and its combined native checks rerun. Existing source assets, credentials, local records and the spending ledger were preserved.

## Fixed and rechecked

1. Generation capacity rejection mutated the current revision/cancelled work before accepting the replacement. Admission now rejects before mutation and replacements reuse their own slots. Cancelled jobs release their slot; completed jobs remain succeeded. Controller cleanup cannot remove a newer repair controller. These changes were committed/pushed as `f1f33c0`.
2. Repair cancellation could overwrite cancelled with failed. Cancellation is preserved; stale revisions and over-capacity repair requests are rejected before model work. Already-aborted model calls stop before budget reservation.
3. Backend validation allowed distinct character IDs to share one scene root, and allowed a declared initial step inconsistent with the phone's first-step rule. Both now fail explicitly. Budget-test cast fixtures were corrected to supply distinct roots.
4. Replacing speech multiplied already-ducked audio gain, progressively quieting the background. The mixer now retains intended gains and applies ducking once, restoring exact gain after speech. Native checks verify the sequence.
5. Deleting files left authorized history/current records in memory, which a later repeat could reuse. The deletion controller now clears session/history state and cancels owned work before returning to the lobby. Native checks verify durable and in-memory removal. Consent checks also gate generation/dialogue/feedback/adaptation.
6. Recovery retained the history-consent boolean but lost the authorized history set. Checkpoints now retain only authorized row IDs; restoration resolves still-existing rows and never searches in unrelated history.
7. New sessions did not explicitly cancel outstanding generation. They now cancel owned work and use session ownership as well as revision checks. Cancelled jobs stop phone polling; polling timeout respects the remaining readiness deadline.
8. HTML/empty HTTP errors surfaced as JSON decoding failures or blank messages. API errors now preserve HTTP status and use an understandable fallback; already-cancelled tasks stop before requests and decoding. URLProtocol tests make no network requests.
9. Renderer texture-allocation failure could leave a matching cached size with incomplete targets, preventing future allocation retries. Failure now clears the incomplete targets and cached size.
10. Native preflight used Euclidean object distance against forward-depth pixels, used cuts through object centers, and let hidden/transparent or multipart objects distort its depth bands. It now uses consistent forward depth and cuts between distinct visible depth groups. Actual GPU controls pass; visibility/depth requirements were not removed.
11. Mesh probes on detached/uncommitted staging trees returned no support hits. Validation now retains scene ownership, commits transforms before queries, and restores the original parent after GPU checks. Segment queries use all intersections without camera clipping before filtering non-solid geometry. Supported-floor, thin-wall and unsupported-walk controls now pass.
12. The native preflight fixture referred to an absent `bookshelf` category and its near positive-control object was outside the view. The fixture now uses the real shelf category and visible geometry. Flat-scene rejection checks accept the precise structural rejection reason.
13. A spoken compound out-of-range rating such as “twenty five” could become score five. It is rejected. GLB import also rejected positive out-of-range references but accepted negative references/offsets; those now fail before copying/loading.

## Coverage and verification

| Area | Review/check |
| --- | --- |
| Server jobs, cancellation, schemas, graph progression, tools, dialogue, budget/activity window | Type checking and **64 backend tests pass**, with local HTTP integration and no real provider calls |
| Asset loader/rigs, scene construction, stage/route preflight, stereo compositor, motion/metrics | Native simulator build passes; actual GPU visibility/transparent/cutout controls, route controls and resolved-scene preflight return passed |
| Speech buffers, answer/reflection parsing, pause confirmation, narration coordination | **36 voice-turn** and **29 speech-coordination** checks pass; physical microphone/echo remains pending |
| Practice clock, motion, scenario state/recovery, heading | **46 scenario/movement**, **8 head-pose**, and scenario-state checkpoint checks pass |
| Native session/controller, persistence, history, reflection, feedback, tips | Isolated native controller audit passes **20 checks**, including actual player-volume assertions; storage, **13 rating cases**, repeat-history and tip-bank checks pass |
| API transport | Offline URLProtocol checks pass for JSON/HTML HTTP failures, empty DELETE response and valid JSON |
| Import and build tooling | **8 importer tests pass**; dry-run validates all **355 CC0 GLBs**; no source/runtime mesh bytes changed |

Diagnostics are explicitly launched test modes. They use synthetic inputs and isolated temporary records; manual speech-completion injection is not evidence of physical speech recognition. GPU preflight success does not establish support for every possible scene, exact swept collision, optics, sustained performance or general physics. No changes were made merely to restyle code or add visual effects. Remaining physical/provider verification is described in the existing handoff and runtime-follow-up documents.
