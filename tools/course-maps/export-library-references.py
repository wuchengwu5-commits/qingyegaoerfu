"""Export the two integrated courses' CURRENT images from the authoring database."""
from pathlib import Path
import sqlite3,json
root=Path(__file__).resolve().parents[2]
out=root/'outputs/reference-map-integration-20261105';dest=out/'source-images';dest.mkdir(parents=True,exist_ok=True)
db=sqlite3.connect((root/'course-art-library/球道图库.sqlite3').as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
items=[]
for row in db.execute('SELECT h.id,h.course_id,h.ordinal,h.label,v.id version_id,v.title,a.sha256,a.width,a.height,a.body FROM current_versions cv JOIN holes h ON h.id=cv.hole_id JOIN versions v ON v.id=cv.version_id JOIN assets a ON a.sha256=v.asset_sha WHERE h.course_id IN (?,?) ORDER BY h.course_id,h.ordinal',('cn_bg_585','cn_bg_611')):
 item=dict(row);body=item.pop('body');p=dest/(item['id']+'.png');p.write_bytes(body);item['sourceFile']=str(p.relative_to(root));items.append(item)
db.close()
if len(items)!=45:raise ValueError('Expected 18 Yintao and 27 Jiulongshan current images; inspect the library before publishing.')
(out/'source-manifest.json').write_text(json.dumps(items,ensure_ascii=False,indent=2))
print('Exported 45 current reference images. The original library versions remain unchanged.')
