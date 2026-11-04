#!/usr/bin/env python3
"""Offline contact sheets of the actual registered GLB geometry/materials.

Pillow-only inspection renderer: this is NOT SceneKit/headset acceptance evidence.
No meshes are generated or modified. Palette textures and node transforms come
from the source files; posed/skinned animation still requires the native audit.
"""
from pathlib import Path
from io import BytesIO
import argparse, base64, json, math, struct, textwrap
from PIL import Image, ImageDraw, ImageFont
from asset_bounds import IDENTITY, multiply, transform, trs

ROOT = Path(__file__).resolve().parents[1]
FORMATS = {5120: ('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
COUNTS = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def geometry(entry):
    path=ROOT/'assets/lowpoly_cc0'/entry['relative_path'].removeprefix('LowPoly/')
    data=path.read_bytes(); offset=12; document=None; binary=b''
    while offset<len(data):
        length,kind=struct.unpack_from('<II',data,offset);chunk=data[offset+8:offset+8+length];offset+=8+length
        if kind==0x4e4f534a:document=json.loads(chunk)
        elif kind==0x004e4942:binary=chunk
    if document is None:raise ValueError('Missing GLB JSON')
    def accessor(index):
        a=document['accessors'][index];view=document['bufferViews'][a['bufferView']]
        code,size=FORMATS[a['componentType']];count=COUNTS[a['type']]
        stride=view.get('byteStride',size*count);start=view.get('byteOffset',0)+a.get('byteOffset',0)
        values=[struct.unpack_from('<'+code*count,binary,start+i*stride) for i in range(a['count'])]
        if a.get('normalized') and code!='f':
            divisor={5120:127,5121:255,5122:32767,5123:65535}.get(a['componentType'],1)
            values=[tuple(max(-1,v/divisor) for v in row) for row in values]
        return values
    images={}
    def texture(index):
        source=document['textures'][index]['source']
        if source not in images:
            spec=document['images'][source]
            if 'bufferView' in spec:
                v=document['bufferViews'][spec['bufferView']];image=Image.open(BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]))
            elif spec.get('uri','').startswith('data:'):image=Image.open(BytesIO(base64.b64decode(spec['uri'].split(',',1)[1])))
            else:image=Image.open(path.parent/spec['uri'])
            images[source]=image.convert('RGB')
        return images[source]
    triangles=[]
    def walk(index,parent):
        node=document['nodes'][index];world=multiply(parent,trs(node))
        if 'mesh' in node:
            for primitive in document['meshes'][node['mesh']]['primitives']:
                if primitive.get('mode',4)!=4:continue
                positions=[transform(world,p) for p in accessor(primitive['attributes']['POSITION'])]
                indices=[p[0] for p in accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
                material=document.get('materials',[{}])[primitive.get('material',0)] if document.get('materials') else {}
                pbr=material.get('pbrMetallicRoughness',{});factor=pbr.get('baseColorFactor',[0.65,0.68,0.64,1])
                uv=accessor(primitive['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in primitive['attributes'] else None
                palette=texture(pbr['baseColorTexture']['index']) if uv and 'baseColorTexture' in pbr else None
                colors=accessor(primitive['attributes']['COLOR_0']) if 'COLOR_0' in primitive['attributes'] else None
                for i in range(0,len(indices)-2,3):
                    ids=indices[i:i+3];color=list(factor[:3])
                    if palette:
                        u=sum(uv[k][0] for k in ids)/3;v=sum(uv[k][1] for k in ids)/3
                        pixel=palette.getpixel((min(palette.width-1,int((u%1)*palette.width)),min(palette.height-1,int((v%1)*palette.height))))
                        color=[color[k]*pixel[k]/255 for k in range(3)]
                    if colors:color=[color[k]*sum(colors[n][k] for n in ids)/3 for k in range(3)]
                    triangles.append(([positions[k] for k in ids],color))
        for child in node.get('children',[]):walk(child,world)
    scale=entry['suggested_scale_m'];angle=entry['normalization']['axis_rotation_x_radians'];yaw=entry['normalization']['forward_rotation_y_radians']
    frame=trs({'rotation':[0,math.sin(yaw/2),0,math.cos(yaw/2)]})
    frame=multiply(frame,trs({'rotation':[math.sin(angle/2),0,0,math.cos(angle/2)],'scale':[scale]*3}))
    for index in document['scenes'][document.get('scene',0)]['nodes']:walk(index,frame)
    return triangles

def render(triangles,size=320,yaw=0.62):
    image=Image.new('RGB',(size,size),'#e8e5dc');draw=ImageDraw.Draw(image)
    points=[p for triangle,_ in triangles for p in triangle]
    if not points:return image
    low=[min(p[k] for p in points) for k in range(3)];high=[max(p[k] for p in points) for k in range(3)]
    center=[(low[0]+high[0])/2,low[1],(low[2]+high[2])/2]
    pitch=0.30;cy,sy=math.cos(yaw),math.sin(yaw);cp,sp=math.cos(pitch),math.sin(pitch)
    def project(p):
        x,y,z=[p[k]-center[k] for k in range(3)];rx=cy*x-sy*z;rz=sy*x+cy*z
        return (rx,cp*y-sp*rz,sp*y+cp*rz)
    transformed=[([project(p) for p in triangle],color,triangle) for triangle,color in triangles]
    projected=[p for triangle,_,_ in transformed for p in triangle]
    minx,maxx=min(p[0] for p in projected),max(p[0] for p in projected)
    miny,maxy=min(p[1] for p in projected),max(p[1] for p in projected)
    scale=min((size-35)/max(0.01,maxx-minx),(size-48)/max(0.01,maxy-miny))
    def screen(p):return (size/2+(p[0]-(minx+maxx)/2)*scale,size-25-(p[1]-miny)*scale)
    draw.ellipse((size*.2,size*.82,size*.8,size*.94),fill='#d4d1c7')
    for projected,color,triangle in sorted(transformed,key=lambda item:sum(p[2] for p in item[0])/3):
        a,b,c=triangle;u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];length=math.sqrt(sum(t*t for t in n))
        light=.70+.30*abs(sum(n[k]*[.4,.8,-.45][k] for k in range(3))/max(length,.00001))
        fill=tuple(max(0,min(255,round((component**(1/2.2))*255*light))) for component in color)
        draw.polygon([screen(p) for p in projected],fill=fill)
    return image

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'docs/asset-review');parser.add_argument('--category');args=parser.parse_args()
    manifest=json.loads((ROOT/'assets/lowpoly_cc0/asset_manifest.json').read_text())
    groups={}
    for entry in manifest:
        if args.category and entry['category']!=args.category:continue
        groups.setdefault(entry['category'],[]).append(entry)
    args.output.mkdir(parents=True,exist_ok=True);index=[]
    font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',15)
    titlefont=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',25)
    for category,entries in groups.items():
        for page in range(0,len(entries),24):
            selected=entries[page:page+24];columns=6;rows=math.ceil(len(selected)/columns);tilew,tileh=260,310
            sheet=Image.new('RGB',(columns*tilew,rows*tileh+90),'#f4f1e8');d=ImageDraw.Draw(sheet)
            d.text((20,12),category.replace('_',' ').title()+' — actual GLB inspection',font=titlefont,fill='#172d25')
            d.text((20,48),'Source geometry/material preview. Not native stereo, animation, or headset evidence.',font=font,fill='#536057')
            for i,entry in enumerate(selected):
                x=(i%columns)*tilew;y=90+(i//columns)*tileh
                preview=render(geometry(entry),size=250);sheet.paste(preview,(x+5,y))
                label='\n'.join(textwrap.wrap(entry['id'],width=33))
                d.text((x+9,y+253),label,font=font,fill='#172d25')
                bounds=entry['bounds_meters'];sizes=[bounds['max'][k]-bounds['min'][k] for k in range(3)]
                d.text((x+9,y+291),' × '.join(f'{n:.2f}' for n in sizes)+' m',font=font,fill='#536057')
            filename=f'{category}-{page//24+1}.jpg';sheet.save(args.output/filename,quality=91)
            index.append((category,filename,[e['id'] for e in selected]))
            print(filename,flush=True)
    (args.output/'index.json').write_text(json.dumps([{'category':c,'image':p,'asset_ids':ids} for c,p,ids in index],indent=2))
    (args.output/'README.md').write_text('# Actual asset inspection gallery\n\nThese contact sheets use the registered source GLBs and materials. This software preview is for asset curation; it is not SceneKit, animation, or headset acceptance evidence. Dimensions are measured normalized rest bounds, not guessed prop sizes.\n\n'+'\n\n'.join(f'![{c}]({p})' for c,p,_ in index))

if __name__=='__main__':main()
