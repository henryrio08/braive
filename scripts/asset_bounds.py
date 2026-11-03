"""Rest-geometry bounds using the same normalization as the native GLB loader.

These are measured geometry bounds, not certified semantic fronts or seat anchors.
No source mesh, rig or material is modified.
"""
import math

IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
def multiply(a,b):
    return [sum(a[k*4+row]*b[col*4+k] for k in range(4)) for col in range(4) for row in range(4)]
def transform(m,p):
    return [sum(m[k*4+row]*p[k] for k in range(3))+m[12+row] for row in range(3)]
def trs(node):
    if 'matrix' in node:return node['matrix']
    x,y,z,w=node.get('rotation',[0,0,0,1]);sx,sy,sz=node.get('scale',[1,1,1]);tx,ty,tz=node.get('translation',[0,0,0])
    return [(1-2*y*y-2*z*z)*sx,(2*x*y+2*z*w)*sx,(2*x*z-2*y*w)*sx,0,
            (2*x*y-2*z*w)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*x*w)*sy,0,
            (2*x*z+2*y*w)*sz,(2*y*z-2*x*w)*sz,(1-2*x*x-2*y*y)*sz,0,tx,ty,tz,1]
def normalized_bounds(gltf,scale,y_up):
    angle=0 if y_up else -math.pi/2;c=math.cos(angle);s=math.sin(angle)
    axis=[scale,0,0,0,0,c*scale,s*scale,0,0,-s*scale,c*scale,0,0,0,0,1]
    forward=[-1,0,0,0,0,1,0,0,0,0,-1,0,0,0,0,1]
    frame=multiply(forward,axis)
    nodes=gltf.get('nodes',[]);meshes=gltf.get('meshes',[]);accessors=gltf.get('accessors',[])
    low=[math.inf]*3;high=[-math.inf]*3
    roots=gltf.get('scenes',[{}])[gltf.get('scene',0)].get('nodes',[]) if gltf.get('scenes') else []
    if not roots:roots=[i for i in range(len(nodes)) if not any(i in n.get('children',[]) for n in nodes)]
    def walk(index,parent,ancestors):
        if index in ancestors:raise ValueError('Cyclic GLB hierarchy')
        node=nodes[index];world=multiply(parent,trs(node))
        if 'mesh' in node:
            for primitive in meshes[node['mesh']].get('primitives',[]):
                accessor=accessors[primitive['attributes']['POSITION']]
                if 'min' not in accessor or 'max' not in accessor:raise ValueError('POSITION bounds missing')
                for x in [accessor['min'][0],accessor['max'][0]]:
                    for y in [accessor['min'][1],accessor['max'][1]]:
                        for z in [accessor['min'][2],accessor['max'][2]]:
                            point=transform(world,[x,y,z])
                            for k in range(3):low[k]=min(low[k],point[k]);high[k]=max(high[k],point[k])
        for child in node.get('children',[]):walk(child,world,ancestors|{index})
    for index in roots:walk(index,frame,set())
    if not all(math.isfinite(v) for v in low+high):raise ValueError('No finite geometry bounds')
    width,height,depth=[high[i]-low[i] for i in range(3)]
    return {'min':[round(-width/2,6),0,round(-depth/2,6)],'max':[round(width/2,6),round(height,6),round(depth/2,6)],'basis':'normalized_rest_geometry'}
