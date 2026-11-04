"""Merge collected public China facts with the previously checked Yangtze dataset."""
import collections
import copy
import datetime
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/全国球场数据_2026-10-23'
DATE='2026-10-23'
REGIONS=['北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省','吉林省','黑龙江省','上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','广西壮族自治区','海南省','重庆市','四川省','贵州省','云南省','西藏自治区','陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区','台湾省','香港特别行政区','澳门特别行政区']
REGION_NAMES=dict(zip(['北京','天津','河北','山西','内蒙古','辽宁','吉林','黑龙江','上海','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','重庆','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆','中国台湾','香港','澳门'],REGIONS))

def integer(v):
    return int(str(v)) if re.fullmatch(r'\d+',str(v or '').strip()) else None

def source(sid,title,url,kind='secondary_public_page'):
    return dict(source_id=sid,publisher='百高 BaiGolf',title=title,url=url,source_type=kind,retrieved_on=DATE,effective_on=None,note='公开来源记录；现行版本及营业情况需向球会核实。')

def main():
    data=json.loads((ROOT/'outputs/长三角球场数据_2026-10-19/golf_yangtze_delta.json').read_text())
    data=copy.deepcopy(data)
    old_ids={c['course_id'] for c in data['courses']}
    data['sources'].append(source('bg_national_index_20261023','百高全国球场公开索引','https://www.baigolf.com/sitemap.php?lan=zh_cn'))
    region_data=json.loads((OUT/'raw/regions.json').read_text())
    city_names={r['region_id']:r['region_name'] for group in region_data['area_list'].values() for r in group}
    data['sources'].append(source('bg_national_regions','百高公开城市索引（球场页面搜索数据）','https://www.baigolf.com/course.php?id=511&lan=zh_cn'))
    def issue(cid,field,code,detail,action='以球会现行记分卡核对补全。',sid=None):
        data['issues'].append(dict(issue_id='national_issue_'+str(len(data['issues'])+1),course_id=cid,field=field,code=code,detail=detail,action=action,source_id=sid or cid.replace('cn_bg_','bg_')+'_card'))
    for candidate in json.loads((OUT/'候选目录.json').read_text()):
        raw_id=candidate['id'];cid='cn_bg_'+raw_id
        if cid in old_ids:continue
        file=OUT/'raw'/f'{raw_id}.json'
        raw=json.loads(file.read_text()) if file.exists() else {'info':None,'scorecards':[],'errors':['not collected']}
        info=raw.get('info') or {};name=info.get('course_name') or candidate['name']
        province=REGION_NAMES[candidate['region']]
        address=info.get('display_address') or info.get('address') or None
        if address:
            explicit=next((p for p in REGIONS if address.startswith(p)),None)
            if explicit:province=explicit
        city=province if province in ['北京市','天津市','上海市','重庆市'] else None
        if address and not city:
            match=re.search(r'([^省区县市\d\s，,]{2,8}市)',address)
            if match:city=match.group(1)
        city_source=None
        if not city and info.get('city') in city_names:
            city=city_names[info['city']];city_source='bg_national_regions'
        # No city is guessed from a club's marketing name.
        sid='bg_'+raw_id+'_info';card_sid='bg_'+raw_id+'_card'
        data['sources'].extend([source(sid,name+'：基础资料','https://w.baigolf.com/course.php?act=detail&golf_course_id='+raw_id+'&lan=zh_cn'),source(card_sid,name+'：公开记分卡',candidate['url'],'secondary_public_scorecard')])
        course=dict(course_id=cid,facility_id='facility_'+raw_id,name=name,name_en=info.get('course_name_en') or None,aliases=list(dict.fromkeys(x for x in [info.get('abbr'),candidate['name']] if x and x!=name)),province=province,city=city,district=None,address=address,address_raw=info.get('address') or None,phone=info.get('phone') or None,longitude=None,latitude=None,coordinate_system=None,coordinate_status='not_collected',reported_holes=integer(info.get('holes')),reported_par=integer(info.get('par')),scorecard_holes=0,scorecard_par_sum=None,designer=info.get('designer') or None,opened_on_raw=info.get('build_time') or None,operation_status='closed_reported' if re.search('关闭|已关停|已停业',name) else 'unknown',data_status='public_source_unconfirmed' if info else 'directory_only',listing_flag_raw=info.get('if_open'),official_website=None,scorecard_effective_on=None,source_id=sid,location_source_id=sid,scorecard_source_id=card_sid,retrieved_on=DATE,published_si_count=0,full_course_si_permutation=False,verified_handicap_ready=False,gross_scoring_data_present=False)
        data['facilities'].append(dict(facility_id=course['facility_id'],name=name,province=province,city=city,grouping_basis='独立来源条目；未确认同俱乐部其他分场的主体关系。'))
        if city_source:course['city_source_id']=city_source
        data['courses'].append(course)
        tee_names={};course_holes=[]
        for i,block in enumerate(raw.get('scorecards') or [],1):
            rows=block.get('scorecard') or []
            by_name={str(r.get('name','')).strip().lower():r for r in rows}
            pars=by_name.get('par',{}).get('values',[])[:9]
            labels=by_name.get('hole',{}).get('values',[])[:9]
            if len(pars)!=9 or len(labels)!=9 or any(integer(p) not in [3,4,5,6] for p in pars):
                issue(cid,'scorecard','invalid_section','公开分区 '+str(block.get('name',i))+' 缺少完整9洞有效Par，未作为可选洞段导入。');continue
            declared=by_name['par'].get('values',[])[9:]
            if declared and integer(declared[0]) is not None and integer(declared[0])!=sum(map(int,pars)):
                issue(cid,'par','section_par_mismatch',str(block.get('name',i))+' 的来源合计与逐洞Par不符；显示按逐洞求和。')
            section_id=cid+'_s'+str(i)
            try:created=datetime.datetime.fromtimestamp(int(block['created_at']),datetime.timezone.utc).isoformat()
            except (ValueError,KeyError,TypeError,OverflowError):created=None
            data['sections'].append(dict(section_id=section_id,course_id=cid,name=str(block.get('name') or '分区 '+str(i)),display_order=i,hole_count=9,par_sum=sum(map(int,pars)),source_created_at_utc=created,effective_on=None,source_id=card_sid))
            hdcp=next((by_name[n].get('values',[]) for n in ['hdcp','hcp','handicap','si'] if n in by_name),[])
            for j in range(9):
                h_id=section_id+'_h'+str(j+1).zfill(2);si=integer(hdcp[j]) if len(hdcp)>j else None
                if si is not None and not 1<=si<=18:si=None
                h=dict(hole_id=h_id,section_id=section_id,course_id=cid,ordinal_in_section=j+1,source_hole_label=str(labels[j]),par=int(pars[j]),stroke_index=si,stroke_index_status='published_unconfirmed' if si else 'missing',stroke_index_source_id=card_sid if si else None,source_id=card_sid)
                data['holes'].append(h);course_holes.append(h)
            for row in rows:
                tee_name=str(row.get('name','')).strip();key=tee_name.lower()
                if key in ['hole','par','n/d','hdcp','hcp','handicap','si','distance'] or not tee_name:continue
                values=row.get('values',[])[:9]
                if not any(integer(v) is not None and integer(v)>0 for v in values):continue
                if block.get('unit') not in ['Y','YD','M']:issue(cid,'distance','unknown_distance_unit','发球台 '+tee_name+' 距离单位不明，未导入距离。');continue
                if key not in tee_names:
                    tee_id=cid+'_tee_'+str(len(tee_names)+1);tee_names[key]=tee_id
                    data['tees'].append(dict(tee_id=tee_id,course_id=cid,name=tee_name,color=key if key in ['black','blue','white','red','gold','yellow','green','silver','orange'] else None,rating_gender=None,course_rating=None,slope_rating=None,rating_status='missing_verified_scope',source_id=card_sid))
                for j,v in enumerate(values):
                    distance=integer(v)
                    if distance is None or distance<=0:continue
                    if not 30<=distance<=1000:
                        issue(cid,'distance','implausible_distance',f'{block.get("name",i)} 第{labels[j]}洞 {tee_name} 来源距离为{distance}，超出合理范围，当前距离留空。','向球会核对；保留原始来源，不猜测修正数值。');continue
                    h_id=section_id+'_h'+str(j+1).zfill(2);unit='metre' if block.get('unit')=='M' else 'yard'
                    data['tee_holes'].append(dict(tee_hole_id=h_id+'__'+tee_names[key],tee_id=tee_names[key],hole_id=h_id,section_id=section_id,course_id=cid,distance=round(distance/.9144) if unit=='metre' else distance,distance_unit='yard',source_distance=distance,source_distance_unit=unit,source_id=card_sid))
        course.update(scorecard_holes=len(course_holes),scorecard_par_sum=sum(h['par'] for h in course_holes) if course_holes else None,gross_scoring_data_present=bool(course_holes),published_si_count=sum(h['stroke_index'] is not None for h in course_holes))
        sis=[h['stroke_index'] for h in course_holes]
        course['full_course_si_permutation']=len(sis)==18 and set(sis)==set(range(1,19))
        if len(sis)==18 and all(x is not None for x in sis) and not course['full_course_si_permutation']:
            for h in course_holes:h['stroke_index_status']='invalid_18_hole_sequence'
            issue(cid,'stroke_index','invalid_stroke_index','18洞SI重复或不是1–18完整排列；禁止自动让杆。')
        if not course_holes:issue(cid,'scorecard','missing_scorecard','仅有球场基础资料，未取得可用的逐洞Par；不能据总Par编造记分卡。')
        if course_holes and course['reported_holes'] and course['reported_holes']!=len(course_holes):issue(cid,'holes','reported_scorecard_mismatch',f"简介标注{course['reported_holes']}洞，已取得逐洞Par共{len(course_holes)}洞；仅开放实际取得的洞段。")
        if course['reported_par'] and course['scorecard_par_sum'] and course['reported_par']!=course['scorecard_par_sum']:issue(cid,'par','reported_scorecard_par_mismatch','简介总Par与全部已取得洞段Par合计不同，不能直接当作一轮18洞Par。')
        if course_holes and course['published_si_count']<len(course_holes):issue(cid,'stroke_index','missing_stroke_index',f"{len(course_holes)-course['published_si_count']}洞未公开SI。",'不得根据距离或Par推算SI；可显式设置逐洞让杆。')
        if raw.get('errors'):issue(cid,'source','fetch_incomplete','部分公开资料未成功读取：'+', '.join(raw['errors']),sid=sid)
    counts=collections.Counter(c['province'] for c in data['courses'])
    data['metadata']=dict(schema_version='1.1.0',dataset_id='china_golf_20261023',retrieved_on=DATE,region=REGIONS,scope='全国公开目录收录的球场/具名分场，含港澳台；不是全部在营球场的认证名录。',counts={k:len(v) for k,v in data.items() if isinstance(v,list)},courses_by_province=dict(counts),regions_with_records=len(counts),null_policy='null表示未知，不用0代替。',operating_status_verified=False,notes=['原长三角65条保留2026-10-19版本及人工校对，不被新采集覆盖。','仅实际完整的9洞Par导入为可选洞段；缺失记分卡不能自动补洞。','来源标注关闭的记录单独标识；其他记录营业状态未知。','分场条目不能当作独立俱乐部数量。','公开数据尚未确认现行有效日期及正式评级；CR/SR保持空。','米单位距离统一换算为码并取整，同时保留原数值与单位。'])
    (OUT/'golf_china.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
    print(json.dumps(data['metadata'],ensure_ascii=False,indent=2))

if __name__=='__main__':main()
