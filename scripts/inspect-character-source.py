"""Run with the official portable Blender to inspect licensed FBX candidates."""
from pathlib import Path
import bpy,json,zipfile
root=Path(__file__).resolve().parents[1]
folder=root/'backend/data/asset-candidates/protagonists'
folder.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(root/'backend/data/asset-candidates/animated-characters-protagonists.zip') as archive:
    for item in archive.infolist():
        if not (folder/item.filename).resolve().is_relative_to(folder.resolve()):raise ValueError('Unsafe archive path')
    archive.extractall(folder)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(folder/'Model/characterMedium.fbx'))
result=[]
for obj in bpy.data.objects:
    item={'name':obj.name,'type':obj.type,'dimensions':list(obj.dimensions)}
    if obj.type=='ARMATURE':item['bones']=[{'name':b.name,'head':list(b.head_local),'tail':list(b.tail_local),'parent':b.parent.name if b.parent else None} for b in obj.data.bones]
    if obj.type=='MESH':item.update(triangles=sum(len(p.vertices)-2 for p in obj.data.polygons),materials=[m.name for m in obj.data.materials])
    result.append(item)
(folder/'inspection.json').write_text(json.dumps(result,indent=2))
print('CHARACTER_SOURCE',json.dumps(result))
