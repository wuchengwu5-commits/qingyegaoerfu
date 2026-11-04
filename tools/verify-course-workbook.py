"""Read-only comparison of the supplied workbook with the imported public catalog."""
from pathlib import Path
import json, zipfile, xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent.parent
folder=root/'outputs/长三角球场数据_2026-10-19'
data=json.loads((folder/'golf_yangtze_delta.json').read_text())
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(folder/'长三角高尔夫球场数据.xlsx') as z:
    shared=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        shared=[''.join(x.itertext()) for x in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    def rows(n):
        result=[]
        for row in ET.fromstring(z.read(f'xl/worksheets/sheet{n}.xml')).findall('.//s:row',ns):
            cells={}
            for c in row.findall('s:c',ns):
                col=''.join(x for x in c.attrib['r'] if x.isalpha()); t=c.attrib.get('t'); v=c.find('s:v',ns)
                cells[col]=shared[int(v.text)] if t=='s' else ''.join(c.find('s:is',ns).itertext()) if t=='inlineStr' else v.text if v is not None else ''
            result.append(cells)
        return result[1:]
    courses,holes,distances=rows(1),rows(2),rows(3)
    cm={c['course_id']:c for c in data['courses']};hm={h['hole_id']:h for h in data['holes']};dm={(x['hole_id'],x['tee_id']):x for x in data['tee_holes']}
    assert len(courses)==len(cm)==65
    assert len(holes)==len(hm)==1287
    assert len(distances)==len(dm)==5400
    checks=0
    for row in courses:
        c=cm[row['A']]
        for col,key in [('B','name'),('C','province'),('D','city'),('E','district'),('G','scorecard_holes'),('I','scorecard_par_sum'),('K','address'),('L','phone')]:
            assert row.get(col,'')==str(c[key] or ''),(c['course_id'],key)
            checks+=1
    for row in holes:
        h=hm[row['G']]
        for col,key in [('C','source_hole_label'),('D','par'),('E','stroke_index'),('H','section_id'),('I','course_id'),('J','ordinal_in_section')]:
            assert row.get(col,'')==str(h[key] if h[key] is not None else ''),(h['hole_id'],key)
            checks+=1
    for row in distances:
        assert float(row['E'])==dm[(row['F'],row['G'])]['distance']
        checks+=1
report={'workbook':'长三角高尔夫球场数据.xlsx','courses':len(courses),'holes':len(holes),'teeHoleDistances':len(distances),'comparedValues':checks,'result':'passed'}
(root/'deliverables/球场数据导入核对.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
