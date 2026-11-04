# Braive: convincing rehearsal worlds the participant can deliberately reshape

Status: implementation handoff, November 4, 2026.

Absolute path: `C:\Users\rscot\Downloads\braive\docs\rehearsal-worlds-implementation-plan-2026-11-04.md`

## Authority and outcome

This plan incorporates the user's latest feedback and one fresh-eyes subagent critique. It supersedes conflicting implementation recommendations in `active-work.md`, `scene-generation-chain-plan-2026-11-03.md`, and older visual plans. The existing original framework and development handoff remain references for established behavior; newer user instructions take precedence. Older coordination assignments must not prevent the implementation authorized by this handoff. Preserve and integrate existing uncommitted work.

The submission must demonstrate that a person can enter a situation that matters to them, practice within it, and deliberately reshape that same world for their next attempt.

The signature interaction is: "Make the audience larger, but keep the place." The room, viewpoint, recognizable people, and context persist while the requested difficulty changes. Deliver a native iPhone experience that looks convincing in the actual viewer and completes the practice, reflection, saving, and adapted-repeat loop.

## Budget and deadline update

The user reports **US$69.77 in available credits** for implementing this plan with **Muse Wonder 1.0**. Treat this as a remaining balance, not an additional amount to stack on earlier credit estimates. Coding-model usage and app/test provider calls may draw on the same balance; reconcile their actual billing scope before assuming otherwise.

The earlier local ledger snapshot showed a $50 cumulative backend allowance and approximately $32 remaining after charges and reservations. That is historical evidence, not the current provider balance. Preserve that ledger, all charges, all uncertain reservations, and its existing cap. The reported credit balance does not require raising the backend cap or resetting history.

Working spending allocation: up to $44.77 for Wonder implementation usage, up to $15 for app development/provider validation, up to $5 for final demonstration calls, and $5 unspent reserve. These are maximum envelopes, not spending goals. Reconcile actual balance and reservations before billable batches; reduce allocations if necessary. Keep app calls within both the existing backend allowance and the remaining project envelope. Do not start parallel billable processes whose combined spending cannot be accounted for.

Official submission deadline: **November 4, 2026, 9 PM Eastern / 8 PM America/Chicago**. Completion deadlines below are latest completion times. Advance immediately when a deliverable is finished. Check current local time at execution start; if a deadline has passed, apply its stated fallback immediately while protecting the final submission window.

## 1. Visual quality is the first deliverable

Finished geometry and art direction establish quality. AI selects, arranges, and directs that material. Generated appearance supplies additional variety after the underlying scene already looks convincing.

Use one coherent cinematic, stylized aesthetic compatible with the existing characters. Build a visually approved component library with:

- Recognizable silhouettes and believable proportions.
- Verified fronts, floor contacts, seated poses, and furniture fit.
- Coherent materials with correct physical scale.
- Lighting that gives objects depth and keeps important faces readable.
- Intentional foreground, middle-distance, and background composition.
- Task-relevant detail: trim, fixtures, surfaces, furnishings, vegetation, and small objects.

Primitive geometry is appropriate for real architectural forms and finished assemblies. It cannot stand in for an unrecognizable required object. Source assets in this order: visually approved existing assets; additional finished assets matching the style and verified during development; tested reusable assemblies; explicit capability limitations when a convincing representation is unavailable. Do not rename a box as a missing object.

Approve one actual headset scene before expanding the authoring system. Inspect silhouettes, proportions, characters, composition, lighting, and materials separately. A good concept image, schema-valid document, or favorable model score does not establish native visual quality.

### References and generated appearance

There is **no user-photo selection or upload flow**. The phone is already being worn as a headset. Remove reference-photo UI, upload routes, and user-reference-image fields from the proposed scope.

Use a small cached reference library organized by architecture, furnishing density, outdoor composition, lighting, materials, and atmosphere. Online references can enrich it during development. Record source and permitted use. Use licensed asset imagery or our own renders as production references; do not assume asset licensing covers unrelated website photographs or showcase renders.

Runtime web-image search is not required for the submission. Generated images are optional dressing behind finished library materials and environments. Inspect tileability, panorama seams, material scale, and alignment instead of assuming a general image generator guarantees them.

Implement registered texture references and material UV scale. Normalize generated materials to at most 1024x1024 and distant imagery to 2048x1024. Cap generated downloads at 12 MB and decoded generated textures at 64 MB per scene. Models select registered IDs; trusted code handles downloads and validation. Preserve character skin, face, hair, and clothing textures.

Distant imagery can supplement surroundings and lighting. Nearby floors, walls, actors, task objects, and traversable openings retain explicit geometry. A textured sphere does not supply nearby stereo geometry. Cache assets by content and persist referenced assets with saved sessions so restoration does not require regeneration.

## 2. Improve construction incrementally

Introduce bounded assembly macros that lower into existing `SceneSpec` and `ConstructionPlan`:

- Enclosures and walls with real openings.
- Platforms and steps.
- Repeated seating and actor groups.
- Bounded prop and vegetation placement.
- Supported functional groups, such as a desk, chair, and interview participants.

Retain individual assets and the general scene hierarchy. Macros reduce repetitive coordinate work without restricting all scenes to a small grammar. Avoid a simultaneous rewrite of authoring, compiler, API, native loading, and persistence.

Establish three composable construction families:

| Family | Capabilities | Required demonstrations |
| --- | --- | --- |
| Indoor | Enclosures, openings, furnishings, seating, fixtures | Library presentation; studio interview |
| Open environment | Ground, vegetation, landmarks, built structures, layered surroundings | Garden toast; trail at dusk |
| Confined | Close enclosure, passages, fitted fixtures, controlled sightlines | Elevator; service passage |

These are construction systems, not fixed practice situations. Generate the situation, composition, participants, and progression from freeform input. Broader coverage must be measured; a smaller format alone does not prove it. Retain the general asset/node path when no macro fits.

### Responsibilities

- Spark interprets situation, ability, boundaries, authorized history, difficulty, and progression.
- Wonder composes scenes using approved assets, assembly macros, and explicit spatial relationships.
- Trusted compilation expands structures, assigns stable IDs, and resolves placement, support, containment, budgets, and references.
- The native app verifies actual loaded geometry, visibility, routes, stereo rendering, and experience behavior.
- Development-time visual review inspects production native renders and maintains a regression gallery.

Keep the current generation interface available during macro introduction. Remove the separate audio-model call only after local assembly reproduces the existing behavior. It cannot block the first good scene.

### Reliability

Fix the retained island/cove failure generally: distinguish preserving position while checking containment from intentionally placing using an offset. Preserve legacy offset behavior when the explicit behavior is absent. The new authoring path selects behavior explicitly. Report the responsible relation, resulting position, and measured containment failure. Do not special-case the island or weaken checks.

Reject empty asset IDs at schema validation. Supply relevant asset subsets with measured bounds, verified orientations, and visual thumbnails. Retain the ten-minute readiness ceiling and one shared repair allowance. Native hard checks remain authoritative.

Runtime VLM review is outside the submission's critical path. Begin with development review of actual renders. Do not add a phone-upload/model-review round trip as a required readiness dependency. If later integrated, automated review proposes concrete bounded fixes and cannot override hard checks or destroy a retained usable candidate.

## 3. Same-world changes

Persist the scene, assembly parameters, referenced assets, and seed.

During active practice, builder edits may change approved repeated-group population, materials, lighting/environment appearance, supported decorative prop placement, and actor behavior within current roles. Preserve current stage, remaining time, viewer position/path, conversation target, and task.

Task, route, stage-sequence, and duration changes apply to the next attempt. Explain this briefly when requested.

Keep the old scene resident and frozen while preparing an edit. Failure or cancellation retains that exact scene and checkpoint. Successful revision preparation speaks a short description; **RESUME** continues from the frozen point. Cancellation cannot cause unsolicited resumption. Superseded work cannot commit.

Adapted repeats alter meaningful difficulty dimensions while retaining place identity. Record parameter changes and rationale. Start the audience demonstration at **8 to 16 people**. Increase only after sustained stereo profiling and visual approval. Never remove a required conversational actor or silently change room identity for performance.

### Minimum interfaces

- Assembly instructions lowered into existing scene contracts.
- Explicit containment behavior with legacy compatibility.
- Registered texture references and material UV scale.
- Asset manifest and authenticated asset retrieval.
- Typed, revision-bound scene parameter patches.
- Saved assembly parameters and referenced assets.
- Explicit preparation and active-edit substates.

Preserve existing saved-scene loading. Keep public changes additive where practical. Do not add user-photo APIs.

## 4. Complete user journey

Maintain one authoritative transition specification. Every state records scene/audio presentation, spoken prompt, accepted commands, completion trigger, next state, durable state, cancellation behavior, and recovery destination. Distinguish state from independent pause reasons.

### Before generation

Use a finished, locally bundled forest clearing: warm directional light, atmospheric depth, ground detail, rocks, vegetation, a clear central viewing area, quiet forest ambience, restrained piano, and a welcome panel ahead. No walking or moving camera is required. The clearing remains available without network or generation and establishes the product's visual quality immediately.

Correct sequence: **outside-headset setup -> headset confirmation -> forest clearing -> START -> intake**. Keep the forest visible during intake and dimmed during preparation. The current black-before-START conflict must be resolved explicitly.

### Headset text

Use crisp text textures on flat spatial panels rendered for each eye through the same optics as the world. No extruded letters. Welcome/intake panels sit approximately 2.5 meters ahead, with placement, size, and comfort verified in the viewer. Short headings and commands are visual; full instructions are spoken. Countdown, listening status, and STOP use a small stable app-owned panel. Full transcripts and settings remain outside-headset controls. Pause/error panels remain readable against dimmed surroundings.

The existing SwiftUI HUD overlays the completed stereo output and bypasses the world's lens correction. Move headset presentation into the eye-rendering pipeline without weakening pause/exit visibility.

### Normal states

| State | Experience | Transition |
| --- | --- | --- |
| Launch | Brief local loader | Setup |
| Setup | Consent, connection, voice readiness, viewer settings | Continue when required services are ready |
| Headset confirmation | Black surroundings, short spoken/spatial prompt | YES centers and reveals forest |
| Forest lobby | Clearing and START cue | START begins intake; RESUME offers interrupted run |
| Situation | Describe moment, place, people | THAT'S ALL completes answer |
| Ability/boundaries | Describe manageable level and limits | THAT'S ALL completes answer |
| History choice | Only if relevant history exists | YES includes; NO excludes |
| Preparation | Dimmed clearing, honest progress, STOP reminder | Validated scene begins introduction |
| Setup builder | Add/correct details in headset | THAT'S ALL submits newer revision |
| Introduction | Black surroundings, eight-second narration including STOP | Reveal |
| Reveal | Controlled fade to scene | Active clock starts after reveal |
| Practice | Automatic events/movement where required; relevant natural conversation | Timer or deliberate ending |
| Active builder | Frozen current scene; collect change | Prepare/validate revision |
| Revision ready | Short explanation of applied change | RESUME continues frozen run |
| Difficulty | Optional 0-10 rating | Valid number or SKIP |
| Readiness | Optional 0-10 rating | Valid number or SKIP |
| Reflection choice | Offer spoken reflection | YES records; NO continues |
| Reflection | Open-ended speech | SAVE REFLECTION saves; SKIP discards |
| Feedback choice | Independent of reflection choice | YES requests; NO continues |
| Feedback | Recorded-evidence-based observations | Completion or CONTINUE |
| Saving | Durable record and CSV update | Repeat offer |
| Repeat offer | Another attempt in same place | YES adapts; NO returns to forest |
| Adaptation | Explain change, permit corrections | Headset confirmation, preparation, intro, next attempt |
| Finished | Forest available | Remove viewer and leave app normally |

Do not introduce artificial delays between questionnaire steps. Use transitions for environment changes and major phases.

### Voice and STOP

THAT'S ALL completes intake/builder turns; natural pauses do not. START OVER replaces the current answer. Ambiguous answers retain the current state and get brief clarification. Silence never implies consent or difficulty escalation. HELP speaks current controls. Deduplicate repeated/stale utterances.

STOP immediately freezes participant-facing flow and prevents a pending reveal:

- Before practice, YES cancels setup and returns to forest with no invented performance record.
- During practice, YES ends the attempt and enters post-session handling.
- NO resumes the exact previous state only when all other pause reasons are cleared.
- Cancelling an active edit retains the original run; RESUME continues it.
- During post-session handling, returning to forest preserves accepted/saved data. Discard an unsaved reflection only after stating that consequence and obtaining confirmation.

In-flight provider computation may finish after STOP; do not claim remote computation is pausable. Dispatch no additional generation stages while paused. The wall-clock deadline continues. Cancelled/superseded output cannot commit.

### Exceptions

| Condition | Response |
| --- | --- |
| Mic permission denied / speech assets unavailable | Resolve outside headset; typing/manual recovery |
| Portrait | Pause; landscape clears only orientation pause |
| Phone call / audio-route failure / background / lock | Pause, checkpoint, deliberate resumption after recovery |
| Voice control unavailable | Pause; instruct viewer removal |
| Generation/network failure | Retain accepted input; RETRY / REVISE / CANCEL |
| Invalid scene / missing required asset | Bounded repair, then explicit recovery |
| Optional generated dressing failure | Finished library appearance remains usable |
| Active edit failure | Preserve frozen original; RESUME / REVISE / END |
| Character connection failure | Preserve run; retry/end without fabricated reply |
| Feedback failure | Keep saved attempt; retry/skip |
| Storage failure | Retry same save; never regenerate scene |
| App termination | Restore checkpoint after explicit confirmation |
| Incomplete restoration data | Explain failure; offer new attempt |
| Demo network outage | Clearly labeled saved replay |
| Settings/manual controls | Separate pause reason; dismissal cannot clear STOP |
| Data deletion | Remove records/unreferenced assets; clear in-memory history consent |

Save minimal session data when practice ends. Reflection/feedback cannot prevent saving. Retain optional 0-10 ratings with null distinct from zero, existing reflection naming, durable records/CSV, source-grounded feedback, consent, and the adapted-repeat chain. Do not infer mental health, eye contact, or improvement from head direction, silence, or completion.

## 5. Verification and evidence

The previous inspection found a passing backend type check and 80/81 tests passing after temporary-file relocation. The remaining local-server test encountered environment-denied loopback networking. These are historical results: rerun appropriate checks and distinguish product failures from environment limitations. There is no verified new native implementation yet.

### Quality and variety

Generate two materially different scenes per construction family; keep at least one description per family out of prompt examples. Compare old/new recognizability, finished appearance, proportions/contact, depth/composition, task/boundary fidelity, interaction support, first-pass acceptance, repairs, latency, and cost. Both teammates must prefer the new native renders per family. Repair weak families before adding orchestration. Include the retained island/cove regression.

### Functional acceptance

- Two consecutive physical-phone complete practice loops.
- STOP during preparation, introduction, practice, and editing.
- Stacked pauses; stale generation/revision results.
- One successful same-world edit and one cancelled edit.
- Ratings, reflection, feedback, CSV, checkpoint restoration without regeneration.
- Adapted repeat visibly preserves place identity.
- Larger audience profiled for three sustained minutes.
- Budget enforcement, asset validation/download failures, missing assets, and offline restoration.

Fresh preparation aims below three minutes; cached appearance-independent edits aim below fifteen seconds. Target 60 fps with p95 frame intervals below 20 ms on the device. Measure instead of claiming these results. Reduce decorative rendering cost or resolution before changing task semantics.

### Demo

The approximately three-minute video prioritizes: concrete upcoming situation; convincing headset reveal; interaction using the participant's words; "change this, keep the place"; immediate STOP and deliberate resumption; evidenced feedback and adapted repeat. Add a short outdoor/enclosed montage. Label time compression and saved replays. Keep nonclinical situational skill-practice framing. Position for Indie / Build for Your World.

## 6. Latest completion deadlines

All November 4, America/Chicago. Advance immediately after completion; do not wait for a scheduled start time.

| Deadline | Deliverable | Fallback if incomplete |
| --- | --- | --- |
| 8 AM | Convincing phone scene; approved assets/composition/characters/light | Continue visual repair; defer authoring-format expansion |
| 11 AM | Proven generation macros and broader scene examples | Retain existing authoring interface; integrate proven components through it |
| 1 PM | Correct lobby, optical text, phase/exception behavior | Stop presentation additions; close flow gaps |
| 3 PM | Bounded same-world edits and adapted repeats | Prioritize population/environment changes; preserve task/runtime |
| 5 PM | Phone acceptance complete; implementation frozen | Demonstrated failure fixes only |
| 6:30 PM | Video and evidence complete | Finish packaging immediately |
| 7 PM | Submission uploaded and receipt verified | Resolve submission issues before official 8 PM deadline |

Prepare materials and receipt verification steps; do not claim submission or publication unless actually performed through the authorized submission flow.

## Research basis

The prior research screened the complete supplied catalog (573 visible rows including repeated appearances, plus 26 commented entries), with selected primary-source investigations. It was not a claim to have read every full paper or run every model. Do not repeat the whole survey before implementing.

- Catalog snapshot: https://github.com/hzxie/Awesome-3D-Scene-Generation/tree/3fb2f78b7084f8e681407877c729b3af8323d443
- Survey: https://arxiv.org/html/2505.05474v2
- Holodeck: https://arxiv.org/abs/2312.09067
- Scene Language: https://arxiv.org/abs/2410.16770
- SceneSmith: https://arxiv.org/html/2602.09153v2
- Scenethesis: https://arxiv.org/html/2505.02836v1
- SceneAssistant: https://arxiv.org/abs/2603.12238
- ControlRoom3D: https://arxiv.org/abs/2312.05208
- RoomTex: https://arxiv.org/abs/2406.02461
- Scene-Designer: https://arxiv.org/html/2610.23121v1
- WorldGen: https://arxiv.org/abs/2511.16825
- Muse Image: https://dev.meta.ai/docs/image-generation
- Meta pricing: https://dev.meta.ai/docs/pricing-rate-limits
- Official event: https://dev.meta.ai/events/global-hackathon

World Labs supplies rich persistent environments but introduces generation, asset alignment, account, and native integration dependencies. Genie demonstrates dynamic interventions but does not supply a drop-in native stereo scene runtime. Hunyuan, PixWorld, and SAM 3D provide valuable representations and reconstruction techniques but require additional inference/integration infrastructure. Adopt their useful principles without adding new hosting, account, GPU, or renderer dependencies to today's critical path.

The visual experience is the first deliverable. The persistent, deliberately changeable rehearsal world is the product.
