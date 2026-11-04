// Offline replay only. Run from backend: node --import tsx ../scripts/replay-scenes.ts <candidate.json> ...
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {basename,dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalSceneReferences} from '../backend/src/scene-references.js';
import {deterministicCorrections,compileScene} from '../backend/src/construction.js';
import {materializeStageGraph} from '../backend/src/stage-compiler.js';
import {AppError,validate,validateProviderOutput,sceneIssues} from '../backend/src/contracts.js';
import {experienceSceneIssues,authoredScene} from '../backend/src/generation-chain.js';
import type {ApprovedExperience} from '../backend/src/generation-chain.js';

process.env.BRAIVE_ALLOW_META='false';
process.env.BRAIVE_AUTO_SCENE_REPAIR='false';
process.env.BRAIVE_VISUAL_STRICTNESS='permissive';
const arguments_=process.argv.slice(2);
const expectRejected=arguments_.includes('--expect-rejected');
const files=arguments_.filter(argument=>argument!=='--expect-rejected');
if(!files.length){console.error('Provide retained candidate JSON files. Use --expect-rejected for blocked-route negative controls.');process.exitCode=1;}

/** Successful wire results omit the internal edited draft. Reuse only an exact
 * matching retained approved plan, never reconstruct an editor decision. */
function retainedExperience(file:string,plan:ApprovedExperience['plan']) {
 const directory=join(dirname(file),'..','rejected');
 if(!existsSync(directory))return undefined;
 for(const name of readdirSync(directory).filter(name=>name.endsWith('.json')).sort()){
  const paired=JSON.parse(readFileSync(join(directory,name),'utf8'));
  if(paired.experience&&paired.plan?.session_id===plan.session_id&&paired.plan?.revision===plan.revision&&JSON.stringify(paired.plan)===JSON.stringify(plan))return paired.experience;
 }
 return undefined;
}

for(const input of files){
 const file=resolve(input),bytes=readFileSync(file);
 const summary:Record<string,unknown>={file:basename(file),input_sha256:createHash('sha256').update(bytes).digest('hex'),verification:'backend_only',provider_calls:0};
 try {
  const data=JSON.parse(bytes.toString('utf8'));
  const candidate:ApprovedExperience=data.result??data;
  if(!candidate.plan||!candidate.scene||!candidate.audio)throw new Error('Retained file has no complete plan/scene/audio candidate');
  const experience=candidate.experience??retainedExperience(file,candidate.plan);
  if(!experience)throw new Error('Retained approved experience is missing; a completed wire scene cannot substitute for it');
  const corrected=deterministicCorrections(canonicalSceneReferences(candidate.plan,authoredScene(candidate.scene) as typeof candidate.scene,candidate.audio));
  const staged=materializeStageGraph(experience,candidate.plan,corrected.scene);
  if(staged.issues.length)throw new AppError('INVALID_MODEL_OUTPUT','Stage graph requires route geometry',staged.issues);
  validate('SceneSpec',staged.scene);validateProviderOutput('SceneSpec',staged.scene);
  const compiled=compileScene(candidate.plan,staged.scene,candidate.audio);
  const issues=[...sceneIssues(candidate.plan,compiled,candidate.audio),...experienceSceneIssues(experience,candidate.plan,compiled)];
  if(issues.length)throw new AppError('INVALID_MODEL_OUTPUT','Approved experience does not match the scene',issues);
  Object.assign(summary,{validation_outcome:'accepted',corrections:corrected.corrections.length,warnings:compiled.construction_report?.warnings.length??0,nodes:compiled.nodes.length});
  if(expectRejected)process.exitCode=1;
 } catch(error){
  Object.assign(summary,{validation_outcome:'rejected',code:error instanceof AppError?error.code:'REPLAY_INPUT',issues:error instanceof AppError?error.issues.map(issue=>({rule:issue.rule,path:issue.path})):[],reason:error instanceof AppError?error.message:(error as Error).message});
  // A missing/malformed fixture cannot count as a successful negative control.
  if(!expectRejected||!(error instanceof AppError))process.exitCode=1;
 }
 const unchanged=createHash('sha256').update(readFileSync(file)).digest('hex')===summary.input_sha256;
 summary.input_unchanged=unchanged;if(!unchanged)process.exitCode=1;
 console.log(JSON.stringify(summary));
}
