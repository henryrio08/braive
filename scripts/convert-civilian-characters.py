"""Blender conversion of real Kenney CC0 source geometry, optimized for crowds.

Keeps all source vertices, material UVs, weights and required bind ancestors.
Unweighted controls are omitted. App-owned FK clips avoid unsupported FBX control
constraints. No mesh is invented or remeshed.
"""
from pathlib import Path
import bpy,json,math
from mathutils import Matrix,Vector

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'backend/data/asset-candidates/protagonists'
output=ROOT/'backend/data/asset-candidates/civilian-models';output.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source/'Model/characterMedium.fbx'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
meshes=[o for o in bpy.data.objects if o.type=='MESH']
rig.name='CivilianRig'
body_names=['Hips','Spine','Chest','UpperChest','Neck','Head']
for side in ['Left','Right']:body_names += [side+n for n in ['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','Toes']]
body_names=[n for n in body_names if n in rig.data.bones]
parents={n:rig.data.bones[n].parent.name if rig.data.bones[n].parent else None for n in body_names}
rest={n:rig.data.bones[n].matrix_local.copy() for n in body_names}
original_bones={b.name:b.parent.name if b.parent else None for b in rig.data.bones}

# Preserve source weights and bind hierarchy. Only mark genuinely unused bones
# non-deforming; the exporter keeps required ancestors automatically.
rig.animation_data_clear()
weighted=set()
for mesh in meshes:
    names=[g.name for g in mesh.vertex_groups]
    for vertex in mesh.data.vertices:
        for group in vertex.groups:
            if group.weight>0:weighted.add(names[group.group])
for bone in rig.data.bones:bone.use_deform=bone.name in weighted
for name in body_names:
    rig.pose.bones[name].rotation_mode='QUATERNION'
for action in list(bpy.data.actions):bpy.data.actions.remove(action)

def local_basis(name,pose):
    bone=rig.data.bones[name];parent=bone.parent
    if parent:return bone.convert_local_to_pose(pose[name],bone.matrix_local,parent_matrix=pose.get(parent.name,parent.matrix_local),parent_matrix_local=parent.matrix_local,invert=True)
    return bone.convert_local_to_pose(pose[name],bone.matrix_local,invert=True)

def make_action(name,samples,stride=2):
    action=bpy.data.actions.new(name);rig.animation_data_create();rig.animation_data.action=action
    for index,pose in enumerate(samples):
        frame=1+index*stride
        for bone_name in body_names:
            bone=rig.pose.bones[bone_name];bone.matrix_basis=local_basis(bone_name,pose)
            for channel in ['location','rotation_quaternion','scale']:bone.keyframe_insert(data_path=channel,frame=frame,group=bone_name)
    action.use_fake_user=True
    return action

# App-owned FK clips, with no dependency on FBX control-rig constraints.
# Rest/parent matrices are those of the final compact rig and its inverse binds.
rest={n:rig.data.bones[n].matrix_local.copy() for n in body_names}
from mathutils import Quaternion

def fk_pose(phase=0.0, movement=0.0, seated=False, wave=False):
    rotations={}
    for side,sign in [('Left',1),('Right',-1)]:
        arm_drop=math.radians(78)*sign
        swing=math.sin(phase+(0 if side=='Left' else math.pi))*movement
        rotations[side+'Arm']=Quaternion((1,0,0),swing*.45) @ Quaternion((0,1,0),arm_drop)
        rotations[side+'UpLeg']=Quaternion((1,0,0),swing)
        rotations[side+'Leg']=Quaternion((1,0,0),max(0,-swing)*1.3)
    if seated:
        for side in ['Left','Right']:
            rotations[side+'UpLeg']=Quaternion((1,0,0),math.radians(-70))
            rotations[side+'Leg']=Quaternion((1,0,0),math.radians(70))
    if wave:
        rotations['RightArm']=Quaternion((0,1,0),math.radians(35))
        rotations['RightForeArm']=Quaternion((0,1,0),math.radians(45)+math.sin(phase*2)*.25)
    pose={}
    for name in body_names:
        parent=parents[name]
        inherited=pose[parent] @ rest[parent].inverted() @ rest[name] if parent in pose else rest[name].copy()
        if name in rotations:
            basis=rest[name].to_quaternion()
            local=basis.inverted() @ rotations[name] @ basis
            inherited=inherited @ local.to_matrix().to_4x4()
        if parent not in pose:
            inherited=Matrix.Translation((0,0,-.30 if seated else math.sin(phase)*.008)) @ inherited
        pose[name]=inherited
    return pose

actions={}
for name,movement,seated,wave in [('idle',0,False,False),('walk',.40,False,False),('run',.65,False,False),('sit',0,True,False),('wave',0,False,True),('gesture_seated',0,True,True)]:
    samples=[fk_pose(i/30*2*math.pi,movement,seated,wave) for i in range(31)]
    actions[name]=make_action(name,samples,stride=2 if name!='run' else 1)

rig.animation_data.action=None
for name,action in actions.items():
    track=rig.animation_data.nla_tracks.new();track.name=name
    strip=track.strips.new(name,1,action)
    if action.slots:strip.action_slot=action.slots[0]
    track.mute=True

# Reset all poses before export; armature inverse binds and source vertices
# remain consistent. Named clips establish the runtime poses.
for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
for mesh in meshes:
    for material in mesh.data.materials:
        material.use_nodes=True;nodes=material.node_tree.nodes;nodes.clear()
        out=nodes.new('ShaderNodeOutputMaterial');bsdf=nodes.new('ShaderNodeBsdfPrincipled');texture=nodes.new('ShaderNodeTexImage')
        bsdf.inputs['Roughness'].default_value=.85
        material.node_tree.links.new(texture.outputs['Color'],bsdf.inputs['Base Color'])
        material.node_tree.links.new(bsdf.outputs['BSDF'],out.inputs['Surface'])
        material.name='civilian_skin'

variants=json.loads((ROOT/'backend/data/asset-candidates/civilian-skins/variants.json').read_text())
valid_options=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
records=[]
for variant in variants:
    image=bpy.data.images.load(variant['skin'],check_existing=True)
    for mesh in meshes:
        for material in mesh.data.materials:
            next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE').image=image
    path=output/(variant['variant']+'.glb')
    options={'filepath':str(path),'export_format':'GLB','export_animations':True,'export_animation_mode':'NLA_TRACKS',
      'export_nla_strips':True,'export_force_sampling':True,'export_skins':True,'export_yup':True,'export_def_bones':True,
      'export_apply':False,'export_rest_position_armature':True,'export_materials':'EXPORT'}
    # Muted tracks are normally excluded; export one independent named action
    # at a time through ACTIONS when supported (all clips share this one rig).
    options['export_animation_mode']='ACTIONS'
    bpy.ops.export_scene.gltf(**{k:v for k,v in options.items() if k in valid_options})
    records.append({'variant':variant['variant'],'file':str(path),'body_bones':len(body_names),'source_triangles':sum(len(p.vertices)-2 for m in meshes for p in m.data.polygons)})
(output/'conversion.json').write_text(json.dumps(records,indent=2))
print('CONVERTED_CIVILIANS',json.dumps(records))
