# Spatial construction and visual design proposal

Status: implementation reference, November 2, 2026. The development branch now implements construction version 1, procedural sky and bounded surface profiles on top of the partner's automatic-experience runtime. See [implementation evidence and remaining gates](visual-implementation-2026-11-02.md). Native GPU/device acceptance is still required; this design document is not evidence of that acceptance.

## Desired experience

The participant describes their fear, current ability and boundaries during intake. The world establishes what happens around and to them through sights, sounds, movement and events. They experience the scene without narrating actions, navigating by voice or answering repeated navigation questions. Speech belongs only where it is reasonable in the situation. Looking around never initiates travel. STOP remains an immediate local control over movement, narration and visual animation.

Action experiences remain silent between characters and participant. If any character dialogue is needed, classify the whole experience as conversation, even alongside walking or another physical activity. Conversation classification does not replace the requested movement. Routine stages remain unannounced; the brief contextual introduction and local STOP controls remain available.

Construction must preserve task identity: a skydive has an exit and descent; an interview has supported seated participants and usable sightlines; a trail has navigable connected routes. A polished backdrop cannot stand in for those properties.

## Proposed pipeline and ownership

| Step | Owner | Output | Acceptance condition |
| --- | --- | --- | --- |
| Intent and experience | Spark | Situation, boundaries, outcomes, cast, duration, decisions, automatic events | Requested task and constraints explicitly represented |
| Spatial and visual authoring | Wonder | Assemblies, anchors, relations, routes, environment parameters | Every requirement has a concrete realization |
| Resolve construction | Backend deterministic compiler | Asset-bound transforms, stable IDs, paths, executable SceneSpec | Support, fit, clearance, references and budgets checked |
| Native preflight | iPhone | Both-eye snapshots and actual resource results | Opening and relevant later states remain usable |
| Execute | iPhone | Local stage/events/movement plus optional conversation | Pauses freeze the same active clock |

Retain the two primary planning/authoring calls and existing audio selection. Intermediate construction information is structured output from those calls, not an extra chain of model calls. The ten-minute generation/readiness ceiling and one shared repair remain. Aim for a few minutes on an ordinary description without trading away task fidelity, validation or visual quality. Account for compiler and native loading time in the deadline; check again after loading, before reveal.

Application code owns camera calibration, identifier allocation, capability manifests, execution, validation and budgets. Models own intent, composition, object selection, supported relations and allowed parameters. Models never supply executable shader code, URLs or device controls.

## Data boundaries

Keep the external job API separate from internal construction artifacts. Introduce a versioned `construction_plan` internally before replacing the current SceneSpec output. Existing saved SceneSpec and AudioPlan remain readable; new intermediate plans carry an explicit compiler version. A capability version identifies the exact supported operations, profiles and limits. Do not add fields to provider schemas until they have executable native behavior and validation.

Suggested internal records:

- `Requirement`: stable ID, source (request/boundary/coordinator), target entity/task, acceptance predicate, severity. Hard user constraints cannot be optimized away.
- `Zone`: ID, local frame, usable bounds, indoor/outdoor/enclosed classification and intended role. Dimensions are meters.
- `Assembly`: ID, parent/local frame, semantic purpose, registered asset or procedural parts, parameter values, anchors and requirement references. Different instances may share an assembly definition.
- `Anchor`: local position/orientation, kind (support/seat/attachment/entry/exit), usable footprint and compatibility. Measure real assets; do not infer seat height from a standing bounding box.
- `Relation`: subject, relation kind, target/anchor, offsets, tolerance, hard/soft status. Initially support on, inside, faces, attached-to, near and clear-of.
- `Route`: actor/viewer, start/end anchors, corridor or waypoints, clearance radius/height, interpolation, speed/acceleration limits and stage references.
- `Event`: trigger, preconditions, effects, resource ownership and completion condition. Distinguish simulation completion from stage entry.
- `VisualEnvironment`: sky mode, palette, light direction/intensity, fog distances and approved surface profiles.

Example interpretation: an interviewer is supported by a seat anchor on a chair; the chair is supported by the floor; the interviewer's face points toward the participant; a desk is in front of the interviewer but leaves a clear sightline. The compiler resolves these relations using the registered assets' measured dimensions. It returns a conflict if the requested layout cannot fit, instead of silently shrinking people or changing the room.

## Deterministic construction rules

Resolve parent transforms and support relations first, then facing/spacing, then task routes, then decoration. Detect cycles and conflicting hard constraints with precise entity/requirement IDs. Use stable ordering and a stored seed so a repair can be compared with its predecessor.

Use a participant capsule and actor bounds for swept-route clearance. Floor support is required for walking, while a declared swim/fall/glide segment may intentionally be unsupported. Doors and furniture must leave task-appropriate usable space. No topic-specific room templates: assemblies and constraints are reusable capabilities.

Treat simultaneous motion as resource ownership: two events cannot independently drive the same viewer/actor transform. A completion event must depend on a path started on a reachable execution branch, with an unambiguous run identity. Remember completion until consumed rather than exposing it for only one frame. Reject future-only dependencies and impossible branches.

Allow alternatives where the task calls for a decision. The construction dependency graph may be ordered while the experience branches. Do not turn construction order into a sequence of required spoken commands. Automatic event triggers, local user actions, optional conversation and exit controls remain distinct.

## Sky and environment

Fluid and gas conditions are explicit planning data. The coordinator identifies air, water or mixed conditions, whether motion is still, visually suggested or an authored viewer path, visibility, participant motion and any dynamics the app cannot produce. Medium regions bind water visuals and actual swim paths to zones. Water sheets are non-solid; separate pool boundaries and floor geometry supply support. Fog currently affects the scene globally. Water ripples, foliage flutter and fog cannot stand in for buoyancy, currents, splashes, smoke transport, pressure or moving gas volumes. Future physical fluid/gas work needs separately bounded simulation, audio and native performance evidence; a claim in prose does not enable it.

First implementation: app-owned procedural sky with horizon/zenith colors, sun direction, haze and bounded cloud coverage. Consider licensed cubemaps/panoramas afterward, using registered IDs and source provenance. Avoid adding a generated image request to the critical path.

Sky remains effectively distant and consistent between eyes. Ground, walls, nearby landscape and task objects provide real stereo depth. Enclosed interiors must not gain an outdoor vista just to pass a generic depth test.

Separate sky/background, fog and illumination. Fog uses explicit near/far distances appropriate to the space rather than being derived only from camera far clipping. Underwater or interior transitions change a whole environment profile coherently. Sky brightness, sun and ambient light should agree.

## Surface profiles

Models select an app-owned profile ID and bounded scalar/color parameters. Initial candidates:

| Profile | Parameters | Native behavior |
| --- | --- | --- |
| matte | base color, roughness | Existing low-cost surface |
| ground | palette, variation scale/strength | Subtle deterministic world-space variation |
| water | color, opacity, wave scale/speed | Subtle normal/color ripples; stable geometry |
| glass | tint, opacity, roughness | Consistent transparent surface/depth behavior |
| foliage | palette, light variation/speed | Subtle light flutter; stable silhouettes/collision |

Final parameter ranges depend on device measurements. Shader source and profile definitions live in app code. Use a shared active-time uniform for both eyes; STOP and other pauses freeze surface motion. Imported character skin, hair and authored materials remain intact unless a supported override explicitly targets a registered clothing material.

The current development implementation supplies a shared gentle luminance-banding shader and all five bounded profiles for native review. Shared style parameters adapt its strength to the setting; approved character materials remain protected. Physical-device measurements must establish which settings are acceptable before release. Extra full-screen effects, bloom and multiple render passes are not assumed affordable. Lens correction remains independent of scene appearance.

## Validation and repair

Validate four separate layers: schema/reference correctness, semantic requirement realization, geometric feasibility, and actual rendered/device quality. A schema pass is never a claim that the scene looks convincing.

Preflight snapshots use the effective initial state after initial operations, then sample stage boundaries, important viewpoints and route extrema. Preserve opacity, sidedness, alpha masks and visibility. A skybox never satisfies task-focus or near/middle depth requirements by itself. Transparent surfaces need explicit GPU negative controls.

Repair feedback names the requirement, involved entities, measured/allowed values and document path. Repair only affected relations/assemblies and preserve stable identities and coordinator decisions. Prefer removing optional decoration over changing the task or participants.

Measure actual draw calls, texture allocation, resident memory and frame time on the phone. Current declared targets are not sufficient evidence. Set final effect budgets from those measurements; retain existing enforced node/geometry caps until revised with evidence.

## Migration and acceptance

1. Reconcile the partner's automatic-experience contract; establish explicit completion and branch semantics.
2. Introduce internal spatial-plan fixtures and measured asset anchors/bounds. Compile a few fixture plans into the existing SceneSpec without a provider change.
3. Add procedural sky and one surface profile behind capability-version selection. Preserve legacy rendering for stored records.
4. Change authoring output to the supported construction representation; keep the external job lifecycle stable.
5. Run fresh generation plus native visual/device checks before claiming improvement.

Compare a seated interview, crowded speaking area, branching trail, tight enclosure and water/altitude action experience. Capture both-eye opening/later views and a diagnostic overhead view. Evaluate support, route clearance, task recognizability, automatic progression, remaining user choices, transparency and STOP/NO during motion/effects. Record generation time and physical-device frame/memory behavior. Label offline replay separately from fresh generation.

## Evidence informing this proposal

[Holodeck (CVPR 2024)](https://arxiv.org/abs/2312.09067) uses spatial relations and constraint-based layout. [SHOP/M-SHOP](https://drum.lib.umd.edu/items/a777fa5a-2c64-4ead-ba63-5f1497fcbe85) supplies the task-decomposition/world-state model. [buildingSMART IDS](https://github.com/buildingSMART/IDS/blob/development/Documentation/UserManual/README.md) separates applicability from machine-checkable information requirements. The structures above are proposed adaptations, not adoption of those entire systems, and their results do not establish quality in Braive.
