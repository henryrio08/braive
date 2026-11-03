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

The implementation follow-up is described in `runtime-followup-2026-11-02.md`. It integrates the partner's `8d11d55` guided-experience update and covers the code gaps previously listed here: motion-owner graph validation, bounded mesh route/support checks, later-stage review, pause-aware fades, supported material overrides, resource telemetry, typed tool dispatch, and periodic checkpoints with explicit recovery.

The remaining gate is verification on Apple's frameworks/GPU and the physical phone. Native diagnostic controls have been added for transparent/cutout surfaces, thin route barriers, and unsupported walking, but have not run on this Windows host. Actual SceneKit draw-call counts require a GPU capture; the app labels its submission count as an estimate. Mesh segment probes are bounded checks, not a general collision/physics solver. These are explicit evidence limits, not claims of device success.

The visual construction system remains design-only. Separate local ledgers remain explicitly accepted, not synchronized across devices.

## Verification

Backend type checking and 47 backend checks passed after the validation/playback fixes. Swift source parsing passed for all app Swift files, and the portable speech-coordination check passed 18 assertions, including terminal movement completion. Native framework type checking, GPU/render checks, device audio and physical-phone behavior remain unverified here because the Apple SDK is not installed. Linux parsing is not an iPhone build.

No live provider requests were made. Secrets and local testing tools are ignored and excluded from the commit.
