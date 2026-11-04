# Asset library revision

The old collection prompt optimized for low-poly counts, categorical coverage and solid-color characters. Those are useful import constraints, but they do not establish recognizable forms, compatible palettes, seating fit or good composition. The revised default is a curated visual system; all original licensed IDs remain registered for saved scenes.

- **361 real CC0 GLBs**, including the original 355, a finished book group, a filled-bookcase assembly, and four civilian variants of one real Kenney source body. They are explicitly not four different body meshes. No generated mesh, renamed placeholder or paid-market asset was added.
- Prototype blockout meshes and the old chibi/mannequin characters remain available to historical scenes but are excluded from the default generation catalog. Modern home, warm classic, nature, modular architecture and technical interior kits have explicit style metadata.
- Source inspection found several classic/home chairs face the opposite direction from the universal catalog assumption. Per-asset `semantic_front_yaw_radians` describes the yaw needed to face negative Z. New seating macros apply it. The underlying historic normalization is preserved.
- Situation-dependent selection supplies actual IDs, measured bounds and placement notes, keeping requested props ahead of unrelated assets. It does not select a preset scene or prevent individual asset/node construction.
- The friendly civilian family derives from [Kenney Animated Characters Protagonists](https://kenney.nl/assets/animated-characters-protagonists), explicitly CC0. The original FBX vertices, weights, UVs and necessary bind hierarchy remain intact. Plain clothing/friendly faces derive from licensed vector skins. App-owned clips provide idle, walk, run, sit, wave and seated gesture. Each GLB has 1,604 triangles and 37 resolved native nodes including normalization wrappers; sixteen leave room for the setting under the existing budget.
- Face, hair, skin and clothing palettes stay protected. Environment edits do not recolor people. Source SVGs, license, conversion scripts, file hashes and one provenance row per runtime file are retained.

The [complete source gallery](asset-review/README.md) is a software geometry/material inspection. [Civilian pose pictures](asset-review/civilian/civilian_01-sit.png) include a real chair and grounded feet. These Blender pictures are not native animation, headset-comfort or performance acceptance. The installed app's Settings → Preview checks path captures the actual two-eye renderer and lens compositor; those pictures require inspection before visual acceptance.

Remaining source gaps are explicit: dedicated podium, whiteboard, elevator car/panel and vent GLBs. Real architectural assemblies can represent their actual structure when convincing; merely naming a box is not an acceptable substitute for an essential recognizable object. Collect additional assets only to resolve a measured visual or functional gap, not to satisfy an arbitrary mesh count.

Run `python scripts/import-lowpoly-pack.py --dry-run` to validate provenance and files. The importer preserves runtime GLB bytes and emits identical source/backend/iPhone manifests. Original saved character assets remain valid even after default generation eligibility changes.

## Native evidence and current limits

Build 8's forest and people stereo captures are actual native ingredient previews, not generated practice scenes or visual acceptance. Build 9 adds a revised forest and a synthetic 16-person stress case. Its [three-minute performance report](native-review/2026-11-04-build9/performance.json) measures 181.031 seconds, 59.2549 average fps and p95 presentation interval 16.689 ms for 16 animated people, 8 chairs and ground. The complete generated room needs its own sustained run and in-viewer inspection. Build 10 is reported installed; the filled-bookcase source is undergoing visual revision, so asset count is not a claim that every latest asset has been installed and approved.

The retained live library now passes backend compile/contracts after general compiler fixes, while its native generated-world review is pending. Empty shelves, window props against solid walls, unfinished room boundaries and primitive task props remain composition defects to inspect in actual scene output. The finished room_shell macro supplies real openings, ceiling and trim, but its availability does not prove the model used it well.

See [the requirement ledger](requirement-ledger-2026-11-04.md) for current status and [the app transition specification](app-transition-specification-2026-11-04.md) for the complete flow.
