# Braive

Native, voice-first iPhone VR situational practice, with a Meta-powered backend running on your Mac. The approved specification is in [docs/handoff/development-plan.md](docs/handoff/development-plan.md). Public speaking is the first demo subject; practice input remains freeform.

## Current state

The native app and backend are implemented, but the complete practice journey remains under verification. On November 1, 2026, the backend type check, 19 offline backend tests, and five importer tests passed. The revised signed iPhone 17 build includes Apple on-device speech recognition, a voice-first headset interface, contextual STOP controls, and a grass floor. The user confirmed spoken START, then reported premature intake cutoffs. A further signed build adds explicit answer completion and spoken review before creation, with 22 deterministic voice checks passing; it is installed for the physical pause/readback retest. The generated-scene walkthrough and sustained recognition still need completion before claiming the full loop. The inherited 349-asset native audit has not been independently rerun in this continuation.

**Speech now stays on the iPhone.** At Henry’s request, the normal app uses Apple’s SpeechAnalyzer / SpeechTranscriber (iOS 26+) with voice-processed AVAudioEngine input and native speech detection. It does not open the Meta transcription relay. First use may install Apple’s on-device English speech assets. No silent cloud transcription fallback is configured. Meta receives the transcribed practice details/answers needed for coordination and dialogue, after consent.

The old live relay failed because the campus phone-to-Mac stream could not sustain PCM delivery. Numeric on-device tests showed 12.29 seconds produced but about 3.30 seconds received; the same test over a phone hotspot delivered all 12.19 seconds in 12.31 seconds. This network dependency has been removed from transcription. See [verification evidence](docs/verification-2026-11-01.md) for the distinction between measurements, implemented changes, and remaining checks.

Henry authorized **US$5 total for this development continuation**, shared across models, transcription, retries, restarts, processes, and chats. This replaces the old per-test approval requirement and is not a new allowance each time the server starts. The existing server keeps ordinary unattended spending disabled (`BRAIVE_ALLOW_META=false`). Bounded tests use the persistent, ignored `backend/data/meta-test-approval.json`; uncertain calls retain their full reservation. Never delete/reset this ledger to obtain more budget.

After confirming no other billable process is active and reconciling prior usage, start an authorized phone test from the repository root:

```sh
node scripts/start-phone-test.mjs
```

This uses port 8788 and a 15-minute server window. Remote transcription is disabled; Apple processes speech locally. Historical audio reservations remain charged conservatively in the same ledger. All reservations share the same $5 ledger; restarting retains its balance. The phone needs the Mac's actual reachable local address with port 8788. Never expose the provider key, pairing secret, ledger, generated session records, or local test outputs in Git. Current standard pricing was checked against [Meta's official pricing](https://dev.meta.ai/docs/pricing-rate-limits) on November 1: Spark input/output $1.25/$4.25 per million tokens; Wonder $4/$20; transcription $0.18 per audio hour. No cache discount is assumed for reservations. Unknown models or a model in the wrong pricing role are rejected.

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

Audio is original procedural sound generated by the included script: piano-like music, forest/wind, room/crowd beds, and a whoosh. No third-party recordings are included. The bundled library now contains 349 CC0 GLBs with a shared app/backend allowlist. Rebuild it with `python3 scripts/import-lowpoly-pack.py`; see [docs/asset-library.md](docs/asset-library.md) for licensing, normalization, character recoloring, gaps, and offline audit instructions.

## Data and controls

Session details are written atomically into the app's Documents/Sessions directory. `SESSIONS.csv` is rebuilt automatically from those records. Optional reflection text files live in Documents/Reflections, with local display titles and sanitized filenames. Files are available through iOS Files/file sharing; Settings can share the CSV and delete local data. Raw microphone audio is processed locally by Apple Speech and is not streamed or persisted by the normal app.

START begins setup. STOP applies during scene preparation, introduction, reveal, and active practice, opening the immediate quit overlay; YES ends; NO resumes only when no other pause reason remains. Portrait and lifecycle/audio/voice-channel interruptions independently pause. During scene setup, “hey builder” collects additions and supersedes old revisions. Dialogue uses actual recognized answers. Headset screens contain spoken prompts rather than button rows or text fields. Remove the viewer and hold the screen for 1.2 seconds to open manual phone controls, including typing and recovery. Connection fields are in Settings, outside the practice HUD.

Situation and ability answers stay open across pauses. Each prompt explains **“say that's all when you've finished.”** “One second” and similar requests wait without advancing; START OVER replaces the current answer. After both answers, Braive reads them back and requires BEGIN PRACTICE before creating a scene. Builder additions use the same explicit finish. These are local controls, with no model call to determine whether the user finished. Provisional Apple transcripts appear immediately, but only finalized segments are submitted; dialogue has a 1.8-second quiet window and short commands 0.7 seconds. STOP still works immediately on partial speech in the relevant phases.

Run the deterministic voice checks without a microphone or paid calls:

```sh
xcrun swiftc -module-cache-path /tmp/braive-swift-module-cache ios/Braive/VoiceInput.swift scripts/check-voice-turns.swift -o /tmp/braive-check-voice-turns
/tmp/braive-check-voice-turns
```

## Runtime design

- SwiftUI shell; SceneKit scene graph; Metal eye textures and lens correction; Core Motion rotational tracking; AVFoundation voice processing, TTS, and audio mixing.
- Spark coordinates, reasons about dialogue, generates feedback, and proposes adaptation. Wonder authors the declarative scene. Spark selects bundled audio, as permitted by the handoff's Glimmer fallback. SAM/Image/Glimmer are optional and are not active dependencies.
- Apple SpeechAnalyzer / SpeechTranscriber handles on-device, long-form recognition and SpeechDetector supplies speech boundaries. The original Meta relay remains a disabled optional backend route; the app does not use it. The Meta API key stays on the Mac.
- The project OpenAPI supplies schema validation. The server adds graph/reference/tool-phase/evidence checks. The phone builds scenes offscreen and checks both-eye focal/depth visibility before commit.
- Model output cannot execute code or load arbitrary URLs. Invalid scenes get at most one repair shared with native preflight, within the original two-minute generation deadline. No preset practice-room fallback.

Contract extensions: persisted SessionRecord detail fields (`observations`, `adaptation`, reflection metadata/file); `/v1/jobs/{id}/validation` accepts a bounded native validation explanation and requests the shared repair. SceneSpec remains unchanged. Specialist generation is internal to the single backend.

## Remaining verification and delivery work

Run simulator and physical-device checks, measure native frame/memory behavior, calibrate the real goggles, and verify STOP echo/pause/resume plus one complete practice loop. Necessary live provider checks are covered by the remaining shared $5 allowance; additional spending requires renewed authorization. Intro speech duration, actual scene appearance, interaction quality, and the one-minute generation target must be checked with real outputs. A three-minute submission video has not been recorded. See [docs/demo-walkthrough.md](docs/demo-walkthrough.md).
