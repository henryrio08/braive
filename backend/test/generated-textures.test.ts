import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {normalizeGeneratedTexture,referencedTextures,textureBudgetIssues,type GeneratedTextureEntry} from '../src/assets.js';

test('image registration decodes, normalizes and content-addresses real pixels',async()=>{
 const input=await sharp({create:{width:1600,height:1200,channels:3,background:'#83966c'}}).png().toBuffer();
 const surface=await normalizeGeneratedTexture(input,'surface');
 assert.equal(surface.entry.width,1024);assert.equal(surface.entry.height,768);
 assert.equal(surface.entry.id,'texture.generated.'+surface.entry.sha256);
 const replay=await normalizeGeneratedTexture(input,'surface');
 assert.equal(replay.entry.id,surface.entry.id);assert.deepEqual(replay.data,surface.data);
 const distant=await normalizeGeneratedTexture(input,'distant');
 assert.equal(distant.entry.width,1365);assert.equal(distant.entry.height,1024);
});

test('header-only images, corrupt PNGs and oversized inputs never become registered textures',async()=>{
 const wood=readFileSync(new URL('../../ios/Braive/Resources/Textures/wood.png',import.meta.url));
 await assert.rejects(normalizeGeneratedTexture(wood.subarray(0,30)));
 await assert.rejects(normalizeGeneratedTexture(Buffer.alloc(12*1024*1024+1)),/12 MB/);
 await assert.rejects(normalizeGeneratedTexture(Buffer.from([0xff,0xd8,0xff,0xc0,0,17,8,1,0,2,0,3,1,34,0,2,17,1,3,17,1,255,217])));
});

test('per-scene texture accounting deduplicates references and includes operation materials',()=>{
 const entries:GeneratedTextureEntry[]=Array.from({length:17},(_,n)=>({id:'texture.generated.'+n,file:'unused.png',format:'png',bytes:800_000,sha256:'unused',width:1024,height:1024}));
 const one={nodes:[{material:{texture_asset_id:entries[0].id}},{material:{texture_asset_id:entries[0].id}}]};
 assert.equal(referencedTextures(one).size,1);assert.deepEqual(textureBudgetIssues(one,entries),[]);
 const scene={nodes:entries.slice(0,16).map(e=>({material:{texture_asset_id:e.id}})),events:[{operation:{material:{texture_asset_id:entries[16].id}}}]};
 assert.equal(referencedTextures(scene).size,17);
 assert.equal(textureBudgetIssues(scene,entries).length,2);
});
