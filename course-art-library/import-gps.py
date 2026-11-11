"""Archive available course GPS data and files; preserve existing selected revisions."""
from pathlib import Path
import json
from library import Library
root=Path(__file__).resolve().parent
bundles=json.loads((root/'import-data/gps-manifests.json').read_text())
lib=Library()
try:
 report=[]
 for bundle in bundles:
  document=bundle['document'];cid=document['courseId']
  current=lib.gps(cid)['current']
  vid,created=lib.save_gps(cid,document,bundle['files'],bundle['title'],expected_current=current)
  row={'courseId':cid,'holes':len(document['holes']),'files':len(bundle['files']),'versionId':vid,'created':created}
  report.append(row);print(cid,row['holes'],'holes archived',flush=True)
 (root/'GPS入库记录.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print('SQLite integrity',lib.db.execute('PRAGMA integrity_check').fetchone()[0])
finally:lib.close()
