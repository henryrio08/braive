# Post-session loop audit — November 2, 2026

Baseline: the original framework's self-report, optional reflection, optional feedback, automatic SESSIONS spreadsheet, adapted repeat and return to the original forest. Later implementation changes preserve these requirements. Generation, visuals and model prompts remain with BraveWork; this change concerns the native controller and persistence.

## Fixed

- Ratings/reflection references previously waited for the final save. Completion, each rating, reflection reference and received feedback now update the durable record and CSV immediately. Existing session IDs replace rows; record order stays chronological.
- The final save previously waited on a server provenance request. Local saving now completes first; a bounded optional metadata fetch updates the latest matching saved record, never a stale copy or a deleted record. Declining feedback/reflection still saves without network access.
- Invalid or ambiguous rating speech previously advanced as a missing score. Clear 0–10 answers advance, zero remains zero, and explicit SKIP stores null. Other answers stay open for correction; waiting phrases do not become score one.
- Local save errors previously entered the general scene retry path. RETRY now retries that same local write and resumes its pending post-session step. Controls show only the relevant retry action. The durable JSON survives a CSV-write failure and can rebuild the spreadsheet on retry/relaunch.
- Feedback is saved before narration, then advances automatically after narration finishes. CONTINUE remains an optional shortcut. Empty feedback sections do not produce empty praise headings; stale response guards remain. Provider-generated grounding is still checked by existing server evidence/schema validation; this audit does not claim semantic truth from valid IDs alone.
- Reflection filenames retain local Gregorian date/time, the visible HH:mm title, a sanitized portable filename and topic limited to 30 characters. The formatter uses a stable locale. Collision handling preserves both files.
- Relevant past practice excludes unfinished/interrupted runs. A repeat combines only already-authorized history with the just-finished run and removes duplicate IDs. A declined older-history selection is not silently reintroduced.
- Adapted requests now carry every structured proposed change, rather than only the spoken summary. The explanation finishes before generation starts. Duplicate commands during adaptation and late adaptation responses cannot restart a newer session.

## Verification

The simulator build passes. An explicit `--post-session-audit` run exercises the actual Session controller with isolated temporary records and injected speech/feedback, without microphone, provider calls or real user records. All **16 native checks** pass: immediate save, invalid-rating wait, durable five/zero scores, reflection content/file/reference, declined feedback, excluded older history, deduplicated chain, forest return, both options declined, reopen durability, forced CSV-write failure/local retry, feedback persisted before playback completion, automatic advance and stale feedback rejection.

`scripts/check-post-session.swift` passes 12 rating cases and chain-history assertions. `scripts/check-storage.swift` passes, including duplicate-save prevention, spreadsheet formula escaping, null/zero distinction, interrupted recovery, 30-character reflection title, collision/content preservation and completed-history filtering.

The native audit simulates the speech-completion callback for feedback and bypasses transition delays; it is not a live microphone or TTS timing check. Adaptation propagation/ownership was reviewed in source, without a live model call. Physical voice, actual feedback delivery timing, and a newly generated adapted repeat remain pending with the phone disconnected. No Meta spending was used.

Reproduce the portable checks with JSON.swift, SessionStore.swift and check-storage.swift; for rating/chain checks compile JSON.swift, VoiceInput.swift, PostSession.swift and check-post-session.swift. Compile with a writable module cache. For the native controller audit, launch the Debug simulator app with `--post-session-audit` and read Documents/PostSessionAudit.json. Synthetic data lives in a separate temporary store, not the user's Sessions directory.
