// Generated from openapi.json; runtime bounds and cross-field rules remain authoritative.

export type Intensity = { "summary": string; "dimensions": Array<{ "name": string; "value": number; "meaning": string }> };

export type HistoryRow = { "session_id": string; "topic": string; "intensity": Intensity; "planned_seconds": number; "active_seconds": number; "outcome": string; "reported_difficulty"?: number; "reported_readiness"?: number; "reflection_summary"?: string; "intensity_1_10": number };

export type PlanRequest = { "schema_version": "1"; "session_id": string; "revision": number; "fear_description": string; "current_ability": string; "preferences": Array<string>; "relevant_history": Array<HistoryRow>; "history_choice": "accepted" | "declined" | "not_available" | "chain_reuse"; "parent_session_id"?: string; "builder_additions": Array<string>; "use_history": boolean; "chained_rerun": boolean };

export type Character = { "asset_id"?: string; "color_hex"?: string; "id": string; "name": string; "role": string; "appearance_brief": string; "goal": string; "behavior_boundaries": Array<string>; "voice_id": string; "scene_node_id": string };

export type ToolCall = ({ "tool": "compose_scene"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "setting_brief": string; "intensity_1_10": number; "props": Array<string>; "interaction_mode": "solo" | "dialogue" | "navigation" | "mixed" } }) | ({ "tool": "plan_audio"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "audio_brief": string; "intensity_1_10": number; "duration_sec": number; "transition_whoosh_required": true } }) | ({ "tool": "generate_feedback"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "observation_source": "current_session_observations"; "tone": "coaching_nonclinical"; "max_did_well": 3; "max_noticed": 3 } }) | ({ "tool": "adapt_session"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "observation_source": "completed_session_observations"; "history_source": "authorized_chain_history" } }) | ({ "tool": "character_turn"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "character_id": string; "context_source": "current_turn_and_recent_history" } }) | ({ "tool": "revise_scene"; "execute_when": "setup" | "after_session" | "dialogue_turn" | "builder_revision"; "arguments": { "additional_input": string; "base_revision": number } });

export type NarratorBeat = { "at_active_second": number; "text": string };

export type SessionPlan = { "schema_version": "1"; "session_id": string; "revision": number; "topic": string; "task_instruction": string; "setting_brief": string; "props": Array<string>; "intensity": Intensity; "intro_target_seconds": 8; "narrator_beats": Array<NarratorBeat>; "characters": Array<Character>; "interaction_mode": "solo" | "dialogue" | "navigation" | "mixed"; "tool_calls": Array<ToolCall>; "adaptation_rationale"?: string; "intensity_1_10": number; "topic_short": string; "duration_sec": number; "narrator_intro_8s": string; "stop_reminder": "To stop at any time, just say STOP!"; "audio_brief": string; "safety": SafetyDecision; "experience"?: ExperiencePlan };

export type Asset = { "id": string; "kind": "mesh" | "texture" | "audio"; "description": string; "origin": "bundled" | "generated"; "bounds_meters"?: Array<number> };

export type SceneRequest = { "plan": SessionPlan; "capabilities_version": string; "asset_manifest": Array<Asset>; "previous_scene"?: SceneSpec; "revision_instruction"?: string };

export type Geometry = ({ "kind": "box"; "size": Array<number> }) | ({ "kind": "plane"; "width": number; "height": number }) | ({ "kind": "sphere"; "radius": number }) | ({ "kind": "cylinder"; "radius": number; "height": number }) | ({ "kind": "asset"; "asset_id": string });

export type Material = { "color": string; "roughness": number; "texture_asset_id"?: string; "opacity"?: number; "double_sided"?: boolean };

export type SceneNode = { collision_role?: "solid" | "none"; support_node_id?: string | null; "id": string; "parent_id": string | null; "role": "environment" | "prop" | "character" | "task_focus"; "geometry": Geometry; "position": Array<number>; "rotation_radians": Array<number>; "scale": Array<number>; "material": Material; "animation": "none" | "idle" | "listen" | "speak" | "gesture" | "walk" | "run" | "swim" | "sit"; "description": string; "prop_name"?: string };

export type WorldOperation = ({ "type": "set_visible"; "node_id": string; "visible": boolean }) | ({ "type": "set_material"; "node_id": string; "material": Material }) | ({ "type": "character_action"; "character_id": string; "behavior": "idle" | "listen" | "speak" | "gesture" | "walk" | "run" | "swim" | "sit" }) | ({ "type": "viewpoint_transition"; "destination_id": string; "transition": "fade" }) | ({ "type": "narrate"; "text": string }) | ({ "type": "play_sound"; "cue_id": string }) | ({ "type": "move_viewer"; "path_id": string }) | ({ "type": "move_node"; "node_id": string; "path_id": string; "face_motion": boolean }) | ({ "type": "set_environment"; "background_color": string; "fog_density": number; "ambient_intensity"?: number });

export type Choice = { "id": string; "label": string; "intent_examples": Array<string>; "operations": Array<WorldOperation> };

export type Interaction = { "id": string; "prompt": string; "trigger": "user_request" | "scene_start" | "scheduled" | "choice_completed"; "at_active_second"?: number; "choices": Array<Choice> };

export type SceneSpec = { "schema_version": "1"; "session_id": string; "revision": number; "description": string; "nodes": Array<SceneNode>; "viewpoints": Array<{ "id": string; "position": Array<number>; "description": string }>; "initial_viewpoint_id": string; "lighting": { "ambient_color": string; "ambient_intensity": number; "key_direction": Array<number>; "key_intensity": number }; "atmosphere": { "background_color": string; "fog_density": number }; "interactions": Array<Interaction>; "events": Array<{ "at_active_second": number; "operation": WorldOperation }>; "stereo": StereoSpec; "reveal": RevealSpec; "scenario"?: ScenarioSpec; "motion_paths"?: Array<MotionPath>; "view_distance_meters"?: number; "viewer_attached_node_ids"?: Array<string> };

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

export type SessionRecord = { checkpoint?: Record<string,unknown> | null; render_metrics?: Record<string,unknown> | null; applied_operations?: WorldOperation[]; turns?: Array<Record<string,unknown>>; scene?: SceneSpec; audio?: AudioPlan; observations?: Array<Observation>; adaptation?: AdaptationResult | null; reflection_file?: string; reflection?: Record<string, unknown>; "schema_version": "1"; "session_id": string; "parent_session_id"?: string; "started_at": string; "ended_at": string; "plan": SessionPlan; "scene_revision": number; "active_seconds": number; "stop_count": number; "outcome": "completed" | "user_ended" | "interrupted" | "failed"; "reported_difficulty": number | null; "reported_readiness": number | null; "reflection_id"?: string; "feedback"?: FeedbackResult; "generation_provenance": { "mode": "live" | "replay"; "model_ids": Array<string>; "request_ids": Array<string> }; "use_history": boolean; "chained_rerun": boolean; "intensity_1_10": number; "topic_short": string; "early_end": boolean };

export type ValidationIssue = { "path": string; "rule": string; "message": string };

export type Error = { "code": "INVALID_INPUT" | "UNAUTHORIZED" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "TIMEOUT" | "INVALID_MODEL_OUTPUT" | "CANCELLED" | "CONFLICT"; "message": string; "retryable": boolean; "request_id": string; "issues"?: Array<ValidationIssue>; "retry_after_ms"?: number };

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

export type MotionPath = { "id": string; "purpose": "walk" | "run" | "swim" | "climb" | "fall" | "glide" | "ride" | "other"; "interpolation": "linear" | "smooth"; "coordinate_space"?: "world" | "relative"; "points": Array<{ "at_seconds": number; "position": Array<number> }> };

export type ScenarioAction = { "id": string; "label": string; "phrases": Array<string>; "operations": Array<WorldOperation>; "next_step_id": string | null };

export type ScenarioCompletion = { "trigger": "after_seconds" | "motion_complete"; "after_seconds"?: number; "motion_path_id"?: string; "next_step_id": string };

export type ScenarioStep = { conversation_target?: string; announce_on_entry?: boolean; review_viewpoint_id?: string; focus_node_ids?: string[]; "id": string; "prompt": string; "terminal": boolean; "start_operations": Array<WorldOperation>; "actions": Array<ScenarioAction>; "completion"?: ScenarioCompletion };

export type ScenarioSpec = { "progression"?: "guided"; "objective": string; "initial_step_id": string; "dialogue_policy": "disabled" | "on_request" | "natural"; "steps": Array<ScenarioStep> };
