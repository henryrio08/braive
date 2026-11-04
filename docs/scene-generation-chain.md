# Author, editor and spatial builder

New generation uses three model calls in sequence:

1. Spark authors an internal `ExperienceDraft` from the original request, ability, authorized history and compact capability summary.
2. A fresh Spark call receives the original source context and draft. It returns one complete `ExperienceDraft`, unchanged or revised. There is no acceptance envelope, change log, author/editor loop or user approval screen.
3. After validation, Wonder builds a `SceneSpec` from that edited experience, the assembled public plan/audio contracts and exact spatial capabilities.

The author is checked for structural validity. Semantic drafting mistakes, including pacing, go to the editor to correct. The editor's output must pass structural and semantic checks before construction. Refused content cannot reach the builder.

Backend assembly supplies session/revision metadata, character roots, stage and sound IDs, default voices, a separate completed stage, typed tool scheduling, transition whoosh and speech ducking. Sound selections are scheduled locally as `AudioPlan` layers; there is no standalone audio-model request. The builder must not trigger those sounds again through `play_sound` operations.

Planning prompts do not receive the full asset inventory, bounds or spatial-construction instructions. Those remain with the builder. New builder output rejects empty/unregistered asset IDs at the schema boundary. Existing saved wire formats remain readable.

The generated situation unfolds automatically. Its edited stage timing, movement and conversation availability must survive construction and native repair. Speech and looking around do not steer or branch the authored world. Character replies remain contextual conversation. Conversation targets can be present in any relevant timed stage, including concurrent movement, using the existing runtime representation.

One error-repair allowance is shared across structural planning failures, invalid editor results and construction failures. Native preflight gets its own single repair for failures that only loaded geometry reveals. Both are bounded by the same ten-minute readiness deadline and cumulative spending cap. Ordinary editorial changes are part of the normal second call. Construction repair reuses the edited experience and audio without rerunning either planner. Cancellation and supersession continue to apply. Prior experience context is limited to the same session or an explicitly chained parent; declined older history stays excluded.

Provider usage records now include role, schema, elapsed milliseconds, input/response bytes, token usage and success/failure. These are measurements of provider calls, not proof of physical-device comfort or end-to-end generation speed. No live provider generation or iPhone check was performed for this change; the offline suite uses fake model outputs and real schemas, construction compilation and semantic validators.

Implementation: `backend/src/experience.ts` defines the shared draft and local assembly; `generation-prompts.ts` separates role instructions; `generation-chain.ts` enforces sequencing, validation and repair ownership. The existing job endpoints still return `{plan, scene, audio}` for the iPhone.

The original [revision proposal](scene-generation-chain-plan-2026-11-03.md) records alternatives and evaluation goals. A compact scene blueprint and automatic inventory filtering remain possible follow-up architecture work. The implemented builder continues to use the existing SceneSpec and spatial compiler.
