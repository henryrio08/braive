import { readFileSync } from 'node:fs';
export interface AssetEntry {
 id:string;relative_path:string;category:string;subcategory:string;tags:string[];suggested_scale_m:number;y_up:boolean;character_rigged:boolean;license:string;license_url:string;approx_tris:number;material_tint_names?:string[];animation_clips?:string[];resolved_node_count?:number;generation_enabled?:boolean;
}
export const assetManifest:AssetEntry[]=JSON.parse(readFileSync(new URL('../assets/asset_manifest.json',import.meta.url),'utf8'));
if(new Set(assetManifest.map(a=>a.id)).size!==assetManifest.length || assetManifest.some(a=>a.license!=='CC0-1.0'))throw Error('Invalid shared CC0 manifest');
export const assetIDs=new Set(assetManifest.map(a=>a.id));
export const characterIDs=new Set(assetManifest.filter(a=>a.category==='character' && a.subcategory==='base' && a.character_rigged).map(a=>a.id));
export const generationCharacterIDs=new Set(assetManifest.filter(a=>characterIDs.has(a.id)&&a.generation_enabled!==false).map(a=>a.id));
export const meshAssets=assetManifest.map(a=>({id:a.id,kind:'mesh',origin:'bundled',description:`${a.tags.join(', ')}; scale normalized to meters, base y=0, forward -Z; ${a.approx_tris} triangles${characterIDs.has(a.id)?'; registered rigged character; skin and source materials retained; color tints registered clothing or the original solid mannequin':''}`}));
// All licensed IDs remain available. Describe shared normalization once in capabilities,
// rather than repeating prose for every item and sending the entire catalog twice.
export const meshCatalog:Record<string,Array<[string,number]>>={};
for(const a of assetManifest)(meshCatalog[`${a.category}.${a.subcategory}`]??=[]).push([a.id,a.approx_tris]);
