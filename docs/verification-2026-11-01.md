# Continuation verification — November 1, 2026

The previous implementation chat was confirmed idle/interrupted before this checkout was changed. Its uncommitted asset work and all source GLBs were preserved. Ordinary backend spending remains disabled in the ignored local environment.

## Direct evidence from this continuation

- TypeScript check, 18 offline backend tests, and five importer tests passed.
- Signed iPhone 17 builds succeeded and were installed without resetting app data. One install was attempted before signing finished and failed; the completed signature was subsequently verified and installation succeeded. A later transient signing error succeeded on retry with the existing identity.
- The phone initially reported an offline connection. Safari reached the Mac health endpoint, the saved app URL was verified correct, and the user confirmed Voice connected after the recovery build/relaunch. This establishes local reachability and the transcription handshake, not reliable recognition.
- The user's actual voice walkthrough reported poor recognition and repeated voice disconnects before generation. Provider diagnostics established close code 1008, Ingress below real-time. Two attempts delivered about 7.0 and 1.7 seconds of PCM during 17.5 and 16.5 seconds of wall time.
- Reconnect cleanup/identity guards and a PCM sender that avoids the renderer's main-thread queue are installed for a focused retest. Recognition stability and the complete live journey remain unverified until that retest succeeds.

## Focused changes

Declining history retains the consent decision while transmitting an empty history. Chained adaptation filters previously declined older history, retaining only the just-completed session. Pauses retain a pending dialogue response; ending or superseding the turn still invalidates it. New practice resets the scene's ended-session pause. Native generation polling enforces the original 120-second deadline, and stale job creation is cancelled. Failed initial connections stay on the editable setup screen with a six-second health timeout. Voice disconnections expose the actual provider/network reason. Unknown or wrongly assigned model IDs cannot use another model's budget rate.

## Budget and delivery

The single $5 cumulative ledger was initialized only after checking the idle previous chat, its report of no use under that allowance, running processes, and the ordinary server's disabled-spending configuration. Audio connections retain their full duration reservations; no missing-usage refund is assumed. Current totals remain in the ignored `backend/data/meta-test-approval.json`, not this public document.

The inherited 349-asset native audit was reported by the previous chat and has not been independently rerun here. Character motion appearance, real viewer optics, sustained performance, generation latency, live dialogue, feedback, adaptation, and the complete CSV/reflection journey still require application-level evidence. No generated scene in this continuation, finished demo video, public video, or competition submission is claimed by this record.

The three-minute capture script is in `docs/demo-script.md`. [Meta's official event page](https://dev.meta.ai/events/global-hackathon) lists the November 4, 9 PM Eastern deadline (8 PM Chicago). [Official pricing](https://dev.meta.ai/docs/pricing-rate-limits) and the [streaming transcription contract](https://dev.meta.ai/docs/speech-to-text) were checked during this continuation. The latter requires PCM to continue at real-time speed, including silence, and documents the ingress pacing close behavior.

## Subsequent diagnosis and user-directed replacement

A twelve-second local microphone measurement produced 12.19 seconds of converted PCM in 12.32 seconds, with zero conversion errors. A local WebSocket byte-count test on campus Wi-Fi captured/queued 12.29 seconds but delivered only about 3.30 seconds to the Mac. Repeating over the iPhone Personal Hotspot delivered all 12.19 seconds in 12.31 seconds. These were local numeric transport tests, not successful speech recognition claims; no provider was used for them.

Henry then explicitly authorized replacing the transcription implementation with Apple-native recognition and prioritized reliable outcomes over preserving that transport. The normal app now uses SpeechAnalyzer / SpeechTranscriber and SpeechDetector locally, following Apple’s official [SpeechAnalyzer session and sample](https://developer.apple.com/videos/play/wwdc2025/277/) and the installed iOS SDK interfaces. It has no microphone WebSocket. The updated test launcher disables remote audio, retaining all historical reservations. A signed build succeeded and installed; the first normal launch was blocked by the locked phone, so the user was asked to unlock/open it for a single spoken START check.

The UI now moves pairing into settings and manual buttons/typing into a viewer-removed controls sheet. STOP is scoped to preparation/intro/reveal/active practice. The welcome screen uses warmer color/type, without “enter forest” wording. The forest uses the supplied CC0 grass ground patch and grass clumps; source meshes are unchanged. These changes still need visual/hardware review, including recognition, echo behavior, and sustained performance.

The user subsequently unlocked/opened the Apple-speech build and confirmed that a real spoken START advanced to the headset question. This is direct microphone-to-controller evidence. The first generated scene is now being exercised; the remaining full-loop claims are still pending.

The first post-Apple-speech generation did not return a completed Wonder response before the existing two-minute ceiling. Its full uncertain reservation is retained. The duplicated asset context was reduced from 144,408 bytes to an 18,155-byte grouped catalog retaining all 349 IDs and triangle counts; a regression check verifies exact completeness. Nineteen backend tests and type checking pass. A retry is required to establish latency and scene quality for this compact prompt.

## Intake turn-taking correction

The user then reported that the native-speech build advanced after “I need to present,” and had also treated “one second” as an answer. They explicitly requested fixing this before the generation retry. The earlier provider requests therefore do **not** establish successful capture of the intended full situation and ability.

The app's own 650 ms timer had been submitting provisional transcriptions as complete answers. It could then reject a longer final result overlapping the already-consumed audio range. Following Apple's distinction between [provisional and finalized audio ranges](https://developer.apple.com/videos/play/wwdc2025/277/), the revised buffer displays provisional text but only commits finalized ranges, rejects repeats, and restarts the quiet window when speech or new text arrives. Ordinary utterances allow 1.8 seconds of quiet; short commands use 0.7 seconds. STOP remains on the existing immediate partial-text path.

Intake completion is now independent of silence: situation and ability accumulate until a trailing “that's all” (also “I'm done”). Thinking requests preserve the answer without advancing. Empty answers cannot complete. START OVER clears the current answer. Both answers are spoken back before the exact BEGIN PRACTICE command enables generation; negation and the spoken prompt itself cannot satisfy that command. Builder additions use the same finish rule, canceling the stale job when the user asks to add details so it cannot reveal mid-answer. No extra buttons or text-entry fields were added to headset screens.

The standalone Swift voice suite passes 22 checks covering the reported fragment, indefinite pauses, provisional/final replacement, resumed speech, repeated detector events, duplicate finals, thinking requests, answer replacement, explicit completion and generation-command rejection. The signed physical-device build succeeds, its signature verifies, and installation/launch on the iPhone succeeds without resetting app data. These are deterministic logic/build checks, not evidence of a new physical microphone walkthrough. The cumulative provider ledger is unchanged at $1.404691 charged/reserved and $3.595309 remaining; no provider calls were made for this correction. The generation retry remains deferred until the corrected intake is verified on the phone.

The user subsequently completed the physical pause/readback check and reported: “It read back both and waited through pauses.” This verifies the corrected intake through spoken review. The generation test then resumed under the same remaining allowance. The Mac had returned to campus Wi-Fi while the app still held its hotspot address; this was checked directly without restarting the app, and the user was given the current server address to update while retaining the completed answers. A successful generated scene and full in-scene dialogue remain unverified.
