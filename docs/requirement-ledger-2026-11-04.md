# Requirement and evidence ledger — November 4, 2026

This ledger supersedes earlier completion claims for the rehearsal-worlds work. The behavior contract is [app-transition-specification-2026-11-04.md](app-transition-specification-2026-11-04.md); the full feature plan remains [rehearsal-worlds-implementation-plan-2026-11-04.md](rehearsal-worlds-implementation-plan-2026-11-04.md). Deadlines control sequencing, never authorize silently dropping required behavior. Work advances immediately when a deliverable finishes.

Status terms: **Implemented** means source exists; **Offline verified** means a named deterministic check passed; **Native captured** means actual phone rendering was captured; **Device acceptance pending** means the complete relevant experience has not been demonstrated. Passing an importer, unit test, or synthetic stress case is not acceptance of a generated practice scene.

## Current evidence snapshot

- Latest confirmed installed phone build: **0.5 (11)**, compiled/signed/installed/verified successfully through xtool (exit 0). Installation is not proof that the complete ambitious implementation has been visually accepted.
- Build 8 and build 9 captures are in [native-review](native-review/). Build 8 shows forest/character ingredient previews; they are not generated practice scenes. Build 9 contains a revised forest and a 16-person synthetic stress capture.
- [Build 9 performance](native-review/2026-11-04-build9/performance.json): **181.031328 seconds, average 59.254937 fps, p95 presentation interval 16.689125 ms**, target_passed=true. Origin: **synthetic 16 animated people, 8 chairs, and ground**. This does not establish performance for finished architecture, a generated world, or a complete live loop.
- Build 10's review report contains startup/short capture samples, not a sustained profile; do not compare these short samples directly with the three-minute result.
- A live-provider library candidate has been recompiled after general construction fixes and persisted locally as `backend/data/visual-check/library-recompiled.json` and in `backend/data/worlds`. It passes backend compilation/contracts. Its native generated-scene review remains pending at this snapshot.
- Focused generation-chain verification after the structural fixture correction: **158/158 pass**. Focused world-commit verification: **12/12 pass**. Backend type check passes. These numbers describe the focused commands, not a claim that every current test has been rerun.
- Final integrated backend suite: **347/347 pass**, zero failures; TypeScript checking passes. Earlier restricted runs failed on filesystem/loopback permissions; the full suite passed with the required access. Full native journey acceptance remains pending.
- Continuation entry point: [FINISH_IMPLEMENTATION.md](FINISH_IMPLEMENTATION.md). The user stopped subagents and requested scaffolding for a successor agent. Preserve full scope; ignore obsolete implementation deadlines. The existing implementation is preserved, with a verification runner at `scripts/verify-completion.ps1`.
- Shared source/backend/iPhone asset manifest currently contains **361 CC0 GLBs**. See [asset-library revision](asset-library-revision-2026-11-04.md).
- Budget snapshot read from the existing local ledger: cap **$50.00**; charged plus reserved **$20.050849**; included uncertain reservations **$2.042648**; remaining **$29.949151**. No provider call was made in this documentation/validation lane. Re-read the ledger before any paid action; do not reset it.

## Requirement coverage

| Requirement | Current implementation/evidence | Remaining acceptance |
| --- | --- | --- |
| Full voice-first practice loop; no user-photo step | Current native phases preserve consent, headset check, intake, optional history, preparation, intro/reveal, practice, ratings, reflection, feedback, saving and repeat. No photo UI/API was added. | Two consecutive complete live phone loops. |
| Convincing finished scenes, beyond primitive blockouts | Curated style families, civilian rigs, books, room_shell macro with real openings/ceiling/trim, seating and functional groups exist. Retained live library passes backend compilation. | Actual generated room in both eyes, recognizability/finish/contact/lighting approval. |
| Spatial headset text and blackout | Native HeadsetPanels render textured panels and blackout through both eye cameras and the Metal optical compositor; real ingredient captures exist. | In-viewer readability, position, STOP priority and comfort. |
| Clear pre-generation space | Bundled forest clearing; headset confirmation precedes visible forest/START. Forest requires no provider call. | In-viewer final forest quality and complete opening sequence. |
| General scene construction | Individual nodes/assets remain available; enclosure, room_shell, seating_rows, scatter, platform_steps and functional_group compile into shared contracts. Tests cover families and island/cove. | Six fresh descriptions across indoor/open/confined families, including held-out descriptions, rendered natively. Synthetic fixtures do not satisfy this. |
| Source fidelity, automatic stages and useful conversation | Author/editor retain original inputs; compiler owns stage timing and route bindings; conversation uses actual participant words. | Natural speaking windows, quiet stages and relevant replies on phone. |
| Targeted same-world edits | Population, environment/lighting, material, decoration placement and actor/dialogue edits route through canonical world mutation and prepare/commit/cancel. Protected task actors/paths remain guarded. | One successful and one cancelled edit on a real generated world; scene identity and frozen timer visibly preserved. |
| Honest deferred changes | Deferred text and actually applied items are stored separately; next-attempt edits use validated candidates. Unapplied requests remain pending and are spoken. | Observe applied and unapplied outcomes in a repeat. |
| Canonical revisions and transaction recovery | Durable worlds/transactions; revision/hash checks; idempotent commit; cancellation tombstones and compensating monotonic revisions. Focused world-commit tests pass. | Lost-ack/restart recovery on phone with unchanged prior place. |
| STOP, stacked pauses, interruption recovery | Independent reasons, partial STOP priority, fresh exact confirmation, deliberate RESUME after service interruption; generation dispatch gate and stale-result guards. | STOP during preparation/intro/practice/edit/post-session; stacked interruptions; no unsolicited resume. |
| Prepared and interrupted restoration | Prepared snapshots differ from running/terminal outcomes; setup context, transaction ID and checkpoint persist. Saved world can be reconciled with server. | Relaunch before intro and during practice; restoration without regeneration. |
| Ratings, reflection, feedback, CSV | Existing null-versus-zero handling, optional reflection/feedback, evidence IDs, atomic records and CSV preserved. SessionRecord now documents actual lifecycle fields. | Verify files and quoted feedback in complete loops; save-failure retry. |
| Textures and asset service | Bundled albedo registry plus bounded generated image decode/normalization, metadata/hash fetch and reference-protected deletion. | Generated texture delivery/cache/fallback on phone. A registration service is not proof of live image-model generation. |
| Visual references | Current builder receives measured metadata/placement notes. No image pixels or runtime web reference search are supplied by scene-assets.ts. | Vetted online/library image conditioning and visual-guidance benefit are not yet demonstrated. |
| Render-aware correction | Native hard preflight and explicit diagnostic capture exist; bounded model repair and construction reports exist. | Automatic VLM review of real production renders is not claimed implemented. Development review remains required. |
| Phone performance | Build 9 synthetic three-minute result meets its recorded target. | Profile the finished generated world for three minutes; record thermal/comfort behavior. |
| Demo and submission | [Submission pack](submission-pack-2026-11-04.md) defines evidence-driven recording. | Video, upload and receipt not done. Official deadline: 20:00 America/Chicago. |

## Rules for closing a row

Preserve raw provenance and identify whether evidence is a fixture, live provider output, native capture, headset inspection, or complete practice loop. Record failed attempts too. A source change or installed build cannot close a visual acceptance row by itself. No preset practice scene, fabricated replay, weakened hard geometry check, or omitted feature is an acceptable substitute for missing evidence.
