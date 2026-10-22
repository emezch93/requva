import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {mount,res,tick,read,user,FRONT} from './helpers.mjs';

/* ---------- growth dashboard rendering ---------- */
const growthFull={days:30,product:{name:'A',listing_status:'approved',hold_reason:''},discovery:{listing_views:12,outbound_clicks:3,by_source:[]},acquisition:{configured:true,visits:40,signups:0,activations:2,retention:1},testing:{campaigns_created:1,opted_in:5,started:3,feedback_submitted:2},feedback:{general_in_period:4,general_answered:1,structured_in_period:2},distribution:{by_status:{reported_completed:1,verified_completed:2}}};
const textOf=n=>n.textContent.replace(/\s+/g,' ');
async function growthPage(api){const m=mount('dashboard.html',{url:'https://requva.pages.dev/dashboard.html',fetch:api,scripts:['session.js','growth.js']});return m}
test('growth: acquisition renders real numbers, never object strings, and zero stays zero',async()=>{
 const {w,d}=await growthPage(async()=>res({}));
 const nodes=w.RequvaGrowth.render(growthFull);const host=d.createElement('div');host.append(...nodes);
 const txt=textOf(host);assert.ok(!/\[object/.test(txt),'no [object ...] text');
 assert.ok(/Acquisition and usage/.test(txt));assert.ok(/Visits\s*40|40\s*Visits/.test(txt)||txt.includes('40'));
 const acq=[...host.querySelectorAll('section')].find(s=>/Acquisition and usage/.test(s.textContent));
 const cards=[...acq.querySelectorAll('.metric')].map(c=>[c.querySelector('span').textContent,c.querySelector('strong').textContent]);
 assert.deepEqual(cards,[['Visits','40'],['Signups','0'],['Activations','2'],['Retention events','1']],'configured with no signups shows 0');
 assert.equal(acq.querySelectorAll('.metric').length,4,'layout keeps four metric cards');
});
test('growth: unconfigured, missing and partial data degrade honestly',async()=>{
 const {w,d}=await growthPage(async()=>res({}));
 const html=d=>{const h=d.ownerDocument?d:null;return h};
 const show=data=>{const host=d.createElement('div');host.append(...w.RequvaGrowth.render(data));return textOf(host)};
 let t=show({...growthFull,acquisition:{configured:false,message:'Signup tracking not configured'}});
 assert.ok(t.includes('External acquisition tracking is not configured.'));assert.ok(!/Signups\s*0/.test(t),'no fake zero when unconfigured');
 t=show({...growthFull,acquisition:null});assert.ok(t.includes('Unavailable'));
 t=show({...growthFull,acquisition:{configured:true,visits:null,signups:undefined}});assert.ok(t.includes('—'),'null and missing show an em dash, not 0 or undefined');assert.ok(!/undefined|NaN|null/.test(t));
 for(const bad of [{},null,undefined,{discovery:null,testing:null,feedback:null,distribution:null,product:null}]){t=show(bad);assert.ok(!/\[object|undefined|NaN/.test(t),'partial payload '+JSON.stringify(bad))}
});
test('growth: before login hidden, after login shown, switching products never shows stale metrics',async()=>{
 let loggedIn=false;const pending={};
 const api=async(p,q)=>{
  if(p==='/auth/me')return res({user:loggedIn?user:null});
  if(p==='/discover/categories')return res({categories:[]});
  if(p==='/feedback/general/mine')return res({feedback:[]});
  if(p==='/products')return res({products:[{id:'p1',name:'One'},{id:'p2',name:'Two'}]});
  const m=p.match(/^\/products\/(\w+)\/growth$/);if(m){const views=m[1]==='p1'?11:22;const body={...growthFull,discovery:{listing_views:views,outbound_clicks:0}};
   if(m[1]==='p1'&&pending.slowP1)return new Promise(r=>{pending.release=()=>r(res(body))});return res(body)}
  if(/general-feedback$/.test(p))return res({feedback:[]});
  return res({})};
 const {w,d}=await growthPage(api);
 await w.RequvaGrowth.init();assert.equal(d.querySelector('#growth-panel').hidden,true,'hidden when logged out');
 loggedIn=true;pending.slowP1=false;await w.RequvaGrowth.init();await tick();assert.equal(d.querySelector('#growth-panel').hidden,false);
 const val=()=>[...d.querySelectorAll('#growth-body .metric')].find(c=>c.querySelector('span').textContent==='Listing views')?.querySelector('strong').textContent;
 assert.equal(val(),'11');
 const sel=d.querySelector('#growth-product');sel.value='p2';sel.dispatchEvent(new w.Event('change'));await tick();assert.equal(val(),'22');
 pending.slowP1=true;sel.value='p1';sel.dispatchEvent(new w.Event('change'));await tick();
 sel.value='p2';pending.slowP1=false;sel.dispatchEvent(new w.Event('change'));await tick();pending.release();await tick();
 assert.equal(val(),'22','slow response for the previous product is ignored');assert.equal(d.querySelector('#growth-body').dataset.product,'p2');
});

/* ---------- discovery filters, URL state ---------- */
const catalog=[
 {id:'p000001',name:'Ledger Pro',description:'Invoices for freelancers',pricing_model:'paid',stage:'launched',category_slug:'business-finance',seeking:['testers'],testing_request_id:'t1'},
 {id:'p000002',name:'Pixel Pal',description:'Mockups',pricing_model:'free',stage:'idea',category_slug:'design-creative',seeking:['feedback']},
 {id:'p000003',name:'Study Buddy',description:'Flashcards',pricing_model:'free',stage:'launched',category_slug:'education-learning',seeking:['users','testers']}];
function discoveryApi(opts={}){return async(p,q)=>{
 if(p==='/auth/me')return res({user:null});
 if(p==='/discover/categories')return res({categories:[{slug:'business-finance',name:'Business and Finance',product_count:1},{slug:'design-creative',name:'Design',product_count:1},{slug:'education-learning',name:'Education',product_count:1}]});
 if(p==='/discover/products'){if(opts.fail)return res({error:'Server exploded'},500);
  for(const [k,v] of [['pricing',['free','paid']],['stage',['idea','launched']]]){const x=q.get(k);if(x&&!v.includes(x))return res({error:'Unknown '+k+' filter.'},400)}
  const term=(q.get('q')||'').toLowerCase();let list=catalog.filter(c=>(!term||(c.name+' '+c.description).toLowerCase().includes(term))&&(!q.get('category')||c.category_slug===q.get('category'))&&(!q.get('pricing')||c.pricing_model===q.get('pricing'))&&(!q.get('stage')||c.stage===q.get('stage'))&&(!q.get('seeking')||c.seeking.includes(q.get('seeking')))&&(q.get('testing')!=='1'||c.testing_request_id));
  return res({products:list.map(c=>({...c,visit_url:'/api/v1/go/'+c.id})),total:list.length,page:1,page_size:24,ranking:'r'})}
 return res({})}}
const names=d=>[...d.querySelectorAll('#dir-grid .dir-card h3')].map(h=>h.textContent);
const setf=(w,d,n,v)=>{const f=d.querySelector('#dir-form').elements[n];if(f.type==='checkbox')f.checked=v;else f.value=v;f.dispatchEvent(new w.Event('change',{bubbles:true}))};
test('filters: individual, combined, clear, counts and URL state',async()=>{
 const {w,d,calls}=mount('discover.html',{url:'https://requva.pages.dev/discover',fetch:discoveryApi(),scripts:['session.js','share.js','directory.js']});await tick(40);
 assert.deepEqual(names(d),['Ledger Pro','Pixel Pal','Study Buddy']);assert.match(d.querySelector('#dir-status').textContent,/^3 products/);assert.equal(d.querySelector('#dir-clear').hidden,true);
 setf(w,d,'pricing','free');await tick(40);assert.deepEqual(names(d),['Pixel Pal','Study Buddy']);assert.equal(w.location.search,'?pricing=free');
 setf(w,d,'stage','launched');await tick(40);assert.deepEqual(names(d),['Study Buddy']);assert.match(d.querySelector('#dir-status').textContent,/^1 product$/);
 assert.equal(calls.at(-1).query.get('pricing'),'free');assert.equal(calls.at(-1).query.get('stage'),'launched');assert.equal(d.querySelector('#dir-clear').hidden,false);
 setf(w,d,'pricing','paid');setf(w,d,'stage','idea');await tick(40);assert.equal(names(d).length,0);assert.match(d.querySelector('#dir-status').textContent,/No products match these filters/);
 d.querySelector('#dir-clear').click();await tick(40);assert.deepEqual(names(d),['Ledger Pro','Pixel Pal','Study Buddy']);assert.equal(w.location.search,'');assert.equal(d.querySelector('#dir-form').elements.pricing.value,'');
 setf(w,d,'seeking','testers');await tick(40);assert.deepEqual(names(d),['Ledger Pro','Study Buddy']);
 setf(w,d,'seeking','');setf(w,d,'testing',true);await tick(40);assert.deepEqual(names(d),['Ledger Pro']);
});
test('filters: search is debounced, case insensitive and combines with other filters',async()=>{
 const {w,d,calls}=mount('discover.html',{url:'https://requva.pages.dev/discover',fetch:discoveryApi(),scripts:['session.js','share.js','directory.js']});await tick(40);
 const f=d.querySelector('#dir-form').elements,before=calls.length;f.q.value='LED';f.q.dispatchEvent(new w.Event('input'));f.q.value='LEDGER';f.q.dispatchEvent(new w.Event('input'));await tick(450);
 assert.equal(calls.length,before+1,'rapid typing produces one request');assert.deepEqual(names(d),['Ledger Pro']);assert.equal(w.location.search,'?q=LEDGER');
 setf(w,d,'pricing','free');await tick(40);assert.equal(names(d).length,0,'search plus filter combine');
});
test('filters: URL restores state, bad values are ignored safely, back button works',async()=>{
 const {w,d,calls}=mount('discover.html',{url:'https://requva.pages.dev/discover?pricing=free&stage=launched&category=bogus&sort=weird',fetch:discoveryApi(),scripts:['session.js','share.js','directory.js']});await tick(60);
 const f=d.querySelector('#dir-form').elements;assert.equal(f.pricing.value,'free');assert.equal(f.stage.value,'launched');assert.equal(f.category.value,'');assert.equal(f.sort.value,'relevance');
 assert.match(d.querySelector('#dir-note').textContent,/not recognised/);assert.deepEqual(names(d),['Study Buddy']);assert.equal(calls.filter(c=>c.path==='/discover/products').at(-1).query.get('category'),null,'unknown category never sent');
 setf(w,d,'pricing','');await tick(40);assert.equal(w.location.search,'?stage=launched');
 w.history.back();await tick(60);assert.equal(f.pricing.value,'free','popstate restores filters');
});
test('filters: loading, error, empty and no match states are distinct; failed request never shows all products',async()=>{
 let m=mount('discover.html',{url:'https://requva.pages.dev/discover',fetch:discoveryApi({fail:true}),scripts:['session.js','share.js','directory.js']});await tick(40);
 assert.equal(names(m.d).length,0);assert.match(m.d.querySelector('#dir-error').textContent,/Server exploded/);assert.ok(m.d.querySelector('#dir-error [role=alert]'));
 const empty=async(p,q)=>p==='/discover/products'?res({products:[],total:0,page:1,page_size:24}):discoveryApi()(p,q);
 m=mount('discover.html',{url:'https://requva.pages.dev/discover',fetch:empty,scripts:['session.js','share.js','directory.js']});await tick(40);assert.match(m.d.querySelector('#dir-status').textContent,/No products have been published yet/);
 m=mount('discover.html',{url:'https://requva.pages.dev/discover?q=zzz',fetch:empty,scripts:['session.js','share.js','directory.js']});await tick(40);assert.match(m.d.querySelector('#dir-status').textContent,/No products match/);
});

/* ---------- sharing ---------- */
test('share: canonical URL, link builders, validation',async()=>{
 const {w}=mount('discover.html',{fetch:discoveryApi(),scripts:['session.js','share.js']});const S=w.RequvaShare;
 assert.equal(S.urlFor('p000001'),'https://requva.pages.dev/p/p000001');assert.throws(()=>S.urlFor('../etc'));assert.throws(()=>S.urlFor(''));
 const l=S.links({id:'p000001',name:'Tom & Jerry <App>',description:'Does "things" & more'});
 assert.ok(l.whatsapp.startsWith('https://wa.me/?text='));assert.ok(l.x.startsWith('https://x.com/intent/post?'));assert.ok(l.linkedin.includes(encodeURIComponent(l.url)));assert.ok(l.facebook.includes(encodeURIComponent(l.url)));assert.ok(l.email.startsWith('mailto:?subject='));assert.ok(l.gmail.startsWith('https://mail.google.com/mail/?view=cm'));
 for(const k of ['whatsapp','email','gmail','x','linkedin','facebook']){assert.ok(!/[<>"\s]/.test(l[k]),k+' is fully encoded');assert.ok(decodeURIComponent(l[k]).includes(l.url),k+' carries the canonical url')}
 assert.ok(decodeURIComponent(l.whatsapp).includes('Tom & Jerry <App>'),'text round trips');
});
test('share: dialog, copy success and failure, native share only when supported, no duplicate listeners',async()=>{
 let written=[];const {w,d}=mount('discover.html',{fetch:discoveryApi(),scripts:['session.js','share.js'],pre:w=>{Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async t=>{written.push(t)}},configurable:true})}});
 const p={id:'p000001',name:'Ledger Pro',description:'Invoices'};w.RequvaShare.open(p);w.RequvaShare.open(p);
 assert.equal(d.querySelectorAll('#share-dialog').length,1,'one dialog only');assert.equal(d.querySelector('#share-native'),null,'no native button when unsupported');
 assert.equal(d.querySelector('#share-whatsapp').getAttribute('rel'),'noopener noreferrer');assert.equal(d.querySelector('#share-copy').getAttribute('type'),'button');
 d.querySelector('#share-copy').click();await tick();assert.deepEqual(written,['https://requva.pages.dev/p/p000001'],'copied once, not twice');assert.equal(d.querySelector('#share-status').textContent,'Link copied.');
 const f=mount('discover.html',{fetch:discoveryApi(),scripts:['session.js','share.js'],pre:w=>{Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied')}},configurable:true});w.document.execCommand=()=>false}});
 f.w.RequvaShare.open(p);f.d.querySelector('#share-copy').click();await tick();const msg=f.d.querySelector('#share-status').textContent;assert.ok(!/Link copied/.test(msg)&&/blocked/.test(msg),'honest failure message');
 const n=mount('discover.html',{fetch:discoveryApi(),scripts:['session.js','share.js'],pre:w=>{w.navigator.share=async()=>{}}});n.w.RequvaShare.open(p);assert.ok(n.d.querySelector('#share-native'));
});

/* ---------- notifications UI ---------- */
test('notifications: bell for signed in users, unread count, read on click, safe links, mark all',async()=>{
 const items=[{id:'n1',type:'feedback_new',title:'New feedback',body:'Nice',link:'/dashboard.html?product=p1#general-feedback-inbox',read_at:null,created_at:new Date().toISOString()},{id:'n2',type:'x',title:'Evil',body:'',link:'//evil.example/phish',read_at:null,created_at:new Date().toISOString()}];
 let unread=2;const api=async(p,q,o)=>{if(p==='/auth/me')return res({user});if(p==='/notifications/read-all'){unread=0;items.forEach(i=>i.read_at='x');return res({ok:true})}if(/^\/notifications\/\w+\/read$/.test(p)){unread--;return res({ok:true})}if(p==='/notifications')return res({notifications:q.get('limit')==='1'?[]:items,unread_count:unread,next_before:null});return res({})};
 const {w,d,calls}=mount('dashboard.html',{fetch:api,scripts:['session.js','notifications.js']});w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await tick(300);
 const btn=d.querySelector('#notif-toggle');assert.ok(btn);assert.equal(d.querySelector('.notif-count').textContent,'2');
 btn.click();await tick(40);const links=[...d.querySelectorAll('.notif-item')];assert.equal(links.length,2);assert.equal(links[0].getAttribute('href'),'/dashboard.html?product=p1#general-feedback-inbox');assert.equal(links[1].getAttribute('href'),'/dashboard.html','protocol relative links are rejected');
 links[0].dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));await tick(40);assert.ok(calls.some(c=>c.path==='/notifications/n1/read'&&c.method==='POST'));
 [...d.querySelectorAll('.notif-head button')].find(b=>/Mark all/.test(b.textContent)).click();await tick(60);assert.equal(d.querySelector('.notif-count').hidden,true);
 w.document.dispatchEvent(new w.CustomEvent('requva:auth',{detail:null}));assert.equal(d.querySelector('#notif-toggle'),null,'bell removed on logout');
});
test('notifications: no bell when logged out; errors shown calmly',async()=>{
 const {w,d}=mount('dashboard.html',{fetch:async(p)=>p==='/auth/me'?res({user:null}):res({}),scripts:['session.js','notifications.js']});w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await tick(300);assert.equal(d.querySelector('#notif-toggle'),null);
 const e=mount('dashboard.html',{fetch:async(p)=>p==='/auth/me'?res({user}):p==='/notifications'?res({error:'x'},500):res({}),scripts:['session.js','notifications.js']});e.w.document.dispatchEvent(new e.w.Event('DOMContentLoaded'));await tick(300);e.d.querySelector('#notif-toggle').click();await tick(60);assert.match(e.d.querySelector('.notif-status').textContent,/Could not load/);
});

/* ---------- product page, leaving page, logout wiring ---------- */
const prod={id:'p000001',name:'Ledger <b>Pro</b>',description:'Invoices',pricing_model:'paid',stage:'launched',seeking:[],website_host:'ledger.example',visit_url:'/api/v1/go/p000001',testing:{instructions:'Do it',effort_minutes:10}};
const prodApi=async(p,q,o)=>p==='/auth/me'?res({user:null}):p==='/discover/products/p000001'?res({product:prod}):p.startsWith('/discover/products/')?res({error:'nf'},404):res({ok:true});
test('product page: opens by /p/<id> and ?id=, shows actions, escapes text, handles invalid and missing',async()=>{
 let m=mount('product.html',{url:'https://requva.pages.dev/p/p000001',fetch:prodApi,scripts:['session.js','share.js','directory.js']});await tick(60);
 assert.equal(m.d.querySelector('h1').textContent,'Ledger <b>Pro</b>');assert.equal(m.d.querySelector('h1 b'),null);assert.ok(m.d.querySelector('#detail-share'));assert.ok([...m.d.querySelectorAll('a')].some(a=>/Test this product/.test(a.textContent)));
 m=mount('product.html',{url:'https://requva.pages.dev/product.html?id=p000001',fetch:prodApi,scripts:['session.js','share.js','directory.js']});await tick(60);assert.equal(m.d.querySelector('h1').textContent,'Ledger <b>Pro</b>');
 m=mount('product.html',{url:'https://requva.pages.dev/p/..%2F..%2Fetc',fetch:prodApi,scripts:['session.js','share.js','directory.js']});await tick(40);assert.match(m.d.querySelector('[role=alert]').textContent,/not valid/);
 m=mount('product.html',{url:'https://requva.pages.dev/p/zzzzzzzz',fetch:prodApi,scripts:['session.js','share.js','directory.js']});await tick(60);assert.match(m.d.querySelector('[role=alert]').textContent,/not available/);
});
test('product page: feedback form handles guest, capability and success; no double submit',async()=>{
 let posts=0;const api=async(p,q,o)=>{if(p==='/auth/me')return res({user:null});if(p==='/discover/products/p000001')return res({product:prod});if(p.endsWith('/feedback')){posts++;return posts===1?res({error:'Sign in to continue.'},401):res({feedback:{id:'f'}},201)}return res({})};
 const m=mount('product.html',{url:'https://requva.pages.dev/p/p000001',fetch:api,scripts:['session.js','share.js','directory.js']});await tick(60);
 const form=m.d.querySelector('#fb-body').closest('form');m.d.querySelector('#fb-body').value='Great product';form.dispatchEvent(new m.w.Event('submit',{cancelable:true}));await tick(40);assert.match(form.parentElement.textContent,/Log in to leave feedback/);
 form.dispatchEvent(new m.w.Event('submit',{cancelable:true}));await tick(40);assert.match(form.parentElement.textContent,/Thank you/);assert.equal(m.d.querySelector('#fb-body').value,'','form cleared only after success');
});
test('discover and product pages: log out works without app.js',async()=>{
 let out=false;const m=mount('discover.html',{url:'https://requva.pages.dev/discover',fetch:async(p,q,o)=>{if(p==='/auth/me')return res({user});if(p==='/auth/logout'){out=true;return res({ok:true})}return discoveryApi()(p,q,o)},scripts:['session.js','share.js','directory.js']});
 m.w.document.dispatchEvent(new m.w.Event('DOMContentLoaded'));await tick(60);assert.equal(m.d.querySelector('#logout-nav').hidden,false,'nav shows logged in state');
 m.d.querySelector('#logout-nav').click();await tick(40);assert.ok(out);
});

/* ---------- legacy embedded discovery in the workspace ---------- */
test('workspace discovery list uses the same server side filters as the directory',async()=>{
 const api=async(p,q,o)=>{if(p==='/auth/me')return res({user:null});if(p==='/discover/categories')return res({categories:[{slug:'design-creative',name:'Design'}]});if(p==='/discover/products'){const t=q.get('testing')==='1',term=(q.get('q')||'').toLowerCase();const list=catalog.filter(c=>(!term||c.name.toLowerCase().includes(term))&&(!t||c.testing_request_id)&&(!q.get('category')||c.category_slug===q.get('category')));return res({products:list.map(c=>({...c,visit_url:'/api/v1/go/'+c.id})),total:list.length,page:1,page_size:24})}return res({products:[],campaigns:[],requests:[],activities:[],opportunities:[]})};
 const m=mount('dashboard.html',{url:'https://requva.pages.dev/dashboard.html',fetch:api,scripts:['session.js','share.js','app.js']});await tick(200);
 const cards=()=>[...m.d.querySelectorAll('#discover-list .discover-card')].map(c=>c.querySelector('b').textContent);
 assert.deepEqual(cards(),['Ledger Pro','Pixel Pal','Study Buddy']);assert.ok(m.d.querySelector('#discover-list [data-share]'),'share button replaces the broken share link');assert.equal(m.d.querySelector('#discover-list a[href*="product="]'),null);
 const s=m.d.querySelector('#directory-search');s.value='pixel';s.dispatchEvent(new m.w.Event('input'));await tick(450);assert.deepEqual(cards(),['Pixel Pal']);assert.equal(m.calls.filter(c=>c.path==='/discover/products').at(-1).query.get('q'),'pixel');
 s.value='';const cb=m.d.querySelector('#directory-testing');cb.checked=true;cb.dispatchEvent(new m.w.Event('change'));await tick(60);assert.deepEqual(cards(),['Ledger Pro']);
 assert.match(m.d.querySelector('#directory-status').textContent,/1 product/);
 assert.equal(m.d.querySelector('#metric-visits'),null,'cross product visits card removed');
});

/* ---------- static page quality ---------- */
const pages=fs.readdirSync(FRONT).filter(f=>f.endsWith('.html'));
test('every page has title, description and either canonical or noindex; no inline script or style (CSP)',()=>{
 for(const f of pages){const h=read(f);assert.match(h,/<title>[^<]{5,}<\/title>/,f+' title');assert.match(h,/<meta name="description" content="[^"]{10,}"/,f+' description');assert.ok(/rel="canonical"/.test(h)||/name="robots" content="noindex/.test(h),f+' canonical or noindex');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[^<]/.test(h),f+' inline script');assert.ok(!/\sstyle="/.test(h),f+' inline style attribute');assert.ok(!/\son\w+="/.test(h),f+' inline handler')}
});
test('internal links and assets resolve; in page anchors exist',()=>{
 const ok=p=>{p=p.split('#')[0].split('?')[0];if(p==='/'||p==='')return true;if(p.startsWith('/p/')||p.startsWith('/api/'))return true;const clean=p.replace(/^\//,'');return fs.existsSync(new URL(clean,FRONT))||fs.existsSync(new URL(clean+'.html',FRONT))};
 for(const f of pages){const h=read(f);for(const m of h.matchAll(/(?:href|src)="(\/[^"]*)"/g))assert.ok(ok(m[1]),f+' broken '+m[1]);
  for(const m of h.matchAll(/href="#([\w-]+)"/g))assert.ok(new RegExp('id="'+m[1]+'"').test(h),f+' anchor #'+m[1])}
});
test('robots, sitemap and redirects exist and agree',()=>{
 assert.match(read('robots.txt'),/Sitemap: https:\/\/requva\.pages\.dev\/sitemap\.xml/);assert.match(read('_redirects'),/\/p\/\*\s+\/product\.html\s+200/);
 const sm=read('sitemap.xml');for(const u of ['/','/discover','/privacy','/terms'])assert.ok(sm.includes('https://requva.pages.dev'+u+'<'),u);
});
