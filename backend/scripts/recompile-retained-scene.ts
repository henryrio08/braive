import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {deterministicCorrections,compileScene} from '../src/construction.js';
import {canonicalSceneReferences} from '../src/scene-references.js';
import {materializeStageGraph} from '../src/stage-compiler.js';
import {validate,sceneIssues} from '../src/contracts.js';
import {experienceSceneIssues} from '../src/generation-chain.js';
import {WorldStore} from '../src/world-commits.js';
import {dataDirectory} from '../src/paths.js';

// Replay a retained REAL generation through corrected trusted code. No model
// calls, scene-specific coordinates, fabricated output or manual node edits.
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Supply retained candidate and output paths');
const retained=JSON.parse(readFileSync(input,'utf8')),{plan,audio,experience}=retained;
try{
 const corrected=deterministicCorrections(canonicalSceneReferences(plan,retained.scene,audio));
 const staged=materializeStageGraph(experience,plan,corrected.scene);
 if(staged.issues.length)throw Object.assign(Error('Executable stage graph invalid'),{issues:staged.issues});
 const scene=compileScene(plan,staged.scene,audio);
 validate('SessionPlan',plan);validate('SceneSpec',scene);validate('AudioPlan',audio);
 const issues=[...sceneIssues(plan,scene,audio),...experienceSceneIssues(experience,plan,scene)];
 if(issues.length)throw Object.assign(Error('Recompiled candidate invalid'),{issues});
 const world={plan,scene,audio,experience,world_id:plan.session_id};
 new WorldStore(join(dataDirectory,'worlds')).save(world);
 writeFileSync(output,JSON.stringify({origin:'retained live provider generation recompiled after general compiler fixes',world,corrections:[...corrected.corrections,...staged.corrections]},null,2));
 console.log('Validated and saved retained world:',scene.nodes.length,'nodes,',plan.characters.length,'people.');
}catch(error){console.error((error as Error).message);console.error(JSON.stringify((error as any).issues??[],null,2));process.exitCode=1;}
