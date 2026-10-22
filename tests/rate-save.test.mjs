import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('async function verifySavedRates_'),source.indexOf('/* --------------------------- Boot'));
function fixture(options={}){
 const product={product:'Test Plywood',category:'Plywood',size:'8x4'};
 const fields={dealerSelect:'Test Dealer',wefInput:'2026-10-22',applyTerm:'all',termSelect:'15',applyGst:'all',gstGlobal:'Paid',applyFreight:'all',freightGlobal:'Extra',applyCd:'all',cdGlobal:'',applyGola:'all',golaGlobal:'',rate_0:'125',brand_0:'Test Brand'};
 const elements=Object.fromEntries(Object.entries(fields).map(([id,value])=>[id,{value}]));
 elements.ratesTable={dataset:{products:JSON.stringify([product])}};
 elements.saveRatesBtn={};elements.saveMsg={textContent:''};
 const cell={rate:125,term:15,brand:'Test Brand',gstType:'Paid',freight:'Extra',cdValue:'',golaAddPrice:''};
 const recorded={ok:true,products:[product],wefDates:['2026-10-22'],rates:{'2026-10-22':{'Test Plywood||Plywood||8x4':{...cell,...options.cell}}}};
 const calls=[],toasts=[],renders=[];
 let reads=0;
 const context=vm.createContext({API_URL:'https://test.invalid/exec',URL,Date,Number,Object,JSON,String,Error,Promise,console,
  document:{getElementById:id=>elements[id]??null},$:selector=>elements[selector.slice(1)],
  parseNumberInput:value=>value===''?null:Number(value),setLoading:(button,loading)=>button.disabled=loading,
  showToast:(...args)=>toasts.push(args),renderRatesView:d=>renders.push(d),loadDealerRates:()=>{},__lastData:null,
  setTimeout:resolve=>{resolve();return 1;},
  safeFetch:async(url,init={})=>{calls.push({url,init});if(init.method==='POST'){if(options.postFailure)throw Error('Network failure');return {type:'opaque'};}
   reads++;if(options.readFailure)throw Error('Network failure');
   return {ok:true,json:async()=>options.delayFirstRead&&reads===1?{ok:true,rates:{}}:recorded};
  }
 });
 vm.runInContext(helper,context);
 return {context,elements,calls,toasts,renders,get reads(){return reads;}};
}
test('opaque POST alone cannot report a verified save',async()=>{
 const f=fixture({cell:{rate:100}});await vm.runInContext('submitNewRates()',f.context);
 assert(!f.toasts.some(([text])=>text.includes('saved')));assert.match(f.elements.saveMsg.textContent,/WEF already/);
 assert.equal(f.elements.rate_0.value,'125');assert.equal(f.renders.length,0);assert.equal(f.elements.saveRatesBtn.disabled,false);
});
test('matching saved rate and terms are verified and rendered from the read response',async()=>{
 const f=fixture();await vm.runInContext('submitNewRates()',f.context);
 assert(f.toasts.some(([text])=>text==='Rates saved and verified'));assert.equal(f.renders.length,1);assert.equal(f.reads,1);
 assert.equal(f.calls[0].init.headers['Content-Type'],'text/plain;charset=UTF-8');assert.equal(f.calls[1].init.cache,'no-store');
});
test('unchanged rate with incorrect terms is also rejected',async()=>{
 const f=fixture({cell:{freight:'Included'}});await vm.runInContext('submitNewRates()',f.context);
 assert.match(f.elements.saveMsg.textContent,/unchanged/);assert.equal(f.renders.length,0);
});
test('temporary read lag is retried without posting twice',async()=>{
 const f=fixture({delayFirstRead:true});await vm.runInContext('submitNewRates()',f.context);
 assert.equal(f.calls.filter(c=>c.init.method==='POST').length,1);assert.equal(f.reads,2);assert.equal(f.renders.length,1);
});
test('read failure preserves entered values and never reports success',async()=>{
 const f=fixture({readFailure:true});await vm.runInContext('submitNewRates()',f.context);
 assert(!f.toasts.some(([text])=>text.includes('saved')));assert.equal(f.elements.rate_0.value,'125');assert.equal(f.renders.length,0);
});
test('post failure restores save control and preserves entries',async()=>{
 const f=fixture({postFailure:true});await vm.runInContext('submitNewRates()',f.context);
 assert.equal(f.elements.saveRatesBtn.disabled,false);assert.equal(f.elements.rate_0.value,'125');assert.equal(f.reads,0);
});
test('zero rates unsupported by the server are rejected before posting',async()=>{
 const f=fixture();f.elements.rate_0.value='0';await vm.runInContext('submitNewRates()',f.context);
 assert.equal(f.calls.length,0);assert(f.toasts.some(([text])=>text.includes('greater than zero')));
});
test('switching dealers while saving cannot replace another dealer display',async()=>{
 const f=fixture();vm.runInContext("safeFetch = ((fetch) => async (...args) => { const result=await fetch(...args); document.getElementById('dealerSelect').value='Another Dealer'; return result; })(safeFetch)",f.context);
 await vm.runInContext('submitNewRates()',f.context);assert.equal(f.renders.length,0);
});
test('entry and viewer load their shared API configuration before their page scripts',()=>{
 for(const [page,script] of [['index.html','app.js'],['viewRate.html','viewRates.base.js']]){
  const html=fs.readFileSync(new URL('../'+page,import.meta.url),'utf8');assert(html.indexOf('src="rate-api.js')<html.indexOf('src="'+script));
 }
 const viewer=fs.readFileSync(new URL('../viewRates.base.js',import.meta.url),'utf8');
 assert.match(viewer,/const API_URL = window.RATE_API_URL/);assert.match(source,/const API_URL = window.RATE_API_URL/);
});