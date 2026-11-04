import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {join} from 'node:path';
import {dataDirectory} from './paths.js';
import { fileURLToPath } from 'node:url';
export interface AssetEntry {
 id:string;relative_path:string;category:string;subcategory:string;tags:string[];suggested_scale_m:number;y_up:boolean;character_rigged:boolean;license:string;license_url:string;approx_tris:number;material_tint_names?:string[];animation_clips?:string[];resolved_node_count?:number;generation_enabled?:boolean;bounds_meters?:{min:[number,number,number];max:[number,number,number];basis:string};style_family?:string;placement_notes?:string;semantic_front_yaw_radians?:number;preview_sheet?:string;
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
export interface GeneratedTextureEntry { id:string; file:string; format:string; bytes:number; sha256:string; width:number; height:number; purpose?:'surface'|'distant' }
export const generatedAssetsDir=join(dataDirectory,'generated-assets');
export const generatedIndexPath=join(generatedAssetsDir,'index.json');
export function generatedTextures():GeneratedTextureEntry[] {
 try {
  if(!existsSync(generatedIndexPath))return [];
  const parsed=JSON.parse(readFileSync(generatedIndexPath,'utf8'));
  if(!Array.isArray(parsed))return [];
  return parsed.filter((e:any)=>e&&/^texture\.generated\.[a-f0-9]{16,64}$/.test(e.id)&&/^[a-f0-9]{64}$/.test(e.sha256)
   &&['png','jpeg'].includes(e.format)&&e.file===e.id+(e.format==='png'?'.png':'.jpg')
   &&Number.isInteger(e.width)&&e.width>0&&e.width<=2048&&Number.isInteger(e.height)&&e.height>0&&e.height<=1024
   &&Number.isInteger(e.bytes)&&e.bytes>0&&e.bytes<=12*1024*1024) as GeneratedTextureEntry[];
 } catch { return []; }
}
function writeGeneratedRegistry(entries:GeneratedTextureEntry[]):void {
 mkdirSync(generatedAssetsDir,{recursive:true});
 const temporary=generatedIndexPath+'.'+randomUUID()+'.tmp';
 writeFileSync(temporary,JSON.stringify(entries,null,2),{mode:0o600});renameSync(temporary,generatedIndexPath);
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
export function referencedTextures(value:unknown):Set<string> {
 const ids=new Set<string>();
 function visit(current:unknown):void {
  if(Array.isArray(current)){current.forEach(visit);return;}
  if(current&&typeof current==='object')for(const [key,item]of Object.entries(current)){
   if(key==='texture_asset_id'&&typeof item==='string')ids.add(item);else visit(item);
  }
 }
 visit(value);return ids;
}
export function textureBudgetIssues(scene:unknown,entries:GeneratedTextureEntry[]=generatedTextures()):string[] {
 const registry=new Map(entries.map(entry=>[entry.id,entry])),issues:string[]=[];
 let bytes=0,decoded=0;
 for(const id of referencedTextures(scene)){
  if(textureIDs.has(id))continue;
  const entry=registry.get(id);
  if(!entry){issues.push('Unknown generated texture '+id);continue;}
  bytes+=entry.bytes;decoded+=entry.width*entry.height*4;
 }
 if(bytes>12*1024*1024)issues.push('Generated texture downloads exceed 12 MB for this scene');
 if(decoded>64*1024*1024)issues.push('Decoded generated textures exceed 64 MB for this scene');
 return issues;
}
/** Decode complete input, strip metadata, and normalize before registration. */
export async function normalizeGeneratedTexture(input:Buffer,purpose:'surface'|'distant'='surface'):
 Promise<{data:Buffer;entry:GeneratedTextureEntry}>{
 if(!input.length||input.length>12*1024*1024)throw new Error('Generated image must be between 1 byte and 12 MB');
 const info=parseImageInfo(input);
 if(info.width*info.height>16_777_216)throw new Error('Generated image exceeds the decoded input limit');
 const {data,info:output}=await sharp(input,{limitInputPixels:16_777_216,failOn:'warning',animated:false})
  .rotate().resize({width:purpose==='distant'?2048:1024,height:1024,fit:'inside',withoutEnlargement:true})
  .png().toBuffer({resolveWithObject:true});
 if(data.length>12*1024*1024)throw new Error('Normalized image exceeds 12 MB');
 const sha256=createHash('sha256').update(data).digest('hex'),id='texture.generated.'+sha256;
 return {data,entry:{id,file:id+'.png',format:'png',bytes:data.length,sha256,width:output.width,height:output.height,purpose}};
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
for(const a of assetManifest.filter(a=>a.generation_enabled!==false))(meshCatalog[`${a.category}.${a.subcategory}`]??=[]).push([a.id,a.approx_tris]);
