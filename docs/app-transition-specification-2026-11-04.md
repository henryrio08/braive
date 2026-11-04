# Authoritative app transition specification — November 4, 2026

This is the behavior contract for the complete rehearsal-worlds app, from open to close. It supersedes older command-navigation and user-photo descriptions. It reconciles the current Session, SessionWorldEditing, SessionAdaptation, SessionPreparedRecovery and SessionPostSessionExit implementation. Implementation/evidence gaps stay visible in [the requirement ledger](requirement-ledger-2026-11-04.md); this specification is not a claim that every branch has been physically accepted.

## State model and presentation

Primary phases are setup, lobby, headset, intake, ability, history, planning, intro, reveal, active, selfReport, readiness, reflectionPrompt, reflection, feedbackPrompt, feedback, saving, repeatPrompt, repeatPreparation and error. Launch/loading, builder collection/preparation/ready, recovery and pending persistence are explicit substates. Pause reasons are an independent set, never a replacement phase.

Before headset confirmation the surroundings are black. After confirmation the locally bundled forest clearing is visible, with real stereo depth, quiet forest/wind plus piano, a clear central area and short welcome/START text. The forest remains the preparation/intake place, dimmed when useful. A prepared practice uses a black introduction and controlled reveal. Active practice has minimal countdown/listening/STOP cues. Post-session prompts retain short readable panels and spoken detail. No physical walking or spoken navigation is required.

Headset panels use crisp textures on flat spatial panels, approximately 2.5 m ahead for the main panel, rendered per eye through the same optical compositor as world geometry. Letters are not extruded. Full transcripts/settings/manual controls are outside-headset surfaces. Recenter changes the app-owned forward reference; models never control eye optics or head rotation. Readability/comfort still needs actual viewer acceptance.

## Normal transitions

| Phase/substate | Prompt and commands | Completion / next state | Durable state |
| --- | --- | --- | --- |
| Launch loader | Local loading tip | Finish brief local initialization → setup | Settings persist; no practice record |
| Outside-headset setup | Consent, server/pairing, voice readiness, viewer settings. Continue through native controls. | Check required readiness → headset. An offline forest preview is explicitly a preview. | Connection/viewer/voice settings; no provider secrets on phone |
| Headset confirmation | Look forward; say YES when ready. Portrait/tracking failure holds. | Confirm → recenter and show forest lobby; a recovery request instead loads its saved place. | No new performance claim |
| Forest lobby | START; RESUME PRACTICE if a saved prepared/interrupted attempt exists | Fresh START → intake. Repeat START after repeat headset confirmation → adaptation preparation. | Prior records remain |
| Situation intake | Freeform description; THAT'S ALL finishes; START OVER replaces; waiting/silence preserves words | Complete → ability | Current input retained for retry/revision |
| Ability/boundaries | Describe manageable level and limits; same completion rules | Relevant history found → history, otherwise preparation | Current ability and explicit boundaries |
| History choice | YES includes relevant rows; NO excludes | Either explicit answer → preparation | History choice and selected IDs; chained repeats reuse authorized chain |
| Preparation | STOP reminder first; honest stage status; HEY BUILDER opens an addition | Approved result + asset readiness + native preflight → intro. Failure → recovery. | Job ID/revision; prepared world snapshot once accepted |
| Setup builder | Explain addition; THAT'S ALL; START OVER | Complete addition → new revision/job. Prior work is superseded. | Original situation/boundaries plus additions |
| Introduction | At most eight seconds of measured narration including exact STOP reminder | Narration fits and intro completes → reveal | Outcome remains prepared; practice clock has not started |
| Reveal | Controlled black fade and brief blur-to-clear | Finish reveal → active | Mark running; start pause-aware active clock |
| Active practice | Look freely; ordinary speech in authored conversation windows; HELP repeats active instructions; HEY BUILDER begins change | Automatic stages/motion progress; timer ends or deliberate early ending → difficulty | Checkpoint at pauses/stage changes and about every five active seconds; turns/events/metrics |
| Active builder collection | Current scene/clock frozen. Describe change; THAT'S ALL; START OVER; CANCEL discards addition | Parse or interpret → clarify, deferred, unchanged, or candidate preparation | Prior world/checkpoint remains authoritative |
| Candidate edit preparation | Frozen place; CANCEL allowed; STOP retains priority | Server prepare → native inspect → canonical commit → revision ready | Transaction ID persisted before commit; canonical scene/plan/audio/revision saved after success |
| Revision ready / cancelled edit | Explain applied or unchanged result; RESUME continues; HEY BUILDER starts another change | Explicit RESUME clears builder pause only | Preserve current stage/timer/pose/conversation target; successful revision persists |
| Difficulty rating | Optional 0–10 number; SKIP | Valid value/skip → readiness | Save accepted value; skipped=null, zero=0 |
| Readiness rating | Optional 0–10 number; SKIP | Valid value/skip → reflection choice | Save independently |
| Reflection choice | YES records; NO skips | YES → reflection; NO → feedback choice | Existing attempt already retained |
| Reflection | Freeform; SAVE REFLECTION including same-turn preceding words; SKIP discards draft | Successful save/skip → feedback choice. Empty save asks for words; write failure retains draft for retry. | Dated text file, visible title, reference in record |
| Feedback choice | YES or NO, independent of reflection | YES → feedback; NO → saving | Prior data remains saved |
| Feedback | Supplied evidence only; at most three positives and three observations; CONTINUE may advance | Spoken completion or CONTINUE → saving | Feedback saved before delivery; no fabricated emotion, gaze or improvement inference |
| Saving | Retry same write on failure | Successful record/CSV save → repeat offer | Terminal outcome, end time, active duration, ratings, optional reflection/feedback |
| Repeat offer | YES or NO | YES → headset → forest START → adaptation. NO → forest lobby. | Parent attempt is complete and retained |
| Adaptation preparation | Explain actual changes; use authorized history and just-completed run | Prepare same-world next attempt, persist/commit new attempt ID and preserved world ID → repeatPreparation | Separate prepared record, applied/deferred changes and rationale |
| Repeat preparation | HEY BUILDER may interrupt before start; START/RESUME can begin when ready | Normal successful adaptation narration finishes → intro if unpaused; recovered prepared place waits for START. An edit waits for explicit RESUME. | Prepared snapshot; no invented performance time |
| Error/recovery | RETRY / REVISE / CANCEL. Pending save uses RETRY for the same save. | Retry current retained input; revise details; or return to forest | Never regenerate to solve a save failure |
| Finished / app close | Forest remains available; remove viewer and close normally | Relaunch → setup/lobby and explicit recovery offer | Completed records remain; running records become interrupted; prepared stays prepared |

Short questionnaire steps do not impose artificial waits. Scene changes and major phase transitions may use the short loader/whoosh. STOP overlays are immediate and never wait for transitions. Exact visible copy can be concise; command meaning and state transitions are fixed here.

## Global voice, pauses and cancellation

1. STOP is recognized from relevant partial speech before builder/dialogue handling. It immediately freezes the participant-facing scene, active clock, progression and media. It cannot stack duplicate confirmations.
2. Speak the confirmation first, discard stale speech, then accept a fresh exact YES/NO. Ambiguous speech/silence keeps the confirmation open. NO clears only user_stop; other pause reasons remain.
3. YES before practice cancels the job/prepared attempt and returns to the forest without fabricating a completed session. YES during active practice ends that attempt and enters post-session handling. An edit transaction must first be safely cancelled/compensated when needed.
4. During post-session handling, STOP asks whether to return to the forest while preserving the saved practice. YES cancels pending feedback, discards an unsaved reflection draft after the stated warning, persists current data, then returns. NO resumes that post-session state.
5. Portrait clears only its own reason when landscape returns. Phone controls clear only phone_controls on dismissal. App inactivity, audio/voice-channel failure and tracking loss require deliberate RESUME after service recovery. No interruption may clear STOP or builder_edit implicitly.
6. During generation, the backend pause gate blocks subsequent provider-stage dispatch. In-flight computation can complete; the client cannot reveal/commit while paused. Monotonic pause sequences suppress stale updates. The ten-minute wall-clock ceiling continues and cancellations invalidate all late results.
7. CANCEL during an edit invalidates work, cancels its transaction, and restores the prior canonical snapshot. If cancellation acknowledgement is lost, remain paused and retry cancellation; never claim rollback succeeded. A commit already acknowledged or ambiguously delivered can be compensated at a new monotonic revision, preserving the exact prior world contents.
8. Active changes preserve task, active stage, total timer, viewer pose/path and required conversation target. Timing, route and task changes apply to the next attempt. Unsupported or ambiguous requests are clarified/deferred, never silently dropped or relabeled as applied.
9. Repeated/finalized utterances are deduplicated. Natural pauses do not finish intake/builder answers. Ordinary speech cannot become navigation or advance a stage. Silence never consents to history, resumption, or difficulty escalation.

## Recovery and exception matrix

| Condition | Required response |
| --- | --- |
| Mic permission denied / local speech assets missing | Resolve outside headset; explain readiness issue; provide manual/typing controls. No silent cloud transcription fallback. |
| Server unreachable before generation | Keep intake; show connection recovery. Idempotent generation submission/polling can recover the same job rather than making duplicate paid attempts. |
| Provider or generation failure | Retain source input, explain failure, offer retry/revise/cancel within existing budget/deadline rules. No preset practice substitute. |
| Invalid references, geometry, routes, stage graph or required asset | Shared bounded correction, then explicit recovery; native hard preflight remains authoritative. |
| Optional surface image unavailable | Retain finished base material, surface a notice; required geometry/task must remain intact. |
| Dialogue failure or lost network during practice | Do not fabricate a response. Keep world/checkpoint and expose retry/recovery/end controls. Stale replies cannot speak in another revision. |
| Feedback provider failure | Preserve saved attempt; offer recovery/skip through manual controls or post-session exit. Never fabricate feedback. |
| Storage/CSV/reflection failure | Keep current data/draft; retry same save; no new scene request. Surface the error. |
| Termination during practice | Restore exact saved motion/scenario clocks and operations after headset confirmation; at most about five active seconds may be lost. Do not replay pending replies or mid-utterance speech. |
| Termination before intro | Restore prepared world and setup context, then wait for deliberate START; do not call it completed/interrupted performance. |
| Pending transaction on relaunch | Cancel/reconcile durable transaction before loading canonical saved world; hold if result cannot be confirmed. |
| Backend restart | Reload validated durable worlds/transactions. A missing registered world can be re-registered from the saved canonical snapshot; conflicting newer revision is explicit. |
| Corrupt/incompatible checkpoint | Explain incompatibility and preserve saved record; offer fresh preparation/manual recovery, never fake a successful restore. |
| Delete local history | Use explicit outside-headset controls; clear authorized history and request paired-world deletion. Unreferenced generated assets may be removed; bundled/referenced assets are protected. |
| Demo outage | Explicitly label saved replay; do not present it as a new live generation. |

## Acceptance still required

Run two consecutive real practice loops with STOP in preparation/intro/practice/edit/post-session, stacked interruptions, successful/cancelled edits, both prepared and running recovery, ratings/reflection/feedback/CSV, and an adapted repeat that visibly preserves place identity. Native screenshots, syntax checks and fixture tests are evidence for narrower claims only.
