import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from asset_bounds import normalized_bounds

class BoundsTests(unittest.TestCase):
 def scene(self):return {'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'translation':[2,3,4],'children':[1]},{'mesh':0,'scale':[2,1,3]}],'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}],'accessors':[{'min':[-1,-2,-1],'max':[1,2,1]}]}
 def test_nested_transforms_and_native_grounding(self):
  bounds=normalized_bounds(self.scene(),0.5,True)
  self.assertEqual(bounds['min'],[-1,0,-1.5]);self.assertEqual(bounds['max'],[1,2,1.5])
 def test_up_axis_changes_height(self):
  bounds=normalized_bounds(self.scene(),0.5,False)
  self.assertEqual(bounds['max'],[1,3,1])
 def test_missing_bounds_are_not_guessed(self):
  scene=self.scene();del scene['accessors'][0]['min']
  with self.assertRaisesRegex(ValueError,'bounds missing'):normalized_bounds(scene,1,True)
