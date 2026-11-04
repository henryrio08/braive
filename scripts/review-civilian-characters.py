"""Blender source/pose inspection only; not native iPhone acceptance."""
from pathlib import Path
import bpy,json,math,struct
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1]
output=ROOT/'backend/data/asset-candidates/civilian-review';output.mkdir(parents=True,exist_ok=True)
results=[]
for variant in ['civilian_01','civilian_02','civilian_03','civilian_04']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path=ROOT/'backend/data/asset-candidates/civilian-models'/f'{variant}.glb'
    data=path.read_bytes();document=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
    source_meshes={n.get('name') for n in document['nodes'] if 'mesh' in n}
    bpy.ops.import_scene.gltf(filepath=str(path))
    # The importer creates a hidden Icosphere for bone display. It is not in
    # the GLB and must never change the measured model scale or ground contact.
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name in source_meshes];rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    imported=[o for o in bpy.context.scene.objects if o.type!='MESH' or o in meshes]
    rig.animation_data_create();rig.animation_data.action=None
    for track in rig.animation_data.nla_tracks:track.mute=True
    for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
    vertices=[obj.matrix_world@v.co for obj in meshes for v in obj.data.vertices]
    low=Vector([min(v[k] for v in vertices) for k in range(3)]);high=Vector([max(v[k] for v in vertices) for k in range(3)])
    scale=1.7/(high.z-low.z)
    placement=bpy.data.objects.new('placement',None);bpy.context.collection.objects.link(placement)
    for obj in imported:
        if obj.parent is None:obj.parent=placement
    placement.scale=(scale,)*3;placement.location=(-(low.x+high.x)/2*scale,-(low.y+high.y)/2*scale,-low.z*scale)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
    scene.render.resolution_x=480;scene.render.resolution_y=600;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.7,.73,.72,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015));floor=bpy.context.object
    mat=bpy.data.materials.new('floor');mat.diffuse_color=(.65,.62,.55,1);floor.data.materials.append(mat)
    bpy.ops.object.light_add(type='AREA',location=(-3,-4,5));bpy.context.object.data.energy=450;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=4
    bpy.ops.object.camera_add(location=(2.7,-5.2,2.4));camera=bpy.context.object
    camera.rotation_euler=(Vector((0,0,.85))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=58;scene.camera=camera
    poses={}
    actions={a.name.split('|')[-1]:a for a in bpy.data.actions}
    chair_entry=next(a for a in json.loads((ROOT/'backend/assets/asset_manifest.json').read_text()) if a['id']=='furniture.chair.classic_chair_01')
    old_objects=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'ios/Braive/Resources'/chair_entry['relative_path']))
    chair_objects=[o for o in bpy.data.objects if o not in old_objects]
    chair_root=bpy.data.objects.new('chair_placement',None);bpy.context.collection.objects.link(chair_root)
    for o in chair_objects:
        if o.parent is None:o.parent=chair_root
    chair_root.scale=(chair_entry['suggested_scale_m'],)*3
    chair_root.rotation_euler.z=math.pi
    bpy.context.view_layer.update()
    chair_vertices=[o.matrix_world@v.co for o in chair_objects if o.type=='MESH' for v in o.data.vertices]
    chair_root.location=(-sum([min(v.x for v in chair_vertices),max(v.x for v in chair_vertices)])/2,-sum([min(v.y for v in chair_vertices),max(v.y for v in chair_vertices)])/2,-min(v.z for v in chair_vertices))
    print('IMPORTED_ACTIONS',variant,list(actions),flush=True)
    for name in ['idle','sit','wave']:
        for o in chair_objects:o.hide_render=name!='sit'
        action=actions.get(name)
        if action is None:raise RuntimeError('Missing exported clip '+name)
        rig.animation_data.action=action
        if action.slots:rig.animation_data.action_slot=action.slots[0]
        first,last=action.frame_range;scene.frame_set(int(first+(last-first)*.3));bpy.context.view_layer.update()
        evaluated=[];depsgraph=bpy.context.evaluated_depsgraph_get()
        for obj in meshes:
            actual=obj.evaluated_get(depsgraph);mesh=actual.to_mesh()
            evaluated += [actual.matrix_world@v.co for v in mesh.vertices];actual.to_mesh_clear()
        poses[name]={'min':[min(v[k] for v in evaluated) for k in range(3)],'max':[max(v[k] for v in evaluated) for k in range(3)]}
        scene.render.filepath=str(output/f'{variant}-{name}.png');bpy.ops.render.render(write_still=True)
    results.append({'variant':variant,'scale':scale,'gltf_nodes':len(imported),'bones':len(rig.data.bones),'poses_blender_z_up':poses})
(output/'inspection.json').write_text(json.dumps(results,indent=2))
print('POSE_REVIEW_COMPLETE',flush=True)
