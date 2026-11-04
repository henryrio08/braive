import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorInstructions,builderInstructions,editorInstructions} from '../src/generation-prompts.js';

test('composed builder instructions agree on compiler-owned stages and review defaults',()=>{
 assert.match(builderInstructions,/backend COMPILES the executable stage graph/);
 assert.match(builderInstructions,/Omit move_viewer operations, completions, conversation_target values and the stage_completed step/);
 assert.match(builderInstructions,/Review viewpoint, focus and announce_on_entry fields may also be omitted/);
 // These legacy directives used to be appended after the compiler contract.
 // Check the full provider prompt so the source document cannot reintroduce them.
 for(const obsolete of [
  /scenario\.steps exactly match approved stage IDs\/order/,
  /Start any motion needed for that stage in start_operations/,
  /set conversation_target to the approved Character\.id/,
  /Each stage supplies review_viewpoint_id, focus_node_ids and announce_on_entry/,
  /Declare exactly one plan_audio and compose_scene call/,
  /One repair is shared with native preflight/,
  /native preflight has a separate single repair/,
 ])assert.doesNotMatch(builderInstructions,obsolete);
 assert.match(builderInstructions,/no automatic model repair or rebuild by default/);
 assert.match(builderInstructions,/roughly 0\.5-0\.7m/);
 assert.match(builderInstructions,/1\.6m standing default/);
});

test('author and independent editor retain semantic planning roles',()=>{
 assert.match(authorInstructions,/EXPERIENCE AUTHOR/);
 assert.match(authorInstructions,/original request/);
 assert.match(editorInstructions,/INDEPENDENT EXPERIENCE EDITOR/);
 assert.match(editorInstructions,/original user request/);
 assert.match(editorInstructions,/complete final ExperienceDraft/);
 for(const instructions of [authorInstructions,editorInstructions]){
  assert.doesNotMatch(instructions,/## Coherent rendering/);
  assert.doesNotMatch(instructions,/review_viewpoint_id/);
  assert.match(instructions,/does not steer, branch, unlock or advance the authored world/);
 }
});
