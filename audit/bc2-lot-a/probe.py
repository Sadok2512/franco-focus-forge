import os,json,httpx,datetime
c=httpx.Client(base_url='http://localhost:8000',timeout=180)
r=c.post('/auth/login',json={'email':'admin@bc4.local','password':os.environ['BC4_ADMIN_PASSWORD']});r.raise_for_status();c.headers['Authorization']='Bearer '+r.json()['token']
base='/projects/134af70a06eb/dict/v2/'
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'headers':{'Authorization':'Bearer <session admin@bc4.local>','Accept':'application/json'},'responses':[]}
raw=c.get(base+'tree?view=raw').json()
keys=[]
for t in raw['tree']:
 for o in t['origins']:
  for m in o['messages']:
   for g in m['groups']:
    for k in g['kpis']:
     if 'phich-Duration' in k['param_key'] or k['n']==1515 or ('[' in k['param_key'] and len(keys)<8):keys.append(k['param_key'])
for mode in ['operator','band','operator_band']:
 r=c.get(base+'distribution',params={'keys':','.join(dict.fromkeys(keys)),'group_by':mode});r.raise_for_status()
 out['responses'].append({'url':str(r.url),'status':r.status_code,'body':r.json()})
print(json.dumps(out))
