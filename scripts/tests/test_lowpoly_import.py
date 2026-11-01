import csv, importlib.util, shutil, tempfile, unittest
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
if __name__=='__main__':unittest.main()
