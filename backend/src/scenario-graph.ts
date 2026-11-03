import type {SceneSpec, ValidationIssue, WorldOperation} from '../../docs/handoff/contracts.js';

/** Explore stage + motion-owner states. A path on another branch cannot satisfy
 * completion, and replacing a resource's path removes the old completion token. */
export function scenarioGraphIssues(scene: SceneSpec): ValidationIssue[] {
 const scenario=scene.scenario;if(!scenario)return [];
 const issues:ValidationIssue[]=[];
 const fail=(path:string,message:string)=>issues.push({path,rule:'progress',message});
 const steps=scenario.steps,indices=new Map(steps.map((s,i)=>[s.id,i]));
 const pathOwners=new Map<string,string>();
 const apply=(state:Record<string,string>,ops:WorldOperation[])=>{
  const next={...state},written=new Set<string>();
  for(const op of ops){
   const resource=op.type==='move_viewer'||op.type==='viewpoint_transition'?'viewer':op.type==='move_node'?'node:'+op.node_id:undefined;
   if(!resource)continue;
   if('path_id' in op){
    const owner=pathOwners.get(op.path_id);
    if(owner&&owner!==resource)fail('/motion_paths','A completion path must belong to one viewer/actor resource');
    pathOwners.set(op.path_id,resource);
   }
   if(written.has(resource))fail('/scenario','Two operations compete for '+resource+' in one transition');
   written.add(resource);
   if(op.type==='viewpoint_transition')delete next[resource];
   else if('path_id' in op)next[resource]=op.path_id;
  }
  return next;
 };
 for(const [i,s] of steps.entries()){
  const destinations=[...s.actions.map(a=>a.next_step_id),s.completion?.next_step_id].filter((x):x is string=>!!x);
  if(destinations.some(id=>!indices.has(id)||indices.get(id)!<=i))fail(`/scenario/steps/${i}`,'Transitions must go to an existing later stage (branches are allowed; cycles are not)');
  if(s.terminal&&(s.actions.length||s.completion))fail(`/scenario/steps/${i}`,'Terminal stages cannot contain pending decisions or transitions');
  if(!s.terminal&&!destinations.length)fail(`/scenario/steps/${i}`,'Nonterminal stage has no exit');
 }
 if(issues.length)return issues;
 type State={index:number,motion:Record<string,string>};
 const states:State[]=[],keys=new Map<string,number>(),edges:number[][]=[];
 const enter=(index:number,motion:Record<string,string>)=>{
  const next=apply(motion,steps[index].start_operations);
  const key=JSON.stringify([index,Object.entries(next).sort()]);
  if(keys.has(key))return keys.get(key)!;
  const id=states.length;keys.set(key,id);states.push({index,motion:next});edges.push([]);return id;
 };
 enter(0,{});
 for(let id=0;id<states.length;id++){
  if(states.length>2048){fail('/scenario','Motion/branch state space exceeds 2048 states; simplify the control graph');return issues;}
  const {index,motion}=states[id],step=steps[index];
  for(const action of step.actions){
   const next=apply(motion,action.operations);
   const destination=action.next_step_id?indices.get(action.next_step_id)!:index;
   // A local action must not replay stage-entry operations.
   if(destination===index){
    const key=JSON.stringify([index,Object.entries(next).sort()]);
    let target=keys.get(key);
    if(target===undefined){target=states.length;keys.set(key,target);states.push({index,motion:next});edges.push([]);}
    edges[id].push(target);
   }else edges[id].push(enter(destination,next));
  }
  const completion=step.completion;
  if(completion&&(completion.trigger==='after_seconds'||Object.values(motion).includes(completion.motion_path_id??'')))
   edges[id].push(enter(indices.get(completion.next_step_id)!,motion));
 }
 const canFinish=new Set(states.flatMap((s,i)=>steps[s.index].terminal?[i]:[]));
 let changed=true;while(changed){changed=false;for(let i=0;i<states.length;i++)if(!canFinish.has(i)&&edges[i].some(j=>canFinish.has(j))){canFinish.add(i);changed=true;}}
 for(const i of new Set(states.filter((_,id)=>!canFinish.has(id)).map(s=>s.index)))fail(`/scenario/steps/${i}`,'A reachable motion/branch state has no executable path to a terminal stage');
 const reached=new Set(states.map(s=>s.index));
 for(let i=0;i<steps.length;i++)if(!reached.has(i))fail(`/scenario/steps/${i}`,'Stage is unreachable from the initial stage');
 // Global movement makes branch-dependent completion ambiguous. Put it in a
 // stage start/action so ownership and the initiating run can be validated.
 if(scene.events.some(e=>['move_viewer','move_node','viewpoint_transition'].includes(e.operation.type)))fail('/events','Schedule movement through stage entry/actions, not global events');
 return issues;
}
