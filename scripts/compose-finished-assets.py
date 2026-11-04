"""Assemble real CC0 source assets into finished reusable object GLBs.

No new mesh is synthesized. Source shapes, materials and provenance are retained;
static book instances share materials and are joined only to reduce submissions.
"""
from pathlib import Path
import bpy,json,math
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1]
manifest={a['id']:a for a in json.loads((ROOT/'backend/assets/asset_manifest.json').read_text())}
bpy.ops.wm.read_factory_settings(use_empty=True)

def source(asset_id):
    a=manifest[asset_id];old=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'ios/Braive/Resources'/a['relative_path']))
    objects=[o for o in bpy.data.objects if o not in old]
    root=bpy.data.objects.new(asset_id,None);bpy.context.collection.objects.link(root)
    for o in objects:
        if o.parent is None:o.parent=root
    root.scale=(a['suggested_scale_m'],)*3
    # Assembly file uses source +Z as front; the runtime importer will rotate
    # its frame by pi, as for the civilian sources. Original GLBs stay intact.
    root.rotation_euler.x=a['normalization']['axis_rotation_x_radians']
    bpy.context.view_layer.update()
    verts=[o.matrix_world@v.co for o in objects if o.type=='MESH' for v in o.data.vertices]
    low=Vector([min(v[k] for v in verts) for k in range(3)]);high=Vector([max(v[k] for v in verts) for k in range(3)])
    root.location=(-(low.x+high.x)/2,-(low.y+high.y)/2,-low.z)
    bpy.context.view_layer.update()
    return root,objects

case,case_objects=source('furniture.shelf.classic_bookcase_open_01')
books,book_objects=source('interior_prop.book.classic_books_01')
book_meshes=[o for o in book_objects if o.type=='MESH']
if len(book_meshes)!=1:raise RuntimeError('Inspect changed book source before composing')
book=book_meshes[0]
def linear_hex(value):
    rgb=[int(value[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
palette={'carpetDarker':'#46576c','plant':'#a66b4b','carpetWhite':'#eee8d8','metal':'#c5baa4'}
for material in book.data.materials:
    color=palette.get(material.name)
    if color:
        material.diffuse_color=linear_hex(color)
        for node in material.node_tree.nodes:
            if node.type=='BSDF_PRINCIPLED':node.inputs['Base Color'].default_value=linear_hex(color);node.inputs['Roughness'].default_value=.85
# Measure actual upward-facing shelf boards, not invented layout coordinates.
levels={}
for obj in case_objects:
    if obj.type!='MESH':continue
    normal_matrix=obj.matrix_world.to_3x3().inverted().transposed()
    for poly in obj.data.polygons:
        if (normal_matrix@poly.normal).normalized().z>.95 and poly.area>.04:
            height=round((obj.matrix_world@poly.center).z,3)
            levels[height]=levels.get(height,0)+poly.area
surfaces=sorted(height for height,area in levels.items() if area>.08 and height<1.5)
if len(surfaces)<3:raise RuntimeError('Source shelf planes changed; inspect before exporting')
print('MEASURED_SHELF_LEVELS',surfaces,flush=True)
for level,height in enumerate(surfaces):
    for column in range(2):
        duplicate=book.copy();duplicate.data=book.data;bpy.context.collection.objects.link(duplicate)
        world=book.matrix_world.copy();duplicate.parent=None
        duplicate.matrix_world=Matrix.Translation(Vector((-.17+column*.34,.03,height))) @ Matrix.Scale(2.2,4) @ world
        duplicate.name=f'books_{level}_{column}'
# Remove only the unplaced source template after all real instances exist.
bpy.data.objects.remove(books,do_unlink=True)
for o in book_objects:
    if o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
mesh_objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in mesh_objects:o.select_set(True)
bpy.context.view_layer.objects.active=mesh_objects[0];bpy.ops.object.join()
finished=bpy.context.object;finished.name='FinishedBookcase'
output=ROOT/'backend/data/asset-candidates/finished-assets';output.mkdir(exist_ok=True)
path=output/'furniture.shelf.filled_bookcase_01.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_animations=False,export_yup=True,export_apply=False,use_selection=True)
print('FINISHED_ASSET',str(path),'triangles',sum(len(p.vertices)-2 for p in finished.data.polygons))
