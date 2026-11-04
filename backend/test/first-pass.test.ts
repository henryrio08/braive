import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materializeStageGraph} from '../src/stage-compiler.js';
import {deterministicCorrections} from '../src/construction.js';
import type {ExperienceDraft} from '../src/experience.js';
import type {SceneSpec, SessionPlan} from '../../docs/handoff/contracts.js';

function draft(stages: Array<{movement: string; conversation: number | null; duration: number}>): ExperienceDraft {
  return {experience: {kind: 'action', objective: 'Practice', requires_motion: stages.some(s => s.movement !== 'none'),
    stages: stages.map(s => ({goal: 'g', duration_sec: s.duration, sensory_brief: 'b', movement: s.movement, conversation_character_index: s.conversation}))}} as unknown as ExperienceDraft;
}
const plan = {task_instruction: 'Practice', characters: [{id: 'character_1'}]} as unknown as SessionPlan;
function scene(overrides: Partial<SceneSpec> = {}): SceneSpec {
  return {nodes: [], events: [], interactions: [], motion_paths: [{id: 'path_a', purpose: 'swim', interpolation: 'linear', coordinate_space: 'world', start_position: [0, 0.9, 8], points: [{at_seconds: 30, position: [0, 0.9, -4]}]}],
    scenario: {objective: 'x', initial_step_id: 'stage_1', steps: [{id: 'stage_1', prompt: '', terminal: false, start_operations: [{type: 'set_environment', background_color: '#bfe8f5', fog_density: 0.002}], actions: []}]},
    construction_plan: {routes: [{path_id: 'path_a', stage_ids: ['stage_2'], requirement_ids: [], clearance_radius_meters: 0.25, eye_height_meters: 0.9}]},
    ...overrides} as unknown as SceneSpec;
}

test('stage compiler: travel, stationary, conversation and completion stages are executable from the approved plan', () => {
  const {scene: out, issues} = materializeStageGraph(draft([
    {movement: 'none', conversation: null, duration: 20},
    {movement: 'swim', conversation: null, duration: 65},
    {movement: 'none', conversation: 0, duration: 25},
  ]), plan, scene());
  assert.deepEqual(issues, []);
  const steps = out.scenario!.steps;
  assert.deepEqual(steps.map(s => s.id), ['stage_1', 'stage_2', 'stage_3', 'stage_completed']);
  assert.equal(steps[0].completion?.trigger, 'after_seconds'); assert.equal(steps[0].completion?.after_seconds, 20);
  assert.ok(!steps[0].start_operations.some(o => o.type === 'move_viewer'), 'stationary stage stays stationary');
  assert.ok(steps[1].start_operations.some(o => o.type === 'move_viewer' && o.path_id === 'path_a'), 'uniquely bound route becomes the travel operation');
  assert.equal(steps[1].completion?.trigger, 'motion_complete'); assert.equal(steps[1].completion?.next_step_id, 'stage_3');
  assert.equal(steps[2].conversation_target, 'character_1');
  assert.equal(steps[2].completion?.trigger, 'after_seconds', 'conversation stage advances on its clock');
  assert.equal(steps[3].terminal, true); assert.equal(steps[3].completion, undefined);
  assert.ok(steps[0].start_operations.some(o => o.type === 'set_environment'), 'authored environmental operations preserved');
});

test('stage compiler: missing or ambiguous route geometry is a stage-scoped issue, never an arbitrary choice', () => {
  const missing = materializeStageGraph(draft([{movement: 'swim', conversation: null, duration: 30}]), plan,
    scene({construction_plan: {routes: []} as unknown as SceneSpec['construction_plan']}));
  assert.equal(missing.issues.length, 1); assert.equal(missing.issues[0].rule, 'route_binding');
  assert.match(missing.issues[0].message, /stage_1/);
  const ambiguous = materializeStageGraph(draft([{movement: 'swim', conversation: null, duration: 30}]), plan,
    scene({construction_plan: {routes: [
      {path_id: 'path_a', stage_ids: ['stage_1'], requirement_ids: [], clearance_radius_meters: 0.25, eye_height_meters: 0.9},
      {path_id: 'path_b', stage_ids: ['stage_1'], requirement_ids: [], clearance_radius_meters: 0.25, eye_height_meters: 0.9},
    ]} as unknown as SceneSpec['construction_plan']}));
  assert.equal(ambiguous.issues.length, 1); assert.match(ambiguous.issues[0].message, /bind exactly one/);
});

test('stage compiler recovers omitted route metadata and reuses the declared opening focus', () => {
  const source=scene();
  source.nodes=[{id:'shore',role:'environment'}] as SceneSpec['nodes'];
  source.scenario!.steps[0].focus_node_ids=['shore'];
  source.motion_paths!.push({id:'arrival',purpose:'swim',interpolation:'linear',coordinate_space:'world',
    start_position:[0,0.9,-4],points:[{at_seconds:20,position:[0,0.9,-7]}]});
  source.construction_plan!.requirements=[{requirement_id:'stage:stage_3',node_ids:[],stage_ids:['stage_3'],path_ids:['arrival']}];
  const approved=draft([
    {movement:'none',conversation:null,duration:10},
    {movement:'swim',conversation:null,duration:30},
    {movement:'swim',conversation:null,duration:20},
  ]);
  const staged=materializeStageGraph(approved,plan,source);
  assert.deepEqual(staged.issues,[]);
  assert.equal(staged.scene.nodes[0].role,'task_focus');
  assert.deepEqual(staged.scene.scenario!.steps[2].start_operations,[{type:'move_viewer',path_id:'arrival'}]);
  assert.equal(staged.scene.construction_plan!.routes[1].eye_height_meters,0.9);
  assert.deepEqual(staged.scene.motion_paths,source.motion_paths);
  assert.equal(source.construction_plan!.routes.length,1);
  assert.equal(source.nodes[0].role,'environment');

  source.construction_plan!.requirements[0].path_ids.push('path_a');
  assert.equal(materializeStageGraph(approved,plan,source).issues[0].rule,'route_binding');
});

test('stage compiler keeps an authored purpose when one path is shared across conflicting uses',()=>{
 const source=scene();
 source.construction_plan!.routes[0].stage_ids=['stage_1','stage_2'];
 const approved=draft([{movement:'walk',conversation:null,duration:30},{movement:'run',conversation:null,duration:30}]);
 assert.equal(materializeStageGraph(approved,plan,source).scene.motion_paths![0].purpose,'swim');

 source.events=[{at_active_second:0,operation:{type:'move_node',path_id:'path_a',node_id:'another_actor'}}] as SceneSpec['events'];
 approved.experience.stages[1].movement='walk';
 assert.equal(materializeStageGraph(approved,plan,source).scene.motion_paths![0].purpose,'swim');
});

test('preparation: time-zero waypoint becomes the route origin, preserving later waypoints and destination', () => {
  const s = scene({motion_paths: [{id: 'path_a', purpose: 'swim', interpolation: 'linear', coordinate_space: 'world',
    points: [{at_seconds: 0, position: [0, 0.9, 8]}, {at_seconds: 32, position: [0, 0.9, -2]}, {at_seconds: 65, position: [0, 0.9, -12.5]}]}] as unknown as SceneSpec['motion_paths']});
  const {scene: fixed, corrections} = deterministicCorrections(s);
  assert.deepEqual(fixed.motion_paths![0].start_position, [0, 0.9, 8]);
  assert.deepEqual(fixed.motion_paths![0].points.map(p => p.at_seconds), [32, 65]);
  assert.deepEqual(fixed.motion_paths![0].points.at(-1)?.position, [0, 0.9, -12.5]);
  assert.ok(corrections.some(c => c.includes('route origin')));
  assert.equal(deterministicCorrections(fixed).corrections.length, 0, 'idempotent');
  assert.equal(s.motion_paths![0].start_position, undefined, 'original candidate preserved');
});

test('preparation: undeclared anchors materialize, containment anchor references drop, unexecutable operations drop', () => {
  const s = scene();
  (s as {nodes: unknown}).nodes = [
    {id: 'island', parent_id: null, role: 'environment', geometry: {kind: 'box', size: [13, 0.8, 11]}, position: [0, -0.4, -21], rotation_radians: [0, 0, 0], scale: [1, 1, 1], material: {color: '#c2b280', roughness: 1}, animation: 'none', description: 'island'},
    {id: 'palm', parent_id: null, role: 'environment', geometry: {kind: 'box', size: [1, 4, 1]}, position: [-3, 0, -22], rotation_radians: [0, 0, 0], scale: [1, 1, 1], material: {color: '#338833', roughness: 1}, animation: 'none', description: 'palm'},
  ];
  s.construction_plan = {version: '1', seed: 1, requirements: [], zones: [{id: 'zone_sea', center: [0, 0, -10], size: [40, 10, 40], kind: 'outdoor'}], assemblies: [], anchors: [],
    relations: [
      {id: 'palm_on', kind: 'on', subject_id: 'palm', target_id: 'island', anchor_id: 'top_island', subject_anchor_id: 'base_palm', offset: [0, 0, 0], clearance: 0, tolerance: 0.05, required: true},
      {id: 'palm_within', kind: 'within', subject_id: 'palm', target_id: 'zone_sea', anchor_id: 'top_island', offset: [0, 0, 0], clearance: 0, tolerance: 0.2, required: false},
    ], routes: [], medium_regions: []} as unknown as SceneSpec['construction_plan'];
  s.scenario!.steps[0].start_operations.push({type: 'set_visible', node_id: 'ghost', visible: true} as never);
  const {scene: fixed, corrections} = deterministicCorrections(s);
  const anchors = fixed.construction_plan!.anchors;
  assert.ok(anchors.some(a => a.id === 'top_island' && a.node_id === 'island'), 'support anchor materialized on the target');
  assert.ok(anchors.some(a => a.id === 'base_palm' && a.node_id === 'palm'), 'subject contact anchor materialized on the subject');
  assert.equal(fixed.construction_plan!.relations[1].anchor_id, undefined, 'containment anchor reference dropped');
  assert.ok(!fixed.scenario!.steps[0].start_operations.some(o => (o as {node_id?: string}).node_id === 'ghost'), 'unexecutable operation dropped');
  assert.ok(corrections.length >= 4);
});

test('preparation: faces-to-viewer, required flags and zero-offset support derive from authoritative data', () => {
  const s = scene();
  (s as {nodes: unknown}).nodes = [
    {id: 'island', parent_id: null, role: 'environment', geometry: {kind: 'box', size: [13, 0.8, 11]}, position: [0, -0.4, -21], rotation_radians: [0, 0, 0], scale: [1, 1, 1], material: {color: '#c2b280', roughness: 1}, animation: 'none', description: 'island'},
    {id: 'palm', parent_id: null, role: 'environment', geometry: {kind: 'box', size: [1, 4, 1]}, position: [-3, 0, -22], rotation_radians: [0, 0, 0], scale: [1, 1, 1], material: {color: '#338833', roughness: 1}, animation: 'none', description: 'palm'},
  ];
  s.construction_plan = {version: '1', seed: 1, requirements: [{requirement_id: 'task', node_ids: ['palm'], stage_ids: [], path_ids: []}],
    zones: [], assemblies: [], anchors: [{id: 'island_top', node_id: 'island', kind: 'support', position: [0, 0.4, 0], footprint: [5, 5]}],
    relations: [
      {id: 'palm_on', kind: 'on', subject_id: 'palm', target_id: 'island', anchor_id: 'island_top', offset: [0, 0, 0], clearance: 0, tolerance: 0.05, required: true},
      {id: 'palm_faces', kind: 'faces', subject_id: 'palm', target_id: 'viewpoint_start', offset: [0, 0, 0], clearance: 0, tolerance: 0.2, required: false},
    ], routes: [], medium_regions: []} as unknown as SceneSpec['construction_plan'];
  const {scene: fixed, corrections} = deterministicCorrections(s);
  const relations = fixed.construction_plan!.relations;
  assert.deepEqual(relations[0].offset, [-3, 0, -1], 'offset derived from authored position, matching the corrected fixture values');
  assert.equal(relations[1].target_id, 'viewer');
  assert.equal(relations[1].required, true, 'required derived from the approved requirement binding');
  assert.ok(corrections.length >= 3);
  assert.deepEqual(s.construction_plan!.relations[0].offset, [0, 0, 0], 'original preserved');
});
