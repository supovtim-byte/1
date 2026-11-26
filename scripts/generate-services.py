"""Render static service pages and selections from data/services.json. No browser fetch required."""
from pathlib import Path
import json,re,sys
from html import escape as esc
ROOT=Path(__file__).resolve().parents[1]
def read(p): return (ROOT/p).read_text()
def e(s): return esc(s,quote=True)
def render(template,values):
 for key,value in values.items(): template=template.replace('{{'+key+'}}',value)
 if '{{' in template: raise ValueError('Unfilled template variable')
 return template

def outputs():
 data=json.loads(read('data/services.json')); services=data['services']; by_id={s['id']:s for s in services}
 assert len(by_id)==len(services) and len({s['slug'] for s in services})==len(services)
 result={}; cards=[]
 for s in services:
  assert re.fullmatch(r'service-[a-z0-9-]+\.html',s['slug'])
  assert len({i['id'] for i in s['items']})==len(s['items'])
  assert all((ROOT/'dist/assets'/s[k]).is_file() for k in ['image','heroImage'])
  price_links=' '.join(f'<a class="text-link" href="uslugi-i-ceny.html#{e(g)}">{e(data["priceLabels"][g])}</a>' for g in s['priceGroups'])
  items='\n'.join(f'''<details name="group-services" id="{e(i['id'])}"><summary><span>{e(i['title'])}</span><span class="treatment-price-chevron" aria-hidden="true"><img src="assets/price-caries-chevron.svg" width="22" height="13" alt=""></span></summary><div class="treatment-price-body"><p>Стоимость и состав приёма уточняются после консультации.</p><a class="text-link" href="uslugi-i-ceny.html#{e(i.get('priceGroup',s['priceGroups'][0]))}">Посмотреть цены</a><a class="button service-button treatment-price-book" href="#appointment" data-book><span class="button-label">записаться</span></a></div></details>''' for i in s['items'])
  steps='\n'.join(f'<li><h3>{e(t)}</h3><p>{e(p)}</p></li>' for t,p in s['steps'])
  faq='\n'.join(f'<details name="group-faq"><summary>{e(q)}<img src="assets/faq-down.svg" alt=""></summary><p>{e(a)}</p></details>' for q,a in data['faq'])
  result['dist/'+s['slug']]=render(read('templates/service.html'),dict(TITLE=e(s['title']),DESCRIPTION=e(s['description']),HERO=e(s['heroImage']),ABOUT='\n'.join('<p>'+e(p)+'</p>' for p in [s['description']]+s['about']),ITEMS=items,PRICE_LINKS=price_links,STEPS=steps,FAQ=faq,APPOINTMENT=e(data['appointment'])))
  lis='\n'.join(f'<li><a href="{e(s["slug"])}#{e(i["id"])}">{e(i["title"])}</a></li>' for i in s['items'])
  cards.append(f'''<article class="direction-card" id="{e(s['id'])}" aria-labelledby="{e(s['id'])}-title"><a class="direction-image-link" href="{e(s['slug'])}" aria-label="Подробнее: {e(s['title'])}"><img class="direction-photo" src="assets/{e(s['image'])}" width="110" height="110" alt="" loading="lazy"></a><div class="direction-copy"><h2 id="{e(s['id'])}-title"><a href="{e(s['slug'])}">{e(s['title'])}</a></h2><p>{e(s['description'])}</p><details class="direction-details"><summary>Что входит <img class="direction-chevron" src="assets/services-direction-chevron.svg" alt=""></summary><ul>{lis}</ul></details></div></article>''')
 result['dist/uslugi.html']=render(read('templates/services-catalog.html'),dict(CATALOG='\n'.join(cards)))
 for collection,name in [('home','index.html'),('children','detyam.html')]:
  links=[]; media=[]
  for n,entry in enumerate(data[collection]):
   s=by_id[entry['service']]; title=s['title']; url=s['slug']
   if entry.get('item'):
    item=next(i for i in s['items'] if i['id']==entry['item']);title=item.get('shortTitle',item['title']);url+='#'+item['id']
   current=' is-current' if n==0 else '';key=e(entry['key']);img=e(entry['image'])
   links.append(f'<li><a class="service-option{current}" href="{e(url)}" id="service-{key}" data-service="{key}"><img class="service-card-photo" src="assets/{img}" alt="" loading="lazy"><span>{e(title)}</span><img class="service-arrow" src="assets/service-arrow.svg" alt=""></a></li>')
   media.append(f'<img class="cover{current}" data-service-image="{key}" src="assets/{img}" alt="" loading="lazy">')
  page=read('dist/'+name)
  page=re.sub(r'(<ul class="service-list"[^>]*>)[\s\S]*?</ul>',lambda m:m[1]+'\n'+'\n'.join(links)+'\n</ul>',page,count=1)
  page=re.sub(r'(<div class="service-media"[^>]*>)[\s\S]*?</div>',lambda m:m[1]+'\n'+'\n'.join(media)+'\n</div>',page,count=1)
  result['dist/'+name]=page
 return result

if __name__=='__main__':
 check='--check' in sys.argv; stale=[]
 for name,content in outputs().items():
  path=ROOT/name
  if check:
   if not path.exists() or path.read_text()!=content: stale.append(name)
  else: path.write_text(content)
 if stale: raise SystemExit('Regenerate services: '+', '.join(stale))
 print('Verified service pages and selections.' if check else 'Generated service pages and selections.')
