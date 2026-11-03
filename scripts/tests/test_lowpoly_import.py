import csv, importlib.util, shutil, tempfile, unittest, json, struct
from pathlib import Path
SPEC=importlib.util.spec_from_file_location('lowpoly',Path(__file__).resolve().parents[1]/'import-lowpoly-pack.py')
module=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(module)
class ImportTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  source=module.ROOT/'assets/lowpoly_cc0'
  with (source/'LICENSE_INDEX.csv').open() as f:
   reader=csv.DictReader(f);self.fields=reader.fieldnames;self.row=next(r for r in reader if r['subcategory']=='base')
  target=self.root/self.row['file_path'];target.parent.mkdir(parents=True);shutil.copyfile(source/self.row['file_path'],target);self.write()
 def tearDown(self):self.temp.cleanup()
 def write(self):
  with (self.root/'LICENSE_INDEX.csv').open('w',newline='') as f:
   w=csv.DictWriter(f,fieldnames=self.fields);w.writeheader();w.writerow(self.row)
 def test_original_skin_and_scale(self):
  entry=module.inventory(self.root)[0];self.assertTrue(entry['character_rigged']);self.assertEqual(entry['suggested_scale_m'],0.1)
 def test_non_cc0_rejected(self):
  self.row['license']='CC-BY-4.0';self.write()
  with self.assertRaisesRegex(ValueError,'CC0'):module.inventory(self.root)
 def test_unindexed_glb_rejected(self):
  shutil.copyfile(self.root/self.row['file_path'],self.root/'unlisted.glb')
  with self.assertRaisesRegex(ValueError,'mismatch'):module.inventory(self.root)
 def test_traversal_rejected(self):
  self.row['file_path']='../outside.glb';self.write()
  with self.assertRaisesRegex(ValueError,'Unsafe'):module.inventory(self.root)
 def test_truncated_glb_rejected(self):
  p=self.root/self.row['file_path'];p.write_bytes(p.read_bytes()[:-4])
  with self.assertRaisesRegex(ValueError,'header'):module.inventory(self.root)
 def test_local_palette_must_exist_and_is_preserved(self):
  source=module.ROOT/'assets/lowpoly_cc0/character/base';path=self.root/'person.glb';shutil.copyfile(source/'character.base.soft_adult_01.glb',path)
  with self.assertRaisesRegex(ValueError,'bundled texture'):module.inspect_glb(path)
  (self.root/'Textures').mkdir();shutil.copyfile(source/'Textures/colormap.png',self.root/'Textures/colormap.png')
  data,digest=module.inspect_glb(path);self.assertEqual(data['images'][0]['uri'],'Textures/colormap.png')
 def test_texture_dependencies_cannot_escape_or_load_remote_content(self):
  source=module.ROOT/'assets/lowpoly_cc0/character/base/character.base.soft_adult_01.glb';data=source.read_bytes();length=struct.unpack_from('<I',data,12)[0];original=json.loads(data[20:20+length]);tail=data[20+length:]
  for uri in ['../palette.png','https://example.com/palette.png','/tmp/palette.png']:
   changed=json.loads(json.dumps(original));changed['images'][0]['uri']=uri;chunk=json.dumps(changed).encode();chunk+=b' '*((-len(chunk))%4)
   path=self.root/'unsafe.glb';path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(chunk)+len(tail))+struct.pack('<II',len(chunk),0x4e4f534a)+chunk+tail)
   with self.assertRaisesRegex(ValueError,'Unsafe texture'):module.inspect_glb(path)
 def test_negative_offsets_and_references_are_rejected(self):
  original={'asset':{'version':'2.0'},'buffers':[{'byteLength':16}],'bufferViews':[{'buffer':0,'byteLength':16}], 'accessors':[{'bufferView':0,'componentType':5126,'type':'SCALAR','count':1}],'meshes':[{}],'skins':[{}],'nodes':[{'mesh':0,'skin':0}]}
  for group,key,value in [('bufferViews','byteOffset',-1),('accessors','bufferView',-1),('accessors','byteOffset',-1),('nodes','mesh',-1),('nodes','skin',-1)]:
   changed=json.loads(json.dumps(original));changed[group][0][key]=value
   chunk=json.dumps(changed).encode();chunk+=b' '*((-len(chunk))%4)
   tail=struct.pack('<II',16,0x004e4942)+bytes(16)
   path=self.root/'invalid-index.glb';path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(chunk)+len(tail))+struct.pack('<II',len(chunk),0x4e4f534a)+chunk+tail)
   with self.assertRaises(ValueError):module.inspect_glb(path)
if __name__=='__main__':unittest.main()
