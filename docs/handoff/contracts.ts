// Generated from openapi.json; runtime bounds and cross-field rules remain authoritative.

export type Intensity = { "summary": string; "dimensions": Array<{ "name": string; "value": number; "meaning": string }> };

export type HistoryRow = { "session_id": string; "topic": string; "intensity": Intensity; "planned_seconds": number; "active_seconds": number; "outcome": string; "reported_difficulty"?: number; "reported_readiness"?: number; "reflection_summary"?: string; "intensity_1_10": number };

export type PlanRequest = { "schema_version": "1"; "session_id": string; "revision": number; "fear_description": string; "current_ability": string; "preferences": Array<string>; "relevant_history": Array<HistoryRow>; "history_choice": "accepted" | "declined" | "not_available" | "chain_reuse"; "parent_session_id"?: string; "builder_additions": Array<string>; "use_history": boolean; "chained_rerun": boolean };

export type Character = { dialogue_style?: string; "asset_id"?: string; "color_hex"?: string; "id": string; "name": string; "role": string; "appearance_brief": string; "goal": string; "behavior_boundaries": Array<string>; "voice_id": string; "scene_node_id": string };

export type ToolCall = ({ "tool": "compose_scene"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "setting_brief": string; "intensity_1_10": number; "props": Array<string>; "interaction_mode": "solo" | "dialogue" | "navigation" | "mixed" } }) | ({ "tool": "plan_audio"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "audio_brief": string; "intensity_1_10": number; "duration_sec": number; "transition_whoosh_required": true } }) | ({ "tool": "generate_feedback"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "observation_source": "current_session_observations"; "tone": "coaching_nonclinical"; "max_did_well": 3; "max_noticed": 3 } }) | ({ "tool": "adapt_session"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "observation_source": "completed_session_observations"; "history_source": "authorized_chain_history" } }) | ({ "tool": "character_turn"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "character_id": string; "context_source": "current_turn_and_recent_history" } }) | ({ "tool": "revise_scene"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "additional_input": string; "base_revision": number } });

export type NarratorBeat = { "at_active_second": number; "text": string };

export type SessionPlan = { construction_brief?: ConstructionBrief; "schema_version": "1"; "session_id": string; "revision": number; "topic": string; "task_instruction": string; "setting_brief": string; "props": Array<string>; "intensity": Intensity; "intro_target_seconds": 8; "narrator_beats": Array<NarratorBeat>; "characters": Array<Character>; "interaction_mode": "solo" | "dialogue" | "navigation" | "mixed"; "tool_calls": Array<ToolCall>; "adaptation_rationale"?: string; "intensity_1_10": number; "topic_short": string; "duration_sec": number; "narrator_intro_8s": string; "stop_reminder": "To stop at any time, just say STOP!"; "audio_brief": string; "safety": SafetyDecision; "experience"?: ExperiencePlan };

export type Asset = { "id": string; "kind": "mesh" | "texture" | "audio"; "description": string; "origin": "bundled" | "generated"; "bounds_meters"?: Array<number> };

export type SceneRequest = { "plan": SessionPlan; "capabilities_version": string; "asset_manifest": Array<Asset>; "previous_scene"?: SceneSpec; "revision_instruction"?: string };

export type Geometry = ({ "kind": "box"; "size": Array<number> }) | ({ "kind": "plane"; "width": number; "height": number }) | ({ "kind": "sphere"; "radius": number }) | ({ "kind": "cylinder"; "radius": number; "height": number }) | ({ "kind": "asset"; "asset_id": string });

export type Material = { surface?: SurfaceProfile; "color": string; "roughness": number; "texture_asset_id"?: string; "texture_scale"?: number; "opacity"?: number; "double_sided"?: boolean };

export type SceneNode = { collision_role?: "solid" | "none"; support_node_id?: string | null; support_contact?: [number,number,number]; "id": string; "parent_id": string | null; "role": "environment" | "prop" | "character" | "task_focus"; "geometry": Geometry; "position": Array<number>; "rotation_radians": Array<number>; "scale": Array<number>; "material": Material; "animation": "none" | "idle" | "listen" | "speak" | "gesture" | "walk" | "run" | "swim" | "sit"; "description": string; "prop_name"?: string };

export type WorldOperation = ({ "type": "set_visible"; "node_id": string; "visible": boolean }) | ({ "type": "set_material"; "node_id": string; "material": Material }) | ({ "type": "character_action"; "character_id": string; "behavior": "idle" | "listen" | "speak" | "gesture" | "walk" | "run" | "swim" | "sit" }) | ({ "type": "viewpoint_transition"; "destination_id": string; "transition": "fade" }) | ({ "type": "narrate"; "text": string }) | ({ "type": "play_sound"; "cue_id": string }) | ({ "type": "move_viewer"; "path_id": string }) | ({ "type": "move_node"; "node_id": string; "path_id": string; "face_motion": boolean }) | ({ "type": "set_environment"; environment?: VisualEnvironment; "background_color": string; "fog_density": number; "ambient_intensity"?: number });

export type Choice = { "id": string; "label": string; "intent_examples": Array<string>; "operations": Array<WorldOperation> };

export type Interaction = { "id": string; "prompt": string; "trigger": "user_request" | "scene_start" | "scheduled" | "choice_completed"; "at_active_second"?: number; "choices": Array<Choice> };

export type SceneSpec = { construction_plan?: ConstructionPlan; construction_report?: {compiler_version:"1";resolved_relation_ids:string[];warnings:ValidationIssue[];accepted_defects?:ValidationIssue[];corrections?:string[];recovery?:"first_pass"|"deterministic"|"patched"|"rebuilt"}; environment?: VisualEnvironment; "schema_version": "1"; "session_id": string; "revision": number; "description": string; "nodes": Array<SceneNode>; "viewpoints": Array<{ "id": string; "position": Array<number>; "description": string }>; "initial_viewpoint_id": string; "lighting": { "ambient_color": string; "ambient_intensity": number; "key_direction": Array<number>; "key_intensity": number }; "atmosphere": { "background_color": string; "fog_density": number }; "interactions": Array<Interaction>; "events": Array<{ "at_active_second": number; "operation": WorldOperation }>; "stereo": StereoSpec; "reveal": RevealSpec; "scenario"?: ScenarioSpec; "motion_paths"?: Array<MotionPath>; "view_distance_meters"?: number; "viewer_attached_node_ids"?: Array<string> };

export type AudioRequest = { "plan": SessionPlan; "available_assets": Array<Asset> };

export type AudioLayer = { "id": string; "asset_id": string; "role": "music" | "ambience" | "sfx"; "loop": boolean; "gain": number; "position"?: Array<number>; "start_active_second": number; "end_active_second"?: number; "ramps": Array<{ "at_active_second": number; "gain": number; "fade_seconds": number }> };

export type AudioPlan = { "schema_version": "1"; "session_id": string; "revision": number; "layers": Array<AudioLayer>; "transition_whoosh_asset_id": string; "duck_gain_during_speech": number; "rationale": string };

export type DialogueRequest = { "schema_version": "1"; "session_id": string; "revision": number; "turn_id": string; "character_id": string; "user_utterance": string; "recent_turns": Array<{ "speaker_id": string; "text": string }>; "context_summary": string; "remaining_seconds": number; "available_choices": Array<Choice> };

export type DialogueResult = { "schema_version": "1"; "session_id": string; "revision": number; "turn_id": string; "character_id": string; "reply": string; "behavior": "idle" | "listen" | "speak" | "gesture"; "context_summary": string; "operations": Array<WorldOperation> };

export type Observation = { "id": string; "session_id": string; "kind": "active_duration" | "stop_count" | "self_report" | "speech_excerpt" | "task_action" | "dialogue_turn"; "source": "app_event" | "user_report" | "transcript"; "value": string | number; "at_active_second"?: number };

export type FeedbackRequest = { "plan": SessionPlan; "observations": Array<Observation> };

export type FeedbackItem = { "text": string; "evidence_ids": Array<string>; "valence": "positive" | "negative"; "small_improvement"?: string };

export type FeedbackResult = { "schema_version": "1"; "session_id": string; "revision": number; "did_well": Array<(FeedbackItem) & ({ "valence"?: "positive" })>; "noticed": Array<FeedbackItem>; "one_quick_fix"?: string; "tone": "coaching_nonclinical" };

export type AdaptationRequest = { "previous_plan": SessionPlan; "observations": Array<Observation>; "relevant_history": Array<HistoryRow>; "user_preferences": Array<string> };

export type AdaptationResult = { "session_id": string; "direction": "maintain" | "ease" | "increase" | "mixed"; "intensity": Intensity; "duration_seconds": number; "changes": Array<{ "dimension": string; "before": string; "after": string; "reason": string }>; "spoken_summary": string; "evidence_ids": Array<string>; "intensity_1_10": number };

export type BuilderRevision = { "schema_version": "1"; "session_id": string; "revision": number; "additional_input": string; "previous_plan": SessionPlan };

export type Reflection = { "id": string; "session_id": string; "created_at": string; "display_title": string; "topic": string; "relative_file_path": string; "transcript": string; "local_date": string; "local_time": string; "timezone": string };

export type SessionRecord = { world_id?: string; setup_context?: SessionSetupContext; pending_world_transaction?: string; deferred_changes?: string[]; deferred_applied?: string[]; adaptation_applied?: string[]; checkpoint?: Record<string,unknown> | null; render_metrics?: Record<string,unknown> | null; applied_operations?: WorldOperation[]; turns?: Array<Record<string,unknown>>; scene?: SceneSpec; audio?: AudioPlan; observations?: Array<Observation>; adaptation?: AdaptationResult | null; reflection_file?: string; reflection?: Record<string, unknown>; "schema_version": "1"; "session_id": string; "parent_session_id"?: string; "started_at": string; "ended_at"?: string; "plan": SessionPlan; "scene_revision": number; "active_seconds"?: number; "stop_count"?: number; "outcome": "prepared" | "running" | "completed" | "user_ended" | "interrupted" | "failed"; "reported_difficulty": number | null; "reported_readiness": number | null; "reflection_id"?: string; "feedback"?: FeedbackResult; "generation_provenance": { "mode": "live" | "replay"; "model_ids": Array<string>; "request_ids": Array<string> }; "use_history": boolean; "chained_rerun": boolean; "intensity_1_10": number; "topic_short": string; "early_end"?: boolean };

export type ValidationIssue = { "path": string; "rule": string; "message": string; "classification"?: "hard" | "soft"; "outdoor"?: boolean; "severity"?: number; "measured"?: string; "allowed"?: string };

export type Error = { "code": "INVALID_INPUT" | "UNAUTHORIZED" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "TIMEOUT" | "INVALID_MODEL_OUTPUT" | "CANCELLED" | "CONFLICT" | "NOT_FOUND"; "message": string; "retryable": boolean; "request_id": string; "issues"?: Array<ValidationIssue>; "retry_after_ms"?: number };

export type GenerationResult = { "plan": SessionPlan; "scene": SceneSpec; "audio": AudioPlan };

export type Job = { "job_id": string; "session_id": string; "revision": number; "status": "pending" | "running" | "succeeded" | "failed" | "cancelled"; "stage": string; "result"?: GenerationResult; "error"?: Error };

export type TranscriptionBootstrapRequest = { "session_id": string; "language_hint"?: string };

export type TranscriptionBootstrap = { "websocket_url": string; "session_token": string; "expires_at": string };

export type SafetyDecision = { "decision": "ok" | "soften" | "refuse"; "reason": string; "practice_preserving_alternative": string };

export type StereoSpec = { "presentation": "stereographic"; "units": "meters"; "coordinate_system": "right_handed_y_up"; "eye_calibration": "device_viewer_profile"; "camera_control": "app_owned" };

export type RevealSpec = { "black_intro_seconds": 8; "fade_seconds": number; "blur_to_clear_seconds": number };

export type EnvironmentSpec = SceneSpec;

export type SessionFeedback = FeedbackResult;

export type ExperiencePlan = { "progression"?: "guided"; "kind": "action" | "conversation"; "objective": string; "requires_motion": boolean; "stages": Array<{ "id": string; "goal": string; "action_ids": Array<string> }> };

export type MotionPath = { clearance_radius_meters?: number; eye_height_meters?: number; start_position?: number[]; "id": string; "purpose": "walk" | "run" | "swim" | "climb" | "fall" | "glide" | "ride" | "other"; "interpolation": "linear" | "smooth"; "coordinate_space"?: "world" | "relative"; "points": Array<{ "at_seconds": number; "position": Array<number> }> };

export type ScenarioAction = { "id": string; "label": string; "phrases": Array<string>; "operations": Array<WorldOperation>; "next_step_id": string | null };

export type ScenarioCompletion = { "trigger": "after_seconds" | "motion_complete"; "after_seconds"?: number; "motion_path_id"?: string; "next_step_id": string };

export type ScenarioStep = { conversation_target?: string; announce_on_entry?: boolean; review_viewpoint_id?: string; focus_node_ids?: string[]; "id": string; "prompt": string; "terminal": boolean; "start_operations": Array<WorldOperation>; "actions": Array<ScenarioAction>; "completion"?: ScenarioCompletion };

export type ScenarioSpec = { "progression"?: "guided"; "objective": string; "initial_step_id": string; "dialogue_policy": "disabled" | "on_request" | "natural"; "steps": Array<ScenarioStep> };

export type MediumBehavior = {substance:'air'|'water'|'mixed';motion:'still'|'suggested_by_visuals'|'authored_viewer_path';visibility:'clear'|'foggy';participant_motion:'none'|'swim'|'fall'|'glide';unsupported_dynamics:string[]};
export type MediumRegion = {id:string;zone_id:string;medium:'air'|'water';surface_node_id?:string;flow_visual:'none'|'ripples'|'foliage_flutter';viewer_path_ids:string[]};
export type ConstructionBrief = { spatial_intent: string; must_preserve: string[]; expected_outcomes: string[]; medium_behavior?:MediumBehavior };
export type SurfaceProfile = { profile: 'matte'|'ground'|'water'|'glass'|'foliage'; scale: number; strength: number; speed: number };
export type VisualEnvironment = { style?:{light_bands:number;strength:number}; mode:'interior'|'outdoor'|'underwater'; sky:{kind:'solid'|'procedural';horizon_color:string;zenith_color:string;ground_color:string;sun_color:string;sun_size_degrees:number;haze:number;cloud_coverage:number}; fog:{color:string;start_meters:number;end_meters:number}; lighting_environment_intensity:number };
export type ConstructionPlan = {
 version:'1';seed:number;
 requirements:Array<{requirement_id:string;node_ids:string[];stage_ids:string[];path_ids:string[]}>;
 zones:Array<{id:string;center:[number,number,number];size:[number,number,number];kind:'interior'|'outdoor'|'enclosure'}>;
 assemblies:Array<{id:string;root_node_id:string;member_node_ids:string[];zone_id:string;requirement_ids:string[]}>;
 anchors:Array<{id:string;node_id:string;kind:'support'|'seat'|'attachment'|'entry'|'exit';position:[number,number,number];footprint:[number,number]}>;
 relations:Array<{id:string;kind:'on'|'inside'|'within'|'faces'|'attached_to'|'near'|'clear_of';subject_id:string;target_id:string;anchor_id?:string;subject_anchor_id?:string;offset:[number,number,number];clearance:number;tolerance:number;required:boolean}>;
 routes:Array<{path_id:string;from_anchor_id?:string;to_anchor_id?:string;stage_ids:string[];requirement_ids:string[];clearance_radius_meters:number;eye_height_meters:number}>;
 medium_regions?:MediumRegion[];
 macros?:AssemblyMacro[];
};
export type AssemblyMacro =
 | FinishedRoomMacro
 | {id:string;kind:'seating_rows';root_node_id:string;zone_id:string;chair_asset_id:string;rows:number;seats_per_row:number;origin:[number,number,number];seat_spacing:number;row_spacing:number;facing_yaw:number;character_node_ids?:string[]}
 | {id:string;kind:'enclosure';root_node_id:string;zone_id:string;center:[number,number,number];size:[number,number,number];wall_height:number;opening_width:number;wall_asset_id?:string}
 | {id:string;kind:'scatter';root_node_id:string;zone_id:string;asset_id:string;count:number;area_center:[number,number,number];area_size:[number,number];min_spacing:number;seed_offset:number}
 | {id:string;kind:'platform_steps';root_node_id:string;zone_id:string;origin:[number,number,number];steps:number;step_height:number;step_depth:number;width:number;platform_depth:number}
 | {id:string;kind:'functional_group';root_node_id:string;zone_id:string;origin:[number,number,number];facing_yaw:number;desk_asset_id?:string;chair_asset_id:string;include_desk:boolean};
export type FinishedRoomMacro = {id:string;kind:'room_shell';root_node_id:string;zone_id:string;center:[number,number,number];size:[number,number,number];wall_thickness:number;ceiling:boolean;wall_material:Material;floor_material:Material;trim_color:string;ceiling_color:string;openings:Array<{id:string;wall:'north'|'south'|'east'|'west';offset:number;width:number;height:number;sill_height:number;kind:'door'|'window'}>};

// Additive same-world and generated-asset interfaces. Runtime validation remains authoritative.
export type SessionSetupContext = {fear:string;ability:string;use_history:boolean;history_ids:string[]};
export type WorldDocuments = {plan:SessionPlan;scene:SceneSpec;audio:AudioPlan};
export type WorldRevisionRequest = WorldDocuments & {session_id:string;expected_revision:number;revision:number;world_id?:string;transaction_id?:string};
export type WorldRevisionResult = WorldDocuments & {session_id:string;revision:number;world_id:string;status:'prepared'|'committed';hash:string};
export type WorldLookupResult = WorldDocuments & {world_id?:string;hash:string;experience?:unknown};
export type WorldCancelResult = {status:'cancelled';world_id?:string;plan?:SessionPlan;scene?:SceneSpec;audio?:AudioPlan};
export type WorldEditResult = WorldDocuments & {status:'clarify'|'ready'|'deferred'|'unchanged';question:string;summary:string;deferred:string[];expected_revision:number};
export type GeneratedTextureUpload = {content_base64:string;format?:'png'|'jpeg';purpose?:'surface'|'distant'};
export type GeneratedTextureMetadata = {id:string;file:string;format:'png'|'jpeg';bytes:number;sha256:string;width:number;height:number;purpose?:'surface'|'distant'};
export type JobPauseRequest = {paused:boolean;sequence?:number};
