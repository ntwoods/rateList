import json
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
product={'product':'Test Plywood','category':'Plywood','size':'8x4','active':True}
cell={'rate':100,'term':15,'brand':'','gstType':'Paid','freight':'Extra','cdValue':'','golaAddPrice':''}
rates={'2026-10-22':{'Test Plywood||Plywood||8x4':dict(cell)}}
accept=[False]
posts=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch()
 page=browser.new_page(viewport={'width':1280,'height':900})
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def serve(route):
  u=urlsplit(route.request.url)
  if u.hostname=='rate.test':
   file=root/(u.path.lstrip('/') or 'index.html')
   route.fulfill(path=str(file));return
  if u.hostname=='script.google.com':
   query=parse_qs(u.query)
   if route.request.method=='POST':
    payload=json.loads(route.request.post_data)['payload'];posts.append(payload)
    if accept[0]:
     for item in payload['items']:
      rates.setdefault(payload['wefDate'],{})['||'.join(item[k] for k in ['product','category','size'])]={**cell,'rate':item['rate']}
    response={'ok':True,'inserted':len(payload['items']) if accept[0] else 0}
   elif query.get('action')==['getInitialData']:
    response={'ok':True,'dealers':['Test Dealer'],'categories':['Plywood']}
   else: response={'ok':True,'products':[product],'wefDates':list(rates),'rates':rates}
   route.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(response));return
  route.fulfill(status=204)
 page.route('**/*',serve)
 page.goto('http://rate.test/index.html')
 page.locator('#dealerSelect').fill('Test Dealer')
 page.locator('#getDataBtn').click()
 page.locator('#rate_0').fill('125')
 page.locator('#wefInput').fill('2026-10-22')
 page.locator('#saveRatesBtn').click()
 page.wait_for_function("document.querySelector('#saveMsg').textContent.includes('WEF already')")
 assert page.locator('#rate_0').input_value()=='125'
 assert len(posts)==1
 print('PASS rejected same-WEF save shows explanation and keeps user entries')
 accept[0]=True
 page.locator('#wefInput').fill('2026-10-23')
 page.locator('#saveRatesBtn').click()
 page.wait_for_function("document.querySelector('#saveMsg').textContent.includes('verified for 2026-10-23')")
 assert len(posts)==2
 assert rates['2026-10-23']['Test Plywood||Plywood||8x4']['rate']==125
 assert not errors,errors
 print('PASS new-WEF save is verified against read-back and rendered without page errors')
 browser.close()
