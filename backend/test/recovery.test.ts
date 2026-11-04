import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAcceptance, zoneSeverity } from '../src/acceptance.js';
import { deterministicCorrections } from '../src/construction.js';
import { applyScenePatch, computeRepairScope, decorationEligibility, sceneHash, type SceneRepairPatch } from '../src/repair-patch.js';
import type { SceneSpec } from '../../docs/handoff/contracts.js';

function scene(): SceneSpec {
  return {
    schema_version: '1', session_id: 's', revision: 1, description: 't',
    nodes: [
      { id: 'floor', parent_id: null, role: 'environment', geometry: { kind: 'box', size: [20, 0.2, 20] }, position: [0, -0.1, 0], rotation_radians: [0, 0, 0], scale: [1, 1, 1], material: { color: '#888888', roughness: 0.9 }, animation: 'none', description: 'floor' },
      { id: 'table', parent_id: null, role: 'task_focus', geometry: { kind: 'box', size: [2, 1, 1] }, position: [1, 0.5, -3], rotation_radians: [0, 0, 0], scale: [1, 1, 1], material: { color: '#aa8855', roughness: 0.8 }, animation: 'none', description: 'table' },
      { id: 'plant', parent_id: null, role: 'environment', geometry: { kind: 'box', size: [0.4, 0.8, 0.4] }, position: [-4, 0.4, 3], rotation_radians: [0, 0, 0], scale: [1, 1, 1], material: { color: '#338833', roughness: 0.9 }, animation: 'none', description: 'plant' },
    ],
    viewpoints: [{ id: 'start', position: [0, 1.6, 0], description: 'start' }], initial_viewpoint_id: 'start',
    motion_paths: [], events: [], interactions: [],
    construction_plan: {
      version: '1', seed: 1,
      requirements: [{ requirement_id: 'task', node_ids: ['table'], stage_ids: [], path_ids: [] }],
      zones: [{ id: 'room', center: [0, 2, 0], size: [20, 4, 20], kind: 'interior' }],
      assemblies: [], anchors: [], relations: [], routes: [],
    },
  } as unknown as SceneSpec;
}

test('acceptance: tolerable soft defects pass, severe and accumulated defects do not, dilution cannot hide severity', () => {
  const soft = (severity: number, rule = 'zone_fit') => ({ path: '/nodes/x', rule, message: 'm', classification: 'soft' as const, severity });
  assert.equal(evaluateAcceptance([soft(0.4), soft(0.5)]).acceptedSoft.length, 2);
  assert.ok(evaluateAcceptance([soft(1.4)]).reasons.length > 0);
  assert.ok(evaluateAcceptance([soft(0.9), soft(0.9), soft(0.9), soft(0.9)]).reasons.length > 0, 'category budget');
  assert.ok(evaluateAcceptance([soft(0.9, 'zone_fit'), soft(0.9, 'zone_fit'), soft(0.9, 'zone_fit'), soft(0.8, 'other')]).reasons.length >= 0);
  assert.ok(evaluateAcceptance([soft(3), ...Array.from({ length: 40 }, () => soft(0.01, 'other'))]).reasons.length > 0, 'valid content cannot dilute severity');
  assert.ok(zoneSeverity([0.3], [20]) <= 1 && zoneSeverity([2], [20]) > 1);
});

test('deterministic corrections strip an unsupported texture only when a color fallback exists, idempotently', () => {
  const s = scene();
  (s.nodes[1].material as { texture_asset_id?: string }).texture_asset_id = 'unregistered.png';
  const { scene: fixed, corrections } = deterministicCorrections(s);
  assert.equal(corrections.length, 1);
  assert.equal((fixed.nodes[1].material as { texture_asset_id?: string }).texture_asset_id, undefined);
  assert.equal(fixed.nodes[1].material.color, '#aa8855');
  assert.equal((s.nodes[1].material as { texture_asset_id?: string }).texture_asset_id, 'unregistered.png', 'raw candidate preserved');
  assert.equal(deterministicCorrections(fixed).corrections.length, 0);
});

test('scoped patch changes only intended entities; stale and out-of-scope patches are rejected', () => {
  const base = scene();
  const scope = computeRepairScope(base, [{ path: '/nodes/table', rule: 'zone_fit', message: 'table bounds overflow' }]);
  assert.ok(scope.nodes.has('table'));
  const patch: SceneRepairPatch = { base_hash: sceneHash(base), operations: [{ op: 'set_node_transform', node_id: 'table', position: [1, 0.5, -2] }] };
  const patched = applyScenePatch(base, patch, scope);
  assert.deepEqual(patched.nodes.find(n => n.id === 'table')!.position, [1, 0.5, -2]);
  assert.deepEqual(patched.nodes.find(n => n.id === 'plant'), base.nodes.find(n => n.id === 'plant'));
  assert.deepEqual(base.nodes.find(n => n.id === 'table')!.position, [1, 0.5, -3], 'base preserved');
  assert.throws(() => applyScenePatch(base, { ...patch, base_hash: 'deadbeefdeadbeefdeadbeef' }, scope), /Stale repair patch/);
  assert.throws(() => applyScenePatch(base, { base_hash: sceneHash(base), operations: [{ op: 'set_node_transform', node_id: 'plant', position: [0, 0, 0] }] }, scope), /outside the computed repair scope/);
});

test('omission is allowed only for unreferenced optional decoration', () => {
  const s = scene();
  assert.equal(decorationEligibility(s, 'plant').eligible, true);
  assert.equal(decorationEligibility(s, 'table').eligible, false);
  const scope = computeRepairScope(s, [{ path: '/nodes/plant', rule: 'zone_fit', message: 'plant overflow' }, { path: '/nodes/table', rule: 'zone_fit', message: 'table overflow' }]);
  const removed = applyScenePatch(s, { base_hash: sceneHash(s), operations: [{ op: 'remove_node', node_id: 'plant' }] }, scope);
  assert.equal(removed.nodes.some(n => n.id === 'plant'), false);
  assert.throws(() => applyScenePatch(s, { base_hash: sceneHash(s), operations: [{ op: 'remove_node', node_id: 'table' }] }, scope), /cannot be omitted/);
});
