# Braive

Native, voice-first iPhone VR situational practice, with a Meta-powered backend running on your Mac. The approved specification is in [docs/handoff/development-plan.md](docs/handoff/development-plan.md). Public speaking is the first demo subject; practice input remains freeform.

## Current state

The earlier core practice loop passed on the physical phone on November 2, 2026: complete voice intake through pauses, centered reveal/countdown, STOP/NO resumption, speech waiting, relevant character replies, a nonempty saved reflection, grounded feedback, and a centered adapted repeat. Fresh and adapted library generations took 48.835 and 62.149 seconds. These are historical checks of the earlier interaction engine, not verification of every subsequent change.

The current update replaces automatic character conversation with AI-authored executable stages and local voice actions. Generated paths move the participant and other actors through the world; stage events and motion share the countdown's pause-aware clock. There are no topic-specific scene generators or preset practice fallback. An actual generated swimming scene passed native both-eye preflight and was reviewed at surface, travel, underwater and return positions through explicit offline replay. That replay is excluded from normal app builds. Physical-phone verification of the new movement flow remains pending. Type checking, 40 backend tests, 37 scenario/movement checks, 33 voice-input checks, eight head-pose checks and 15 speech-coordination checks pass. See [scenario engine](docs/scenario-engine.md) and [verification evidence](docs/verification-2026-11-02.md).

Actual viewer optics, sustained device performance, interruption recovery beyond the previously tested STOP/NO path, broader generated visual quality and final video capture remain outstanding. The current 351-asset native audit passes, including independent character rigs, animation players and clothing tint.

The polish update adds two licensed clothed character models with faces/hair and authored idle/walk/run clips; one supports sitting. Character asset choice is preserved from the coordinator plan. New directional shadows, ambient color and modest ambient occlusion improve depth. Optional dialogue now uses a bounded compact context, a two-field response schema and minimal reasoning. One synthetic live backend check returned a relevant reply in 3.718 seconds; end-to-end phone timing remains unverified. The welcome text now fits action experiences too, Settings includes voice-control help and version 0.2 (2), and a pending reply has a visible status. The selected lowercase-b/forward-arrow logo is the app icon and welcome-screen mark; alternatives and exact prompts are in [assets/brand](assets/brand/README.md).

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

Audio is original procedural sound generated by the included script: piano-like music, forest/wind, room/crowd beds, and a whoosh. No third-party recordings are included. The bundled library now contains 351 CC0 GLBs (the original 349 plus two clothed, animated adults) with a shared app/backend allowlist. Rebuild it with `python3 scripts/import-lowpoly-pack.py`; see [docs/asset-library.md](docs/asset-library.md) for licensing, normalization, character recoloring, gaps, and offline audit instructions.

## Data and controls

Session details are written atomically into the app's Documents/Sessions directory. `SESSIONS.csv` is rebuilt automatically from those records. Optional reflection text files live in Documents/Reflections, with local display titles and sanitized filenames. Files are available through iOS Files/file sharing; Settings can share the CSV and delete local data. Raw microphone audio is processed locally by Apple Speech and is not streamed or persisted by the normal app.

START begins setup. STOP applies during scene preparation, introduction, reveal, and active practice, opening the immediate quit overlay; YES ends; NO resumes only when no other pause reason remains. Portrait and lifecycle/audio/voice-channel interruptions independently pause. During scene setup, “hey builder” collects additions and supersedes old revisions. Dialogue uses actual recognized answers. Headset screens contain spoken prompts rather than button rows or text fields. Remove the viewer and hold the screen for 1.2 seconds to open manual phone controls, including typing and recovery. Connection fields are in Settings, outside the practice HUD.

Headset text is a short heading plus the next voice command. Full readbacks, instructions and feedback remain spoken; current instructions use a brief excerpt when useful. If vertical space is tight, the layout omits secondary detail while retaining the heading and command. Live transcript paragraphs are kept out of the headset HUD. With the viewer removed, hold for phone controls to read the full prompt and latest transcript in a scrollable view.

Situation and ability answers stay open across pauses. Each prompt explains **“say that's all when you've finished.”** “One second” and similar requests wait without advancing; START OVER replaces the current answer. After both answers, Braive reads them back and requires BEGIN PRACTICE before creating a scene. Builder additions use the same explicit finish. These are local controls, with no model call to determine whether the user finished. Provisional Apple transcripts appear immediately, but only finalized segments are submitted; dialogue has a 1.8-second quiet window and short commands 0.7 seconds. STOP still works immediately on partial speech in the relevant phases.

Headset readiness sets the current facing direction as the scene's forward direction. The reference is kept through generation and reveal; adapted repeats ask for headset confirmation again. Settings → Voice selects from installed English voices, preferring Premium then Enhanced quality automatically, with a local preview. [Apple's higher-quality voices](https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoicequality) must be downloaded through iPhone Settings → Accessibility → Read & Speak → Voices if absent. The actual voice quality available on the phone must be checked there; do not claim a Premium voice is installed just because the code prefers one. Intro duration measurement and playback use the same selected voice and rate. Opening phone controls pauses practice; edited server/pairing settings persist immediately.

During practice, the current stage explains its available voice actions. These execute on the phone without a dialogue request. HELP repeats the current instructions. Conversation, when the plan permits it, requires ASK followed by a character name or a uniquely matching role; arbitrary speech does not trigger a network reply. Timed narration waits for detected speech and provisional transcription to finish. Repeated scene/narrator lines are queued once; prompts more than 15 active seconds late are dropped. User speech interrupts app speech. Optional character responses wait for a completed turn and quiet gap, and a newer request supersedes a stale response. STOP and other pauses retain pending responses until resumption.

Dialogue routing identifiers come from the validated request. The model supplies reply content and permitted world operations; it is not responsible for reproducing UUIDs or revisions. The server checks the approved scene and active revision before and after the model call, validates the final response schema, and verifies operation references.

Reflection saves preserve words spoken in the same turn as the trailing SAVE REFLECTION command. Empty reflections prompt for content; SKIP moves on without writing a reflection file.

Run the deterministic voice checks without a microphone or paid calls:

```sh
xcrun swiftc -module-cache-path /tmp/braive-swift-module-cache ios/Braive/VoiceInput.swift scripts/check-voice-turns.swift -o /tmp/braive-check-voice-turns
/tmp/braive-check-voice-turns
xcrun swiftc -module-cache-path /tmp/braive-swift-module-cache ios/Braive/HeadPose.swift scripts/check-head-pose.swift -o /tmp/braive-check-head-pose
/tmp/braive-check-head-pose
xcrun swiftc -module-cache-path /tmp/braive-swift-module-cache ios/Braive/VoiceInput.swift ios/Braive/SpeechCoordination.swift scripts/check-speech-coordination.swift -o /tmp/braive-check-speech-coordination
/tmp/braive-check-speech-coordination
xcrun swiftc -module-cache-path /tmp/braive-swift-module-cache ios/Braive/JSON.swift ios/Braive/VoiceInput.swift ios/Braive/ScenarioRuntime.swift scripts/check-scenarios.swift -o /tmp/braive-check-scenarios
/tmp/braive-check-scenarios
```

## Runtime design

- SwiftUI shell; SceneKit scene graph; Metal eye textures and lens correction; Core Motion rotational tracking; AVFoundation voice processing, TTS, and audio mixing.
- Spark coordinates, reasons about dialogue, generates feedback, and proposes adaptation. Wonder authors the declarative scene. Spark selects bundled audio, as permitted by the handoff's Glimmer fallback. SAM/Image/Glimmer are optional and are not active dependencies.
- Apple SpeechAnalyzer / SpeechTranscriber handles on-device, long-form recognition and SpeechDetector supplies speech boundaries. The original Meta relay remains a disabled optional backend route; the app does not use it. The Meta API key stays on the Mac.
- The project OpenAPI supplies schema validation. The server adds graph/reference/tool-phase/evidence checks. The phone builds scenes offscreen and checks both-eye focal/depth visibility before commit.
- Model output cannot execute code or load arbitrary URLs. Invalid scenes get at most one repair shared with native preflight, within the original two-minute generation deadline. No preset practice-room fallback.

Contract extensions: persisted SessionRecord detail fields (`observations`, `adaptation`, reflection metadata/file); `/v1/jobs/{id}/validation` accepts a bounded native validation explanation and requests the shared repair. SessionPlan now includes an experience with ordered stages; SceneSpec adds executable scenarios, motion paths, viewer-carried assemblies and viewing distance. These fields are additive for saved records and required from new provider output. Specialist generation remains internal to the single backend.

## Remaining verification and delivery work

Run simulator and physical-device checks, measure native frame/memory behavior, calibrate the real goggles, and verify STOP echo/pause/resume plus one complete practice loop. Necessary live provider checks are covered by the remaining shared $50 allowance; additional spending requires renewed authorization. Intro speech duration, actual scene appearance, interaction quality, and the one-minute generation target must be checked with real outputs. A three-minute submission video has not been recorded. See [docs/demo-walkthrough.md](docs/demo-walkthrough.md).
