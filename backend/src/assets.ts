import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export interface AssetEntry {
 id:string;relative_path:string;category:string;subcategory:string;tags:string[];suggested_scale_m:number;y_up:boolean;character_rigged:boolean;license:string;license_url:string;approx_tris:number;material_tint_names?:string[];animation_clips?:string[];resolved_node_count?:number;generation_enabled?:boolean;bounds_meters?:{min:[number,number,number];max:[number,number,number];basis:string};
}
export const assetManifest:AssetEntry[]=JSON.parse(readFileSync(new URL('../assets/asset_manifest.json',import.meta.url),'utf8'));
if(new Set(assetManifest.map(a=>a.id)).size!==assetManifest.length || assetManifest.some(a=>a.license!=='CC0-1.0'))throw Error('Invalid shared CC0 manifest');
export const assetIDs=new Set(assetManifest.map(a=>a.id));
export interface TextureEntry {
 id:string;relative_path:string;kind:string;format:string;width:number;height:number;license:string;description:string;
}
export const textureManifest:TextureEntry[]=JSON.parse(readFileSync(new URL('../assets/texture_manifest.json',import.meta.url),'utf8'));
if(new Set(textureManifest.map(t=>t.id)).size!==textureManifest.length || textureManifest.some(t=>t.kind!=='texture' || t.relative_path.includes('..') || !['png','jpg','jpeg'].includes(t.format.toLowerCase())))throw Error('Invalid texture manifest');
export const textureIDs=new Set(textureManifest.map(t=>t.id));
export interface GeneratedTextureEntry { id:string; file:string; format:string; bytes:number; sha256:string; width:number; height:number }
export const generatedAssetsDir=fileURLToPath(new URL('../data/generated-assets/',import.meta.url));
export const generatedIndexPath=fileURLToPath(new URL('../data/generated-assets/index.json',import.meta.url));
export function generatedTextures():GeneratedTextureEntry[] {
 try {
  if(!existsSync(generatedIndexPath))return [];
  const parsed=JSON.parse(readFileSync(generatedIndexPath,'utf8'));
  if(!Array.isArray(parsed))return [];
  return parsed.filter((e:any)=>e&&typeof e.id==='string'&&typeof e.file==='string'&&typeof e.sha256==='string') as GeneratedTextureEntry[];
 } catch { return []; }
}
function writeGeneratedRegistry(entries:GeneratedTextureEntry[]):void {
 mkdirSync(generatedAssetsDir,{recursive:true});
 writeFileSync(generatedIndexPath,JSON.stringify(entries,null,2),{mode:0o600});
}
export function registerGeneratedTexture(entry:GeneratedTextureEntry):GeneratedTextureEntry {
 const entries=generatedTextures();
 const existing=entries.find(e=>e.sha256===entry.sha256||e.id===entry.id);
 if(existing)return existing;
 entries.push(entry); writeGeneratedRegistry(entries); return entry;
}
export function removeGeneratedTexture(id:string):GeneratedTextureEntry|undefined {
 const entries=generatedTextures(); const removed=entries.find(e=>e.id===id);
 if(!removed)return undefined;
 writeGeneratedRegistry(entries.filter(e=>e.id!==id)); return removed;
}
export function allTextureIDs():Set<string> {
 return new Set([...textureIDs,...generatedTextures().map(e=>e.id)]);
}
export function parseImageInfo(buffer:Buffer|Uint8Array):{format:'png'|'jpeg';width:number;height:number} {
 const b=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer);
 if(b.length>=8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47) {
  if(b.length<24)throw new Error('Truncated PNG image');
  const width=b.readUInt32BE(16), height=b.readUInt32BE(20);
  if(!width||!height)throw new Error('Invalid PNG dimensions');
  return {format:'png',width,height};
 }
 if(b.length>=2&&b[0]===0xff&&b[1]===0xd8) {
  let offset=2;
  while(offset+4<=b.length) {
   if(b[offset]!==0xff){offset++;continue;}
   const marker=b[offset+1];
   if(marker===0xc0||marker===0xc2) {
    if(offset+9>b.length)break;
    const height=b.readUInt16BE(offset+5), width=b.readUInt16BE(offset+7);
    if(!width||!height)throw new Error('Invalid JPEG dimensions');
    return {format:'jpeg',width,height};
   }
   if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7)) { offset+=2; continue; }
   const length=b.readUInt16BE(offset+2);
   if(length<2)break;
   offset+=2+length;
  }
  throw new Error('JPEG dimensions not found');
 }
 throw new Error('Unsupported image format: expected PNG or JPEG');
}
export const characterIDs=new Set(assetManifest.filter(a=>a.category==='character' && a.subcategory==='base' && a.character_rigged).map(a=>a.id));
export const generationCharacterIDs=new Set(assetManifest.filter(a=>characterIDs.has(a.id)&&a.generation_enabled!==false).map(a=>a.id));
export const meshAssets=assetManifest.map(a=>({id:a.id,kind:'mesh',origin:'bundled',description:`${a.tags.join(', ')}; scale normalized to meters, base y=0, forward -Z; ${a.approx_tris} triangles${characterIDs.has(a.id)?'; registered rigged character; skin and source materials retained; color tints registered clothing or the original solid mannequin':''}`}));
// All licensed IDs remain available. Describe shared normalization once in capabilities,
// rather than repeating prose for every item and sending the entire catalog twice.
export const meshCatalog:Record<string,Array<[string,number]>>={};
for(const a of assetManifest)(meshCatalog[`${a.category}.${a.subcategory}`]??=[]).push([a.id,a.approx_tris]);
