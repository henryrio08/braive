# Review follow-up — November 2, 2026

Changes on `codex/braive-work` address concrete defects from the independent review. The original review is retained as a snapshot. The user explicitly approved a separate $50 ledger on this machine and reaffirmed keeping that cap; no budget logic or cap was changed. Provider access remains disabled during offline work.

## Implemented

- Audio rejects duplicate layer IDs, inverted/out-of-session layer times, and ramps outside their layer. Native playback no longer constructs a trapping duplicate-key dictionary. Scheduled players use layer identities; transient cues use a separate namespace so shared asset filenames do not overwrite ambient layers.
- Motion completion cannot depend on a path launched only by a later stage. Incoming and current local motion remain supported. Terminal stages cannot contain unfinished participant actions, and automatic terminal completion waits for pending viewer/actor movement. The coordinator's overall countdown still bounds the practice.
- Native preflight applies initial visibility/material/viewpoint operations and time-zero events before checking the opening scene. Visibility masks retain opacity, transparent-material settings, sidedness and depth settings instead of always using opaque defaults.
- Feedback requests are canceled/invalidated when saving, starting a new session or failing. Delayed responses check nonce, session, revision and phase before speaking or writing. The server also rejects post-session results with mismatched ownership fields.
- Fade and blur consume their respective declared reveal durations. Overlong intros use neutral situational copy and recheck the fallback duration; a voice that still cannot fit fails explicitly.
- New session records retain the generated scene and audio plan in addition to the coordinator plan. Legacy records remain readable.
- Unsupported texture/spatial-audio fields are explicitly rejected. The capability manifest stops advertising unmeasured draw-call/memory limits as enforced caps. OpenAPI authored-node bounds match the 350-node loader cap, documents historical specialist/transcription interfaces, and includes validation/provenance routes. Current documentation reflects clothed characters, procedural prop assemblies and the $50 cap.

## Boundaries and remaining work

These fixes do not implement the new visual construction system. Structural motion reachability is improved but is not a complete branch-sensitive temporal proof. Swept route clearance, support geometry, richer branching/automatic behavior and reliable later-stage visual checks are specified in `visual-construction-design.md`. Coordinate behavior changes with the partner's current work.

Viewpoint transitions still relocate without the declared fade. Asset material overrides remain intentionally narrow, alpha-cutout texture semantics need GPU review, and sustained memory/draw-call accounting needs the actual device. These limitations are documented rather than represented as fixed or measured. Runtime tool calls still describe a fixed backend pipeline rather than a general dispatcher; the proposed construction design separates internal artifacts from the public wire API.

Session scene/audio persistence is implemented; periodic active-progress checkpoints and crash-resuming an experience are not. Separate local ledgers are now explicitly accepted, not synchronized across devices.

## Verification

Backend type checking and 47 backend checks passed after the validation/playback fixes. Swift source parsing passed for all app Swift files, and the portable speech-coordination check passed 18 assertions, including terminal movement completion. Native framework type checking, GPU/render checks, device audio and physical-phone behavior remain unverified here because the Apple SDK is not installed. Linux parsing is not an iPhone build.

No live provider requests were made. Secrets and local testing tools are ignored and excluded from the commit.
