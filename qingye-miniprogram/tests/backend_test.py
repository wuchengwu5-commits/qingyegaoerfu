import importlib.util,tempfile,unittest
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'backend/server.py'
spec=importlib.util.spec_from_file_location('native_backend',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class CoordinateTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.s=m.Store(self.tmp.name);self.actor={'id':'isolated-unit-test','role':'admin'}
    def tearDown(self):self.tmp.cleanup()
    def test_unknown_coordinates_not_promoted(self):
        c=self.s.save_course(self.actor,{'name':'来源坐标测试','province':'上海市','latitude':31.2,'longitude':121.4})
        self.assertIsNone(c['coordinateSystem']);self.assertEqual(c['coordinateStatus'],'source_point_unverified')
    def test_verified_coordinate_needs_system_and_source(self):
        body={'name':'核验测试','province':'上海市','latitude':31.2,'longitude':121.4,'coordinateStatus':'verified'}
        with self.assertRaises(m.Problem):self.s.save_course(self.actor,body)
        body.update(coordinateSystem='gcj02',coordinateNote='隔离测试核实来源')
        c=self.s.save_course(self.actor,body);self.assertEqual(c['coordinateStatus'],'verified')
        self.assertEqual(c['coordinateSystem'],'gcj02')
    def test_out_of_range_and_half_coordinate_rejected(self):
        for lat,lng in [(None,121.4),(91,121),(31,181),(0,0),('nan',121)]:
            with self.assertRaises(m.Problem):self.s.save_course(self.actor,{'name':'错误测试','province':'上海市','latitude':lat,'longitude':lng})
    def test_coordinates_can_be_cleared_and_other_updates_keep_them(self):
        c=self.s.save_course(self.actor,{'name':'核验测试','province':'上海市','latitude':31.2,'longitude':121.4,'coordinateStatus':'verified','coordinateSystem':'gcj02','coordinateNote':'隔离核实'})
        c=self.s.save_course(self.actor,{'name':'更名'},c['id']);self.assertEqual(c['latitude'],31.2)
        c=self.s.save_course(self.actor,{'latitude':'','longitude':''},c['id']);self.assertIsNone(c['latitude'])
if __name__=='__main__':unittest.main()
