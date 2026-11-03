# Contextual loading tips

The original framework requires a tips preloader at launch and destination-specific transition tips. The local source bank is `ios/Braive/LoadingTips.swift`: 30 short tips with stable IDs and one or more TipContext tags. No model call, personal-session inference or new spending is involved.

Contexts cover launch, lobby, headset confirmation, situation, ability/boundaries, readback, history consent, scene preparation, ratings, reflection, feedback, saving and adapted repeats. Copy describes actual product behavior without claiming improvement or inventing progress. Add or edit bank entries rather than embedding new text in views.

Selection shuffles relevant tips. Scene preparation always starts with “To stop at any time, just say STOP!” including retry/builder revisions. Longer waits rotate every eight active UI seconds and visit the entire selection before repeating. Pausing freezes the interval. Tips neither speak nor trigger a whoosh; existing transitions retain their whoosh. Builder listening shows its listening prompt instead of rotating tips. Active practice, introduction and reveal retain their own presentation.

The launch preloader lasts 1.2 seconds, then shows existing welcome/consent controls. Existing fast page transitions remain 0.45 seconds; no artificial reading delay was added. Long waits such as generation, feedback, saving and adaptation show the relevant rotating bank. Existing next-step commands remain available. The compact HUD layout can omit secondary text on exceptionally short screens to preserve essential controls.

Verification: portable tip checks cover context coverage, unique IDs, short text, STOP-first ordering, interval behavior and complete cycles without repeats. Run:

```sh
xcrun swiftc -module-cache-path /tmp/braive-swift-cache ios/Braive/LoadingTips.swift scripts/check-loading-tips.swift -o /tmp/braive-tip-check
/tmp/braive-tip-check
```

Native simulator and signed phone builds pass. The real SwiftUI HUD rendered all 30 tips at 667×240 and 852×340; the longer movement tip and exact STOP reminder were visually inspected in the smaller layout without truncation. The physical-phone check remains pending. No provider requests were made.

Integration note for BraveWork: this work is based on its `5cb7522` runtime follow-up. Native compilation exposed unsupported `SCNNode.userData` and String-keyed hit-test options in RouteAudit. Collision roles now live in a weak-key native map, and segment checks use SCNHitTestOption raw keys. These are API compatibility fixes; generation/prompt/visual design was not changed. The broader route/GPU/device audits are not claimed as verified by this tips check.
