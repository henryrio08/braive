# Braive

Native iPhone VR situational practice with voice intake and a Meta-powered backend. The approved specification is in [docs/handoff/development-plan.md](docs/handoff/development-plan.md). Public speaking is the first demo subject; practice input remains freeform. Fears, ability and boundaries shape automatically unfolding experiences; the participant does not navigate by voice.

## Current state

Phone build **0.4 (6)** includes the connection/pairing readiness check, bounded same-job polling retries, voice-preview/listening fixes and both landscape tracking bases. Pull this branch on the practice computer and restart its backend before rebuilding/installing the app. See [phone follow-up](docs/iphone-voice-followup-2026-11-03.md) for evidence and remaining physical checks.

Scene generation now runs **Spark author → fresh Spark editor → Wonder builder**. The editor returns the complete final experience in the author's format. Backend code validates it and assembles IDs, scheduling and audio locally before construction. The normal path uses three model calls; construction repairs retain the edited plan. See [generation chain](docs/scene-generation-chain.md) for contracts, validation, timing measurements and verification limits.

The visual development branch builds on the integrated partner runtime through `89fc366` and runtime follow-up `5cb7522`. It adds measured bounds for all 355 assets, deterministic spatial construction, procedural sky, explicit fog and a gentle context-adjustable low-poly shader with matte/ground/water/glass/foliage profiles. Character palettes remain protected, and moving surfaces share the pause-aware clock. Air/water conditions and unsupported fluid dynamics are described explicitly; ripples and fog are visual effects, not physical simulation. Coordinator instructions emphasize sights, sounds and events happening to the participant, with quiet routine stages. Action experiences have no character dialogue; any required dialogue uses conversation classification while retaining necessary physical movement. See [implementation evidence and remaining device checks](docs/visual-implementation-2026-11-02.md).

The earlier core practice loop passed on the physical phone on November 2, 2026: complete voice intake through pauses, centered reveal/countdown, STOP/NO resumption, speech waiting, relevant character replies, a nonempty saved reflection, grounded feedback, and a centered adapted repeat. Fresh and adapted library generations took 48.835 and 62.149 seconds. These are historical checks of the earlier interaction engine, not verification of every subsequent change.

The command-driven movement update failed its physical-phone usability check: the participant had to direct too many small actions, disliked the character appearance, and reported an unsolicited resume. The replacement makes new AI-authored experiences **guided and automatic**. Movement and events start on stage entry, advance with time or motion completion, and share the countdown's pause-aware clock. Natural conversation is available only in an authored speaking window, without ASK/name prefixes. Quiet experiences need no speech. The active headset display keeps status/countdown and a small STOP hint instead of an instruction wall. No topic-specific generator or preset fallback is used.

Henry approved four softer Kenney Mini Characters after actual native-renderer previews. New generation uses these original CC0 models and their fixed palettes; older models remain readable in saved scenes. The 355-asset native audit passes, including independent rigs, players, grounding and palettes. STOP confirmation now discards stale microphone segments, waits until its spoken question finishes, and accepts an exact fresh answer. These changes still require a coordinated phone check; an offline build is not proof of microphone, comfort or complete experience quality.

The partner's `codex/braive-work` audit fixes are integrated, including audio layer identity/timing, terminal movement completion, initial-state preflight, stale feedback cancellation, declared reveal durations and scene/audio persistence. The combined simulator build, 51 backend tests, seven importer checks, 46 scenario/movement checks, 36 voice-input checks and 29 speech-coordination checks pass. See [scenario engine](docs/scenario-engine.md) and [verification evidence](docs/verification-2026-11-02.md). Physical viewer optics, sustained performance and final video capture remain outstanding.

The selected lowercase-b/forward-arrow logo is the app icon and welcome mark. Optional dialogue uses compact context and a small output schema; an earlier synthetic backend reply took 3.718 seconds, while physical response latency remains variable. The visual source is version 0.4 (4); the partner's signed 0.3 (3) and the newer visual source have not been installed on the phone.

**Speech now stays on the iPhone.** At Henry’s request, the normal app uses Apple’s SpeechAnalyzer / SpeechTranscriber (iOS 26+) with voice-processed AVAudioEngine input and native speech detection. It does not open the Meta transcription relay. First use may install Apple’s on-device English speech assets. No silent cloud transcription fallback is configured. Meta receives the transcribed practice details/answers needed for coordination and dialogue, after consent.

The old live relay failed because the campus phone-to-Mac stream could not sustain PCM delivery. Numeric on-device tests showed 12.29 seconds produced but about 3.30 seconds received; the same test over a phone hotspot delivered all 12.19 seconds in 12.31 seconds. This network dependency has been removed from transcription. See [verification evidence](docs/verification-2026-11-01.md) for the distinction between measurements, implemented changes, and remaining checks.

On November 2, Henry expanded the existing development allowance from **US$5 to US$50 total**, shared across models, transcription, retries, restarts, processes, and chats. This preserves all previous charges and uncertain reservations; it is not an additional $50 or a new allowance each time the server starts. The existing server keeps ordinary unattended spending disabled (`BRAIVE_ALLOW_META=false`). Bounded tests use the persistent, ignored `backend/data/meta-test-approval.json`; uncertain calls retain their full reservation. Never delete/reset this ledger to obtain more budget.

After confirming no other billable process is active and reconciling prior usage, start an authorized phone test from the repository root:

```sh
node scripts/start-phone-test.mjs
```

This uses port 8788. The local server remains reachable while provider access pauses after 15 minutes without a paired practice action. An authenticated practice-generation, dialogue, feedback, adaptation, or validation POST renews the activity window; health checks and polling do not. Renewal is possible only when the process was explicitly launched with test authorization. Ordinary disabled launches cannot enable themselves. Remote transcription is disabled; Apple processes speech locally. Historical audio reservations remain charged conservatively in the same ledger. All reservations share the same $50 ledger; restarting retains its balance. The phone needs the Mac's actual reachable local address with port 8788. Never expose the provider key, pairing secret, ledger, generated session records, or local test outputs in Git. Current standard pricing was checked against [Meta's official pricing](https://dev.meta.ai/docs/pricing-rate-limits) on November 2: Spark input/output $1.25/$4.25 per million tokens; Wonder $4/$20; transcription $0.18 per audio hour. No cache discount is assumed for reservations. Unknown models or a model in the wrong pricing role are rejected.

## Mac backend

Use Node 22 or newer. From the repository root:

```sh
npm install --prefix backend
cp backend/.env.example backend/.env # only for a NEW checkout; never overwrite an existing key
```

The current checkout already has an ignored `backend/.env`; do not replace it. Configure:

- `MODEL_API_KEY`: Meta Model API key; backend only.
- `BRAIVE_TOKEN`: a different random pairing secret, at least 20 characters. Enter this token on the phone.
- `BRAIVE_ALLOW_META=false`: leave ordinary server spending disabled; use the bounded launcher under the existing cumulative authorization.
- `HOST=0.0.0.0`, `PORT=8787`: listen on the Mac's local network for the phone.

Start the local server (starting it does not make any Meta request):

```sh
cd backend
npm start
```

Use the Mac's local IPv4 address or actual `.local` hostname, e.g. `http://192.168.1.10:8787`, in the phone's setup. The placeholder `braive.local` is not automatically registered. The Mac and phone need network connectivity to each other; some university Wi-Fi networks isolate devices. A personal hotspot/local network is an option. Keep the Mac awake during the demo. The Mac must reach Meta; the phone reaches the Mac. A health check is available at `/health` without authentication. Other routes and the transcription WebSocket require the pairing token.

Offline checks, with no provider calls:

```sh
npm --prefix backend run check
npm --prefix backend test
```

## Native iPhone app

1. Xcode and iOS platform support are already installed in this development environment. Open `ios/Braive.xcodeproj`.
2. The existing checkout has working signing for `edu.uiuc.braive`. For a different machine, choose your own team in Signing & Capabilities.
3. Connect and unlock the iPhone. Trust the Mac and enable Developer Mode if prompted. Select the phone as run destination and press Run.
4. Pair the development server in Settings → Connection setup if it is not already paired. On the welcome screen, consent to processing transcribed practice details and tap Start practice. On-device voice requires iOS 26 or later; current device verification uses iOS 27.2.
5. Outside the goggles, check mic, speaker/headphone route, network, physical orientation, and STOP before inserting the phone.
6. In Settings, calibrate eye separation, field of view, and radial distortion against the actual viewer. The initial values are **unverified defaults**, not a Xiaokeis-specific optical profile. Recenter while facing forward.

No App Store publication or paid distribution workflow is part of this project. Signing and physical-device testing still require your Apple account and phone.

The project uses pinned GLTFKit2 0.5.15 through Swift Package Manager for direct GLB loading; no CocoaPods setup is needed. Source list/audio resource changes can regenerate its project file with:

```sh
python3 scripts/generate-audio.py
python3 scripts/generate-project.py
```

Audio is original procedural sound generated by the included script: piano-like music, forest/wind, room/crowd beds, and a whoosh. No third-party recordings are included. The bundled library now contains 355 CC0 GLBs (the original 349, two retained legacy adults, and four approved softer people) with a shared app/backend allowlist. Rebuild it with `python3 scripts/import-lowpoly-pack.py`; see [docs/asset-library.md](docs/asset-library.md) for licensing, normalization, character recoloring, gaps, and offline audit instructions.

## Data and controls

Session details are written atomically into the app's Documents/Sessions directory. `SESSIONS.csv` is rebuilt automatically from those records. Optional reflection text files live in Documents/Reflections, with local display titles and sanitized filenames. Files are available through iOS Files/file sharing; Settings can share the CSV and delete local data. Raw microphone audio is processed locally by Apple Speech and is not streamed or persisted by the normal app.

START begins setup. STOP applies during scene preparation, introduction, reveal, and active practice, opening the immediate quit overlay; YES ends; NO resumes only when no other pause reason remains. Portrait and lifecycle/audio/voice-channel interruptions independently pause. During scene setup, “hey builder” collects additions and supersedes old revisions. Dialogue uses actual recognized answers. Headset screens contain spoken prompts rather than button rows or text fields. Remove the viewer and hold the screen for 1.2 seconds to open manual phone controls, including typing and recovery. Connection fields are in Settings, outside the practice HUD.

Headset text is a short heading plus the next voice command. Instructions and feedback remain spoken; current instructions use a brief excerpt when useful. If vertical space is tight, the layout omits secondary detail while retaining the heading and command. Live transcript paragraphs are kept out of the headset HUD. With the viewer removed, hold for phone controls to read the full prompt and latest transcript in a scrollable view.

Loading tips come from a local tagged bank in `ios/Braive/LoadingTips.swift`. Destination/context selects the bank; longer waits rotate silently every eight unpaused seconds. Scene preparation and each builder revision always start with the exact STOP reminder. Tips cover headset setup, intake, history choice, reflection, feedback, saving and repeats; active practice stays free of rotating tips. A brief launch preloader precedes welcome. The spatial view stays black until headset readiness is confirmed; confirmation centers the view and reveals the forest. Fast transitions keep their existing duration. See [loading tips](docs/loading-tips.md) for editing and verification.

Situation and ability answers stay open across pauses. Each prompt explains **“say that's all when you've finished.”** “One second” and similar requests wait without advancing; START OVER replaces the current answer. After both complete answers, Braive proceeds directly to relevant-history consent or scene preparation. There is no readback or BEGIN PRACTICE step. Builder additions use the same explicit finish. These are local controls, with no model call to determine whether the user finished. Provisional Apple transcripts appear immediately, but only finalized segments are submitted; dialogue has a 1.8-second quiet window and short commands 0.7 seconds. STOP still works immediately on partial speech in the relevant phases.

Headset readiness sets the current facing direction as the scene's forward direction. The reference is kept through generation and reveal; adapted repeats ask for headset confirmation again. Settings → Voice selects from installed English voices, preferring Premium then Enhanced quality automatically, with a local preview. [Apple's higher-quality voices](https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoicequality) must be downloaded through iPhone Settings → Accessibility → Read & Speak → Voices if absent. The actual voice quality available on the phone must be checked there; do not claim a Premium voice is installed just because the code prefers one. Intro duration measurement and playback use the same selected voice and rate. Opening phone controls pauses practice; edited server/pairing settings persist immediately.

During new practice, stages run automatically. The participant looks around and experiences movement without WALK/SIT/ASK/NEXT commands. Conversation stages accept ordinary speech and yield replies/transitions to a completed turn and quiet gap. Other stages do not turn arbitrary speech into character dialogue. Repeated narration is queued once; stale cues are dropped. A newer user turn supersedes a pending reply. STOP freezes the clock and motion until a fresh deliberate answer; phone controls remain available with the viewer removed. Legacy command scenes remain readable for historical review.

Interrupted practice checkpoints are saved every five active seconds and at pauses/stage changes. At the lobby, say RESUME PRACTICE or use phone controls, then confirm the headset direction. Recovery loads the saved generated scene, stage and movement clock without requesting a fresh generation. Up to five active seconds may be lost in a sudden crash; pending model replies and mid-utterance speech are not replayed automatically. See [runtime follow-up](docs/runtime-followup-2026-11-02.md) for validation limits and device checks.

Dialogue routing identifiers come from the validated request. The model supplies reply content and permitted world operations; it is not responsible for reproducing UUIDs or revisions. The server checks the approved scene and active revision before and after the model call, validates the final response schema, and verifies operation references.

Reflection saves preserve words spoken in the same turn as the trailing SAVE REFLECTION command. Empty reflections prompt for content; SKIP moves on without writing a reflection file.

Post-session data is saved locally as it arrives: completion/early ending, each accepted rating, reflection reference and feedback. The spreadsheet is updated by session ID, even when optional steps are declined. Unclear ratings wait for correction; SKIP stays null while zero remains a real score. Feedback advances automatically after narration; CONTINUE can move on sooner. Server provenance is optional background metadata and cannot delay saving. A local write failure offers RETRY for the same save, never a new scene. Chained repeats carry only authorized older history plus the just-completed run, with proposed adaptation changes passed onward and explained before preparation. See [post-session audit](docs/post-session-audit.md).

Run the deterministic voice checks without a microphone or paid calls:

```sh
xcrun swiftc -module-cache-path /tmp/braive-swift-module-cache ios/Braive/VoiceInput.swift scripts/check-voice-turns.swift -o /tmp/braive-check-voice-turns
/tmp/braive-check-voice-turns
xcrun swiftc -module-cache-path /tmp/braive-swift-module-cache ios/Braive/HeadPose.swift scripts/check-head-pose.swift -o /tmp/braive-check-head-pose
/tmp/braive-check-head-pose
xcrun swiftc -module-cache-path /tmp/braive-swift-module-cache ios/Braive/VoiceInput.swift ios/Braive/SpeechCoordination.swift scripts/check-speech-coordination.swift -o /tmp/braive-check-speech-coordination
/tmp/braive-check-speech-coordination
xcrun swiftc -module-cache-path /tmp/braive-swift-module-cache ios/Braive/JSON.swift ios/Braive/VoiceInput.swift ios/Braive/ScenarioRuntime.swift ios/Braive/ScenarioState.swift scripts/check-scenarios.swift -o /tmp/braive-check-scenarios
/tmp/braive-check-scenarios
```

## Runtime design

- SwiftUI shell; SceneKit scene graph; Metal eye textures and lens correction; Core Motion rotational tracking; AVFoundation voice processing, TTS, and audio mixing.
- Spark authors the experience and independently edits it in a fresh call, reasons about dialogue, generates feedback, and proposes adaptation. Wonder builds the edited experience as a declarative scene. Structured bundled sound selections become an AudioPlan through local assembly; audio does not require another model call. SAM/Image/Glimmer are optional and are not active dependencies.
- Apple SpeechAnalyzer / SpeechTranscriber handles on-device, long-form recognition and SpeechDetector supplies speech boundaries. The original Meta relay remains a disabled optional backend route; the app does not use it. The Meta API key stays on the backend computer.
- The project OpenAPI supplies schema validation. The server adds graph/reference/tool-phase/evidence checks. The phone builds scenes offscreen and checks both-eye focal/depth visibility before commit.
- Model output cannot execute code or load arbitrary URLs. Invalid scenes get at most one repair shared with native preflight, within the ten-minute generation/readiness deadline. No preset practice-room fallback.

Contract extensions: persisted SessionRecord detail fields (`observations`, `adaptation`, reflection metadata/file); `/v1/jobs/{id}/validation` accepts a bounded native validation explanation and requests the shared repair. SessionPlan now includes an experience with ordered stages; SceneSpec adds executable scenarios, motion paths, viewer-carried assemblies and viewing distance. These fields are additive for saved records and required from new provider output. Specialist generation remains internal to the single backend.

## Remaining verification and delivery work

Run simulator and physical-device checks, measure native frame/memory behavior, calibrate the real goggles, and verify STOP echo/pause/resume plus one complete practice loop. Necessary live provider checks are covered by the remaining shared $50 allowance; additional spending requires renewed authorization. Intro speech duration, actual scene appearance, interaction quality, and the few-minute generation target must be checked with real outputs. A three-minute submission video has not been recorded. See [docs/demo-walkthrough.md](docs/demo-walkthrough.md).
