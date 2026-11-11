import unittest,tempfile,hashlib,sqlite3,struct,zlib,json,io,zipfile
from pathlib import Path
from library import Library
def png(rgb):
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0'+bytes(rgb)+b'\xff'))+chunk(b'IEND',b'')
class ArchiveTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.lib=Library(self.root/'test.sqlite3')
  self.lib.catalog({'courses':[{'id':'c','name':'测试球场','segments':[{'id':'s','name':'A','holes':[{'id':'h1','label':'1','par':4},{'id':'h2','label':'2','par':3}]}]}]})
 def tearDown(self):self.lib.close();self.tmp.cleanup()
 def add(self,h='h1',color=(0,120,50)):
  return self.lib.version(h,png(color),'test.png','测试版',metadata={'test':True})[0]
 def test_restore_and_reimport_preserve_selected_version(self):
  a=self.add();b=self.add(color=(20,80,30));self.assertEqual(self.lib.hole('h1')['current'],b)
  self.lib.select('h1',a);vid,created=self.lib.version('h1',png((20,80,30)),'copy.png','重复导入')
  self.assertFalse(created);self.assertEqual(vid,b);self.assertEqual(self.lib.hole('h1')['current'],a);self.assertEqual(len(self.lib.hole('h1')['versions']),2)
 def test_wrong_hole_selection_rejected_at_api_and_database(self):
  a=self.add()
  with self.assertRaises(ValueError):self.lib.select('h2',a)
  with self.assertRaises(sqlite3.IntegrityError):
   with self.lib.db:self.lib.db.execute('INSERT INTO current_versions VALUES(?,?)',('h2',a))
 def test_reference_bytes_survive_original_deletion_and_backup(self):
  original=self.root/'layout.json';data=b'{"layout":"record"}';original.write_bytes(data)
  rid=self.lib.reference('c','h1',original,'gps');original.unlink();backup=self.lib.backup(self.root/'backup.sqlite3')
  b=Library(backup)
  try:
   row=b.db.execute('SELECT a.body,a.sha256 FROM assets a JOIN reference_files r ON r.asset_sha=a.sha256 WHERE r.id=?',(rid,)).fetchone();self.assertEqual(row[0],data);self.assertEqual(row[1],hashlib.sha256(data).hexdigest());self.assertEqual(b.db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
  finally:b.close()
 def test_cross_hole_reference_rejected_and_transaction_rolled_back(self):
  p=self.root/'r.json';p.write_text('{}');r=self.lib.reference('c','h1',p,'gps')
  with self.assertRaises(ValueError):self.lib.version('h2',png((1,2,3)),'a.png','bad',references=[r])
  self.assertEqual(len(self.lib.hole('h2')['versions']),0)
 def test_damaged_png_rejected(self):
  with self.assertRaises(ValueError):self.lib.version('h1',png((1,2,3))[:-5],'bad.png','bad')
  self.assertEqual(self.lib.db.execute('SELECT count(*) FROM versions').fetchone()[0],0)
 def test_review_appends_without_changing_original_record(self):
  a=self.add();self.lib.review(a,'已复核',{'ok':True});self.lib.review(a,'已复核',{'ok':True})
  self.assertEqual(self.lib.hole('h1')['versions'][0]['metadata']['reviewStatus'],'已复核');self.assertEqual(self.lib.db.execute('SELECT count(*) FROM reviews').fetchone()[0],1)
  self.assertNotIn('reviewStatus',json.loads(self.lib.db.execute('SELECT metadata FROM versions WHERE id=?',(a,)).fetchone()[0]))

class GpsArchiveTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.lib=Library(self.root/'gps.sqlite3')
  self.lib.catalog({'courses':[{'id':'c','name':'测试球场','segments':[{'id':'s','name':'A','holes':[{'id':'h1','label':'1','par':4}]}]},{'id':'d','name':'其他球场','segments':[{'id':'s2','name':'A','holes':[{'id':'h2','label':'1','par':3}]}]}]})
  self.document={'courseId':'c','kind':'gps','holes':[{'_id':'h1','tee':[121,31],'target':[121.001,31.001],'green':[121.002,31.002],'greenOutline':[[121.0019,31.0019],[121.0021,31.0019],[121.0021,31.0021]],'route':[[121,31],[121.002,31.002]]}]}
  self.file=self.root/'map.jpg';self.file.write_bytes(b'\xff\xd8test')
 def tearDown(self):self.lib.close();self.tmp.cleanup()
 def save(self,document=None):return self.lib.save_gps('c',document or self.document,{'images/map.jpg':self.file},'GPS 测试')[0]
 def test_duplicate_import_preserves_restored_selection(self):
  first=self.save();changed=json.loads(json.dumps(self.document));changed['holes'][0]['tee']=[121.0001,31];second=self.save(changed)
  self.lib.select_gps('c',first,second);vid,created=self.lib.save_gps('c',changed,{'images/map.jpg':self.file},'重复导入')
  self.assertFalse(created);self.assertEqual(vid,second);self.assertEqual(self.lib.gps('c')['current'],first)
 def test_conflicts_and_cross_course_selection_are_rejected(self):
  first=self.save()
  with self.assertRaises(ValueError):self.lib.select_gps('d',first,None)
  with self.assertRaises(ValueError):self.lib.save_gps('c',{**self.document,'revision':'new'},{},'冲突',expected_current='old')
  self.assertEqual(len(self.lib.gps('c')['versions']),1)
 def test_export_survives_original_deletion_and_backs_up(self):
  vid=self.save();self.file.unlink();archive=self.lib.export_gps('c')
  with zipfile.ZipFile(io.BytesIO(archive)) as z:
   self.assertEqual(z.read('images/map.jpg'),b'\xff\xd8test');self.assertEqual(json.loads(z.read('gps-document.json')),self.document)
  backup=self.lib.backup(self.root/'copy.sqlite3');other=Library(backup)
  try:
   self.assertEqual(other.gps('c')['current'],vid)
   with zipfile.ZipFile(io.BytesIO(other.export_gps('c'))) as z:self.assertEqual(z.read('images/map.jpg'),b'\xff\xd8test')
  finally:other.close()
 def test_invalid_paths_and_hole_ids_do_not_leave_partial_versions(self):
  with self.assertRaises(ValueError):self.lib.save_gps('c',self.document,{'../map.jpg':self.file},'错误')
  bad=json.loads(json.dumps(self.document));bad['holes'][0]['_id']='h2'
  with self.assertRaises(ValueError):self.lib.save_gps('c',bad,{},'错误')
  self.assertEqual(self.lib.gps('c')['versions'],[])

if __name__=='__main__':unittest.main(verbosity=2)
