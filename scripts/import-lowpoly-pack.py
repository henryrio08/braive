#!/usr/bin/env python3
"""Validate the CC0 source pack and copy unchanged GLBs into the runtime bundle."""
import argparse, collections, csv, hashlib, json, math, re, shutil, struct
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
GAPS = ['furniture.podium', 'interior_prop.whiteboard', 'confined.elevator_car', 'confined.elevator_panel', 'confined.vent']

def inspect_glb(path):
    data = path.read_bytes()
    if len(data) < 20 or struct.unpack_from('<4sII', data) != (b'glTF', 2, len(data)):
        raise ValueError(f'Invalid GLB header: {path}')
    offset, chunks = 12, []
    while offset < len(data):
        length, kind = struct.unpack_from('<II', data, offset); offset += 8
        if length % 4 or offset + length > len(data): raise ValueError(f'Invalid GLB chunk: {path}')
        chunks.append((kind, data[offset:offset+length])); offset += length
    if offset != len(data) or not chunks or chunks[0][0] != 0x4e4f534a: raise ValueError(f'Invalid JSON chunk: {path}')
    gltf = json.loads(chunks[0][1]); binary = next((d for k,d in chunks if k == 0x004e4942), b'')
    if gltf.get('asset', {}).get('version') != '2.0': raise ValueError(f'Not glTF 2.0: {path}')
    for b in gltf.get('buffers', []):
        if b.get('uri') or b['byteLength'] > len(binary): raise ValueError(f'External or truncated buffer: {path}')
    for image in gltf.get('images', []):
        if 'uri' in image and not image['uri'].startswith('data:'):
            rel=PurePosixPath(image['uri'])
            if rel.is_absolute() or '..' in rel.parts or '\\' in image['uri'] or ':' in image['uri'] or rel.suffix.lower()!='.png': raise ValueError(f'Unsafe texture dependency: {path}')
            texture=path.parent/str(rel)
            if not texture.is_file() or texture.is_symlink() or not texture.resolve().is_relative_to(path.parent.resolve()) or texture.stat().st_size>2_000_000 or not texture.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'): raise ValueError(f'Invalid bundled texture: {path}')
    views = gltf.get('bufferViews', [])
    for v in views:
        if v.get('buffer', 0) != 0 or v.get('byteOffset', 0) + v['byteLength'] > len(binary): raise ValueError(f'Invalid buffer view: {path}')
    sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}; widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
    for a in gltf.get('accessors', []):
        element=sizes[a['componentType']]*widths[a['type']]
        if a.get('count',0)<1: raise ValueError(f'Invalid accessor count: {path}')
        if 'bufferView' in a:
            v=views[a['bufferView']]; end=a.get('byteOffset',0)+(a['count']-1)*v.get('byteStride',element)+element
            if end>v['byteLength']: raise ValueError(f'Accessor exceeds buffer: {path}')
    for node in gltf.get('nodes', []):
        if 'mesh' in node and node['mesh']>=len(gltf.get('meshes', [])): raise ValueError(f'Invalid mesh reference: {path}')
        if 'skin' in node and node['skin']>=len(gltf.get('skins', [])): raise ValueError(f'Invalid skin reference: {path}')
    return gltf, hashlib.sha256(data).hexdigest()

def inventory(source):
    with (source/'LICENSE_INDEX.csv').open(encoding='utf-8-sig', newline='') as f: rows=list(csv.DictReader(f))
    supplements_path=source/'character-provenance.json'
    supplements={a['asset_id']:a for a in json.loads(supplements_path.read_text())} if supplements_path.exists() else {}
    indexed={}; ids=set(); manifest=[]
    for r in rows:
        rel=PurePosixPath(r['file_path'])
        if rel.is_absolute() or '..' in rel.parts or '\\' in str(rel) or len(rel.parts)!=3: raise ValueError('Unsafe asset path: '+str(rel))
        if str(rel) in indexed: raise ValueError('Duplicate CSV path: '+str(rel))
        indexed[str(rel)]=r
        expected=f"{r['category']}.{r['subcategory']}.{r['variant']}"
        if not re.fullmatch(r'[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_]+',expected) or rel.stem!=expected or rel.parts[:2]!=(r['category'],r['subcategory']): raise ValueError('Inconsistent ID: '+str(rel))
        if expected in ids: raise ValueError('Duplicate ID: '+expected)
        ids.add(expected)
        if r['license']!='CC0-1.0' or r['format']!='glb' or rel.suffix!='.glb': raise ValueError('Only indexed CC0-1.0 GLBs are accepted: '+str(rel))
        for field in ['license_url','source_pack_or_url','author','downloaded_utc']:
            if not r.get(field): raise ValueError('Missing provenance '+field+': '+str(rel))
        if r['license_url'].rstrip('/')!='https://creativecommons.org/publicdomain/zero/1.0': raise ValueError('Unexpected CC0 dedication URL: '+str(rel))
        scale=float(r['suggested_scale_m'])
        if not math.isfinite(scale) or scale<=0 or int(r['approx_tris'])<=0: raise ValueError('Invalid scale/triangle metadata: '+str(rel))
        if r['y_up'] not in ['true','false']: raise ValueError('Invalid up-axis flag: '+str(rel))
        path=source/str(rel)
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(source.resolve()): raise ValueError('Missing or unsafe GLB: '+str(rel))
        gltf,digest=inspect_glb(path)
        manifest.append(dict(id=expected,relative_path='LowPoly/'+str(rel),category=r['category'],subcategory=r['subcategory'],tags=r['tags'].split(';'),suggested_scale_m=scale,y_up=r['y_up']=='true',character_rigged=bool(gltf.get('skins')),license='CC0-1.0',license_url=r['license_url'],source_url=r['source_pack_or_url'],author=r['author'],approx_tris=int(r['approx_tris']),sha256=digest,normalization={'axis_rotation_x_radians':0 if r['y_up']=='true' else -math.pi/2,'forward_rotation_y_radians':math.pi,'source_forward_assumption':'+Z','semantic_front_verified':False,'placement':'center_xz_min_y_after_scale_and_rotation'},animation_clips=[a.get('name',f'clip_{i}') for i,a in enumerate(gltf.get('animations',[]))]))
        tint_names=supplements.get(expected,{}).get('material_tint_names',[])
        if tint_names:
            names={m.get('name') for m in gltf.get('materials',[])}
            if not isinstance(tint_names,list) or any(n not in names or any(p in n.lower() for p in ['skin','hair','eye']) for n in tint_names): raise ValueError('Invalid clothing tint binding: '+expected)
            manifest[-1]['material_tint_names']=tint_names
        if r['category']=='character' and r['subcategory']=='base': manifest[-1]['resolved_node_count']=len(gltf.get('nodes',[]))+3
        if 'generation_enabled' in supplements.get(expected,{}):manifest[-1]['generation_enabled']=supplements[expected]['generation_enabled']
        dependencies=[]
        for image in gltf.get('images',[]):
            uri=image.get('uri','')
            if uri and not uri.startswith('data:'):
                texture=path.parent/uri;dependencies.append({'relative_path':str(rel.parent/PurePosixPath(uri)),'sha256':hashlib.sha256(texture.read_bytes()).hexdigest()})
        if dependencies:manifest[-1]['bundled_textures']=dependencies
    found={p.relative_to(source).as_posix() for p in source.rglob('*.glb')}
    if found!=set(indexed): raise ValueError('CSV/GLB mismatch; unindexed='+str(sorted(found-set(indexed)))+' missing='+str(sorted(set(indexed)-found)))
    bases=[r for r in manifest if r['id'].startswith('character.base.')]
    if not any(r['id']=='character.base.neutral_humanoid_01' for r in bases) or not all(r['character_rigged'] for r in bases): raise ValueError('Require the original neutral base and skinned registered character bases')
    return sorted(manifest,key=lambda r:r['id'])

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,default=ROOT/'assets/lowpoly_cc0');parser.add_argument('--dry-run',action='store_true');args=parser.parse_args()
    assets=inventory(args.source)
    counts=collections.Counter(a['category'] for a in assets)
    empty=sorted(set(GAPS)|{str(p.relative_to(args.source)).replace('/','.') for p in args.source.glob('*/*') if p.is_dir() and not any(p.glob('*.glb'))})
    print(f'Validated {len(assets)} CC0 GLBs; counts: '+json.dumps(dict(sorted(counts.items()))));print('Empty subcategories: '+', '.join(empty))
    if args.dry_run:return
    runtime=ROOT/'ios/Braive/Resources';destination=runtime/'LowPoly'
    expected={a['relative_path'][len('LowPoly/'):] for a in assets}
    # Remove stale importer-owned output only after the entire input passes validation.
    if destination.exists():
        for old in destination.rglob('*.glb'):
            if old.relative_to(destination).as_posix() not in expected:old.unlink()
    for a in assets:
        rel=a['relative_path'][len('LowPoly/'):];out=destination/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(args.source/rel,out)
        for texture in a.get('bundled_textures',[]):
            rel=texture['relative_path'];out=destination/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(args.source/rel,out)
    shutil.copyfile(args.source/'LICENSE_INDEX.csv',destination/'LICENSE_INDEX.csv')
    for notice in args.source.glob('*LICENSE*.txt'):shutil.copyfile(notice,destination/notice.name)
    for gap in empty:(destination/Path(*gap.split('.'))).mkdir(parents=True,exist_ok=True)
    encoded=json.dumps(assets,indent=2)+'\n'
    for output in [args.source/'asset_manifest.json',runtime/'asset_manifest.json',ROOT/'backend/assets/asset_manifest.json']:
        output.parent.mkdir(parents=True,exist_ok=True);output.write_text(encoded)
    print('Wrote identical source, iOS, and backend manifests; GLB bytes unchanged.')
if __name__=='__main__':
    try:main()
    except (ValueError,KeyError,OSError,struct.error) as e:raise SystemExit('Import rejected: '+str(e))
