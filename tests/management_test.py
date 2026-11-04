import base64
import copy
import hashlib
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('management',ROOT/'golf-h5/server.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.s=m.Store(self.tmp.name)
        uid=self.s.setup(dict(username='test_owner',name='测试管理员',password='Only-for-test-2026'))
        self.token,self.session=self.s.login(dict(username='test_owner',password='Only-for-test-2026'),'test')
        self.actor=self.s.session(self.token)
    def tearDown(self):self.tmp.cleanup()
    def test_seed_assets_match_all_18_source_holes(self):
        course=next(c for c in self.s.catalog() if c['id']=='cn_bg_585');hs={h['id']:h for s in course['segments'] for h in s['holes']}
        maps=self.s.maps('cn_bg_585');self.assertEqual(len(maps),20);self.assertEqual(len([i for i in maps if i['kind']=='overview']),2)
        source=json.loads((ROOT/'outputs/银涛球场地图样张_2026-10-20/地图索引.json').read_text())
        for i in maps:
            self.assertEqual(hashlib.sha256((ROOT/'golf-h5/dist'/i['url']).read_bytes()).hexdigest(),i['sha256'])
            if i['kind']=='hole':
                self.assertIn(i['holeId'],hs);h=next(h for h in source['holes'] if h['hole_id']==i['holeId']);self.assertEqual(h['par'],hs[i['holeId']]['par'])
        # Back nine first: round hole one must use source B1, never image A1.
        back=course['segments'][1]['holes'][0]['id'];self.assertTrue(next(i for i in maps if i['holeId']==back)['url'].endswith('hole-10.jpg'))
    def test_setup_is_single_use_password_is_hashed_and_bad_login_fails(self):
        with self.assertRaises(m.Problem):self.s.setup(dict(username='other',password='test-password'))
        with self.assertRaises(m.Problem):self.s.login(dict(username='test_owner',password='bad'),'test')
        with self.s.db() as db:
            self.assertNotIn('Only-for-test',db.execute('SELECT password FROM accounts').fetchone()[0])
        self.assertNotIn('password',json.dumps(self.s.accounts()))
    def test_roles_last_admin_and_password_reset_revoke_sessions(self):
        with self.assertRaises(m.Problem):self.s.save_account(self.actor,dict(name='停用',role='admin',active=False),self.actor['id'])
        uid=self.s.save_account(self.actor,dict(username='edit_test',name='编辑',role='editor',active=True,password='Editor-test-pass'))
        token,_=self.s.login(dict(username='edit_test',password='Editor-test-pass'),'test')
        editor=self.s.session(token)
        with self.assertRaises(m.Problem):self.s.save_account(editor,dict(username='bad',name='越权',role='admin',password='test-password'))
        self.s.save_account(self.actor,dict(name='编辑',role='editor',active=True,password='Reset-test-pass'),uid)
        with self.assertRaises(m.Problem):self.s.session(token)
    def test_course_create_edit_and_history_is_not_touched(self):
        old=copy.deepcopy(self.s.base);c=self.s.save_course(self.actor,dict(name='测试新球场',province='江苏省',pars=[4,4,3,5,4,4,3,5,4]))
        self.assertEqual(c['par'],36);self.assertEqual(len(c['segments'][0]['holes']),9)
        hid=c['segments'][0]['holes'][0]['id'];out=self.s.save_course(self.actor,dict(name='更名球场',province='江苏省',pars=[5,4,3,5,4,4,3,5,4]),c['id'])
        self.assertEqual(out['segments'][0]['holes'][0]['id'],hid);self.assertEqual(old,self.s.base)
        with self.assertRaises(m.Problem):self.s.save_course(self.actor,dict(name='坏Par',province='江苏省',pars=[4]*8))
        self.assertEqual(len(self.s.overlays()),1)
    def test_upload_visibility_binding_and_restart_persistence(self):
        binary=(ROOT/'golf-h5/dist/assets/maps/cn_bg_585/hole-01.jpg').read_bytes()
        c=next(c for c in self.s.base if c['id']=='cn_bg_511');hid=c['segments'][1]['holes'][0]['id']
        body=dict(courseId=c['id'],kind='hole',holeId=hid,label='测试球道图',image=base64.b64encode(binary).decode())
        item=self.s.upload(self.actor,body);self.assertEqual(self.s.maps(c['id'])[0]['holeId'],hid)
        self.assertEqual((self.s.uploads/Path(item['url']).name).read_bytes(),binary)
        self.s.visibility(self.actor,item['id'],False);self.assertEqual(self.s.maps(c['id']),[])
        self.s.visibility(self.actor,item['id'],True);again=m.Store(self.tmp.name);self.assertEqual(again.maps(c['id'])[0]['sha256'],item['sha256'])
        self.assertTrue(any(l['action']=='map.upload' for l in again.audit()))
        for bad in [dict(body,holeId='wrong-hole'),dict(body,image=base64.b64encode(b'<svg onload="alert(1)"></svg>').decode()),dict(body,sourceUrl='javascript:alert(1)')]:
            with self.assertRaises(m.Problem):self.s.upload(self.actor,bad)
        self.assertEqual(len(self.s.maps(c['id'])),1)
    def test_seed_unpublish_and_republish_keeps_original_file(self):
        item=self.s.seed[0];path=ROOT/'golf-h5/dist'/item['url'];before=path.read_bytes()
        self.s.visibility(self.actor,item['id'],False);self.assertNotIn(item['id'],[i['id'] for i in self.s.maps()])
        self.s.visibility(self.actor,item['id'],True);self.assertEqual(path.read_bytes(),before)

    def test_feedback_receipts_idempotency_privacy_reply_and_persistence(self):
        token='ab'*32;body=dict(category='体验建议',content='隔离测试：希望球场选择更顺手。',contact='测试回复渠道',receiptToken=token)
        result=self.s.submit_feedback(body,'feedback-test');again=self.s.submit_feedback(body,'feedback-test')
        self.assertEqual(result['id'],again['id']);self.assertTrue(again['duplicate']);self.assertEqual(len(self.s.feedback()),1)
        self.assertEqual(self.s.feedback_receipt(result['id'],token)['status'],'new')
        with self.assertRaises(m.Problem):self.s.feedback_receipt(result['id'],'wrong-token')
        for role in ['editor','viewer']:
            with self.assertRaises(m.Problem):self.s.reply_feedback(dict(id='test',role=role),result['id'],dict(status='replied',reply='不能越权'))
        with self.assertRaises(m.Problem):self.s.reply_feedback(self.actor,result['id'],dict(status='replied',reply=''))
        self.s.reply_feedback(self.actor,result['id'],dict(status='replied',reply='已收到，会继续优化。'))
        restored=m.Store(self.tmp.name).feedback_receipt(result['id'],token)
        self.assertEqual(restored['reply'],'已收到，会继续优化。');self.assertNotIn('token',restored)
        with self.s.db() as db:self.assertNotEqual(db.execute('SELECT token FROM feedback').fetchone()[0],token)
    def test_feedback_validation_and_rate_limit(self):
        body=dict(category='功能异常',content='这是一条隔离环境反馈。',contact='',receiptToken='cd'*32)
        for change in [dict(category='无效'),dict(content='短'),dict(content='字'*2001),dict(contact='号'*121),dict(receiptToken='guessable')]:
            with self.assertRaises(m.Problem):self.s.submit_feedback({**body,**change},'validation')
        for n in range(20):self.s.submit_feedback({**body,'receiptToken':format(n,'064x')},'rate-test')
        with self.assertRaises(m.Problem) as error:self.s.submit_feedback(body,'rate-test')
        self.assertEqual(error.exception.status,429)

class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.server=m.make_server(0,cls.tmp.name);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start();cls.port=cls.server.server_port
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join();cls.tmp.cleanup()
    def request(self,path,method='GET',body=None,headers=None):
        con=http.client.HTTPConnection('127.0.0.1',self.port);h={'Content-Type':'application/json',**(headers or {})};con.request(method,path,json.dumps(body) if body is not None else None,h);r=con.getresponse();data=r.read();result=(r.status,dict(r.getheaders()),data);con.close();return result
    def test_auth_permissions_csrf_origin_and_public_api(self):
        self.assertEqual(self.request('/api/admin/catalog')[0],401)
        self.assertEqual(self.request('/api/maps?courseId=cn_bg_585')[0],200)
        self.assertEqual(len(json.loads(self.request('/api/maps?courseId=cn_bg_585')[2])['items']),20)
        self.assertEqual(self.request('/api/auth/setup','POST',dict(username='http_owner',password='HTTP-test-password'),{'Origin':'https://attacker.example'})[0],403)
        self.assertEqual(self.request('/api/auth/setup','POST',dict(username='http_owner',name='HTTP管理员',password='HTTP-test-password'))[0],201)
        status,headers,data=self.request('/api/auth/login','POST',dict(username='http_owner',password='HTTP-test-password'));self.assertEqual(status,200)
        cookie=headers['Set-Cookie'].split(';')[0];csrf=json.loads(data)['csrf'];auth={'Cookie':cookie,'X-CSRF-Token':csrf}
        self.assertIn('HttpOnly',headers['Set-Cookie']);self.assertIn('SameSite=Strict',headers['Set-Cookie'])
        body=dict(name='API测试球场',province='浙江省',pars=[4]*9)
        self.assertEqual(self.request('/api/admin/courses','POST',body,{'Cookie':cookie})[0],403)
        self.assertEqual(self.request('/api/admin/courses','POST',body,auth)[0],201)
        self.assertEqual(len(json.loads(self.request('/api/catalog')[2])['courses']),1)
        self.assertNotIn(b'password',self.request('/api/admin/accounts',headers=auth)[2])
        for role in ['editor','viewer']:
            account=dict(username='http_'+role,name=role,role=role,password='HTTP-role-password',active=True)
            self.assertEqual(self.request('/api/admin/accounts','POST',account,auth)[0],200)
            _,h,d=self.request('/api/auth/login','POST',dict(username=account['username'],password=account['password']));ha={'Cookie':h['Set-Cookie'].split(';')[0],'X-CSRF-Token':json.loads(d)['csrf']}
            self.assertEqual(self.request('/api/admin/accounts',headers=ha)[0],403)
            self.assertEqual(self.request('/api/admin/feedback',headers=ha)[0],403)
            self.assertEqual(self.request('/api/admin/audit',headers=ha)[0],200 if role=='editor' else 403)
            self.assertEqual(self.request('/api/admin/maps',headers=ha)[0],200)
            self.assertEqual(self.request('/api/admin/courses','POST',body,ha)[0],201 if role=='editor' else 403)
        self.assertEqual(self.request('/api/auth/logout','POST',{},auth)[0],200)
        self.assertEqual(self.request('/api/admin/catalog',headers=auth)[0],401)

    def test_public_feedback_requires_own_receipt_and_blocks_cross_origin(self):
        body=dict(category='球场资料纠错',content='隔离验收：某洞码数需要核对。',contact='',receiptToken='ef'*32)
        self.assertEqual(self.request('/api/feedback','POST',body,{'Origin':'https://attacker.example'})[0],403)
        status,headers,data=self.request('/api/feedback','POST',body);self.assertEqual(status,201);fid=json.loads(data)['id']
        self.assertEqual(self.request('/api/feedback/'+fid)[0],404)
        self.assertEqual(self.request('/api/feedback/'+fid,headers={'X-Feedback-Token':body['receiptToken']})[0],200)
        self.assertEqual(self.request('/api/admin/feedback')[0],401)

if __name__=='__main__':unittest.main(verbosity=2)
