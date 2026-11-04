#!/usr/bin/env python3
"""Compose friendly civilian variants from Kenney's licensed SVG skin sources.

This edits vector source, not generated imagery or model geometry. The original
CC0 archive and its hash are recorded separately; no branded or weapon artwork.
Requires the local resvg-py inspection tool, not a production app dependency.
"""
from pathlib import Path
from copy import deepcopy
import json,re,sys,zipfile
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend/data/tools/pythonlibs'))
import resvg_py

NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
archive=ROOT/'backend/data/asset-candidates/animated-characters-protagonists.zip'
output=ROOT/'backend/data/asset-candidates/civilian-skins';output.mkdir(parents=True,exist_ok=True)
sources=ROOT/'assets/character-source/kenney-protagonists';sources.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as pack:
    for name in ['criminalMaleA','skaterMaleA','skaterFemaleA']:
        (sources/(name+'.svg')).write_bytes(pack.read('Skins/Source/'+name+'.svg'))
    (sources/'LICENSE.txt').write_bytes(pack.read('License.txt'))

variants=[
 ('civilian_01','skaterMaleA','#e8e5dc','#47786c',(1.0,1.0,1.0)),
 ('civilian_02','skaterFemaleA','#445368','#72918c',(1.0,1.0,1.0)),
 ('civilian_03','skaterMaleA','#788c7c','#d1c4a6',(.70,.65,.62)),
 ('civilian_04','skaterFemaleA','#d7cbb7','#7c8c9c',(.52,.46,.43)),
]
def layer(name,prefix,body=False,shirt='',trim='',tone=(1,1,1)):
    tree=ET.fromstring((sources/(name+'.svg')).read_text())
    for element in tree.iter():
        for key,value in list(element.attrib.items()):
            if key=='id':element.set(key,prefix+value)
            elif 'url(#' in value:element.set(key,re.sub(r'url\(#([^)]*)\)',lambda m:'url(#'+prefix+m[1]+')',value))
            elif value.startswith('#') and len(value)==7:
                r,g,b=[int(value[i:i+2],16) for i in [1,3,5]]
                if r>180 and 70<g<190 and 35<b<160 and r>g*1.2 and g>b*1.05:
                    element.set(key,'#'+''.join(f'{min(255,round(channel*factor)):02x}' for channel,factor in zip((r,g,b),tone)))
                elif body and value.upper()=='#FFFFFF':element.set(key,shirt)
                elif body and value.upper() in ['#037E60','#009F78']:element.set(key,trim)
    return tree

records=[]
for identifier,head,shirt,trim,tone in variants:
    svg=ET.Element('{'+NS+'}svg',{'width':'1024','height':'1024','viewBox':'0 0 1024 1024'})
    defs=ET.SubElement(svg,'{'+NS+'}defs')
    clip=ET.SubElement(defs,'{'+NS+'}clipPath',{'id':'head_region'})
    ET.SubElement(clip,'{'+NS+'}rect',{'x':'0','y':'0','width':'639','height':'490'})
    body=layer('criminalMaleA','body_',True,shirt,trim,tone)
    face=layer(head,'face_',tone=tone)
    for content in [body,face]:
        for child in list(content):
            if child.tag.endswith('defs'):
                for definition in child:defs.append(deepcopy(definition))
    for child in body:
        if not child.tag.endswith('defs'):svg.append(deepcopy(child))
    group=ET.SubElement(svg,'{'+NS+'}g',{'clip-path':'url(#head_region)'})
    for child in face:
        if not child.tag.endswith('defs'):group.append(deepcopy(child))
    vector=ET.tostring(svg,encoding='unicode')
    (sources/(identifier+'.svg')).write_text(vector)
    png=resvg_py.svg_to_bytes(svg_string=vector,width=1024,height=1024)
    (output/(identifier+'.png')).write_bytes(png)
    records.append({'variant':identifier,'skin':str(output/(identifier+'.png')),'head_source':head,'clothing_source':'criminalMaleA',
      'changes':'SVG clothing palette, friendly source face, coordinated skin palette; source body mesh unchanged'})
(output/'variants.json').write_text(json.dumps(records,indent=2))
print('Prepared four civilian SVG source derivatives and 1024px material textures.')
