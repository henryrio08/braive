import {assetManifest,type AssetEntry} from './assets.js';
import type {SessionPlan} from '../../docs/handoff/contracts.js';

/** A relevant inventory, not scene presets. Exact requested props outrank the
 * coherent default kit, and the general asset/node construction path stays open. */
export function sceneAssets(plan:SessionPlan):AssetEntry[] {
 let text=[plan.topic,plan.setting_brief,plan.task_instruction,...plan.props,...(plan.experience?.stages.map(s=>s.goal)??[])].join(' ').toLowerCase();
 const expand:Record<string,string>={microphone:'mic',bookshelf:'shelf bookcase',bookshelves:'shelf bookcase',library:'bookcase shelf chair table lamp window',interview:'desk chair laptop lamp',garden:'tree bush plant flower fence table cup bench',trail:'tree rock ground path sign',elevator:'station wall door floor lamp',passage:'station wall floor pipe lamp',presentation:'stage mic chair spotlight',studio:'lamp mic desk chair',office:'desk laptop chair shelf',toast:'cup glass table'};
 for(const [word,terms] of Object.entries(expand))if(text.includes(word))text+=' '+terms;
 const terms=new Set(text.split(/[^a-z]+/).filter(t=>t.length>2));
 const setting=(plan.setting_brief+' '+(plan.construction_brief?.spatial_intent??'')).toLowerCase();
 const outdoor=/garden|trail|forest|outdoor|island|cove|park|water|beach/.test(setting)&&!/library|studio|interior|indoor/.test(setting),technical=/elevator|passage|industrial|factory|space station/.test(setting);
 const quota:Record<string,number>={architecture:outdoor?12:32,furniture:outdoor?10:24,interior_prop:18,nature:outdoor?30:6,confined:technical?18:4,urban:outdoor?14:4,audience:12};
 const score=(a:AssetEntry)=>{
  const words=a.id.split(/[._]/),sub=a.subcategory,style=a.style_family;
  let n=terms.has(sub)?15:0;
  for(const word of words)if(terms.has(word))n+=4;
  for(const tag of a.tags)if(terms.has(tag))n+=2;
  if(technical&&['technical_interior','industrial'].includes(style??''))n+=5;
  if(!technical&&['warm_classic','modern_home','soft_nature','modular_architecture'].includes(style??''))n+=2;
  if(a.id.includes('toy_')&&!/toy|racing|race|car|truck/.test(text))n-=8;
  return n;
 };
 const selected=Object.keys(quota).flatMap(category=>assetManifest.filter(a=>a.category===category&&a.generation_enabled!==false)
  .sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id)).slice(0,quota[category]));
 for(const actor of plan.characters){const asset=assetManifest.find(a=>a.id===actor.asset_id);if(asset&&!selected.includes(asset))selected.push(asset);}
 return selected;
}
export function sceneCapabilities(plan:SessionPlan,capabilities:unknown):unknown {
 const assets=sceneAssets(plan),catalog:Record<string,Array<[string,number]>>={};
 for(const a of assets)(catalog[a.category+'.'+a.subcategory]??=[]).push([a.id,a.approx_tris]);
 return {...(capabilities as object),assets:catalog,asset_bounds:Object.fromEntries(assets.map(a=>[a.id,a.bounds_meters])),
  asset_placement:assets.filter(a=>a.placement_notes||a.semantic_front_yaw_radians!==undefined).map(a=>({id:a.id,face_negative_z_yaw:a.semantic_front_yaw_radians,notes:a.placement_notes,style_family:a.style_family})),
  visual_reference_notes:'Source GLB contact sheets were inspected during development. This request supplies measured bounds and placement notes, not image pixels or native visual approval. Preserve coherent kit palettes; use finished objects. Near task geometry is explicit. Primitive architectural slabs are appropriate; a renamed box cannot replace a missing required object.'};
}
