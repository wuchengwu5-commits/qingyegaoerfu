"""Collect public course facts and scorecards. Never infer missing hole data."""
import concurrent.futures as futures
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/全国球场数据_2026-10-23'
RAW = OUT / 'raw'
FIELDS = ['id','course_name','abbr','par','phone','address','display_address',
          'country','province','city','parent_id','holes','designer','build_time',
          'if_open','course_name_en','course_longitude','course_latitude','map_type']

def get(url, data=None):
    args = ['curl','-fsSL','--connect-timeout','8','--max-time','30',url]
    if data is not None:
        args += ['--data', data]
    return subprocess.check_output(args, stderr=subprocess.PIPE).decode('utf-8')

def collect(row):
    cid = row['id']
    target = RAW / (cid + '.json')
    if target.exists():
        old = json.loads(target.read_text())
        if old.get('info') and old.get('scorecardFetched'):
            return cid, 'cached'
    result = {'candidate': row, 'info': None, 'scorecards': [], 'errors': []}
    try:
        html = get('https://w.baigolf.com/course.php?act=detail&golf_course_id='+cid+'&lan=zh_cn')
        info = json.JSONDecoder().raw_decode(html.split('var courseData = ',1)[1])[0]
        result['info'] = {k:info.get(k) for k in FIELDS}
    except Exception as e:
        result['errors'].append('info: '+type(e).__name__)
    try:
        data = json.loads(get('https://www.baigolf.com/api.php?_mod=BaiGolfCourse&_cmd=getScorecards',
                             'golf_course_id='+cid+'&language=zh_cn'))
        if data.get('succeed') != 1:
            raise ValueError('scorecard response not successful')
        result['scorecards'] = data.get('data',{}).get('list',[])
        result['scorecardFetched'] = True
    except Exception as e:
        result['errors'].append('scorecard: '+type(e).__name__)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return cid, 'ok' if result['info'] else 'directory_only'

if __name__ == '__main__':
    RAW.mkdir(parents=True,exist_ok=True)
    rows = json.loads((OUT/'候选目录.json').read_text())
    existing = json.loads((ROOT/'outputs/长三角球场数据_2026-10-19/golf_yangtze_delta.json').read_text())
    old_ids = {c['course_id'].removeprefix('cn_bg_') for c in existing['courses']}
    rows = [r for r in rows if r['id'] not in old_ids]
    with futures.ThreadPoolExecutor(max_workers=4) as pool:
        for n, result in enumerate(pool.map(collect, rows), 1):
            if n % 20 == 0 or result[1] == 'directory_only' or n == len(rows):
                print(n, '/', len(rows), *result, flush=True)
