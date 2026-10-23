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

/* ================= messaging, terms, support, share tracking ================= */
const iso=(h=0)=>new Date(Date.now()-h*3600e3).toISOString();
const person=(name,role,location='')=>({name,role,location});
function threadApi(state){return async(p,q,o,c)=>{
 const method=o?.method||'GET';
 if(p==='/auth/me')return res({user:state.user===undefined?user:state.user});
 if(p==='/notifications')return res({notifications:[],unread_count:0,next_before:null});
 if(p==='/threads')return res({threads:state.threads.filter(t=>q.get('filter')!=='unread'||t.unread>0),unread_total:state.threads.reduce((n,t)=>n+t.unread,0)});
 const t=p.match(/^\/threads\/(voluntary|test)\/([\w-]+)$/);if(t&&method==='GET'){if(state.missing)return res({error:'Conversation not found.'},404);return res(state.thread)}
 if(/\/read$/.test(p)){state.read=(state.read||0)+1;return res({ok:true})}
 if(/\/messages$/.test(p)&&method==='POST'){if(state.replyError)return res({error:state.replyError},429);state.sent=JSON.parse(o.body).body;return res({message:{id:'m9'}},201)}
 if((/^\/messages\//.test(p)||t)&&(method==='PATCH'||method==='DELETE')){state.mutations=(state.mutations||[]);state.mutations.push({method,p,body:o.body?JSON.parse(o.body):null});if(state.mutateError)return res({error:state.mutateError},409);return res({ok:true})}
 return res({})}}
const baseThread=()=>({thread:{type:'voluntary',id:'f1',product:{id:'p1',name:'ChatApp'},kind:'general',status:'visible',viewer_role:'sender',can_reply:true,edit_window_hours:24},unread_count:1,messages:[
 {id:'f1',is_root:true,body:'Pricing page is confusing',deleted:false,created_at:iso(30),edited_at:iso(29),author:person('Uche User','Product user','Accra, Ghana'),mine:true,unread:false,seen:true,can_edit:false,can_delete:true},
 {id:'m1',is_root:false,body:'Thanks <b>we will fix it</b>',deleted:false,created_at:iso(2),edited_at:null,author:person('Founder Fay','Founder','Lagos, Nigeria'),mine:false,unread:true,seen:false,can_edit:false,can_delete:false},
 {id:'m2',is_root:false,body:'Great, thank you',deleted:false,created_at:iso(1),edited_at:null,author:person('Uche User','Product user','Accra, Ghana'),mine:true,unread:false,seen:false,can_edit:true,can_delete:true},
 {id:'m3',is_root:false,body:null,deleted:true,created_at:iso(1),edited_at:null,author:person('Founder Fay','Founder'),mine:false,unread:false,seen:false,can_edit:false,can_delete:false}]});
const listItem=(over={})=>({type:'voluntary',id:'f1',product:{id:'p1',name:'ChatApp'},status:'visible',viewer_role:'sender',counterpart:person('Founder Fay','Founder','Lagos, Nigeria'),preview:'Thanks we will fix it',last_activity:iso(2),reply_count:2,unread:1,...over});
async function messagesPage(state,url='https://requva.pages.dev/dashboard.html'){const m=mount('dashboard.html',{url,fetch:threadApi(state),scripts:['session.js','messages.js']});await m.w.RequvaMessages.init();await tick(40);return m}
test('messages: list shows counterpart name, role, location, product, preview, unread; filter and empty states',async()=>{
 const state={threads:[listItem(),listItem({id:'f2',unread:0,counterpart:person('Ada','Tester','Abuja')})],thread:baseThread()};
 const {w,d,calls}=await messagesPage(state);
 const items=[...d.querySelectorAll('#msg-list .msg-item')];assert.equal(items.length,2);assert.equal(d.querySelector('#messages-panel').hidden,false);
 assert.match(items[0].textContent,/Founder Fay/);assert.match(items[0].textContent,/Founder/);assert.match(items[0].textContent,/Lagos, Nigeria/);assert.match(items[0].textContent,/ChatApp/);assert.match(items[0].textContent,/2 replies/);assert.ok(items[0].classList.contains('unread'));assert.ok(!items[1].classList.contains('unread'));
 assert.equal(d.querySelector('#msg-unread-count').textContent,'1');assert.equal(d.querySelector('#msg-unread-count').hidden,false);
 d.querySelector('[data-filter=unread]').click();await tick(40);assert.equal(d.querySelectorAll('#msg-list .msg-item').length,1);assert.equal(calls.filter(c=>c.path==='/threads').at(-1).query.get('filter'),'unread');
 state.threads=[];d.querySelector('[data-filter=unread]').click();await tick(40);assert.match(d.querySelector('#msg-list-status').textContent,/No unread messages/);
 d.querySelector('[data-filter=all]').click();await tick(40);assert.match(d.querySelector('#msg-list-status').textContent,/No conversations yet/);
});
test('messages: thread shows names, roles, locations, date and time, edited, new, seen, deleted; text is escaped; marks read',async()=>{
 const state={threads:[listItem()],thread:baseThread()};const {w,d,calls}=await messagesPage(state);
 d.querySelector('#msg-list .msg-item').click();await tick(80);
 const msgs=[...d.querySelectorAll('#msg-thread .msg')];assert.equal(msgs.length,4);
 assert.match(msgs[0].querySelector('.msg-head').textContent,/Uche User.*Product user.*Accra, Ghana/s);assert.match(msgs[1].querySelector('.msg-head').textContent,/Founder Fay.*Founder.*Lagos, Nigeria/s);
 assert.ok(msgs[0].querySelector('time').getAttribute('datetime')&&msgs[0].querySelector('time').textContent.length>6,'shows a date and time');
 assert.match(msgs[0].textContent,/edited/);assert.match(msgs[0].textContent,/Seen/,'own message shows seen');assert.match(msgs[2].textContent,/Sent/,'own unseen message shows sent');
 assert.ok(msgs[1].classList.contains('unread'));assert.match(msgs[1].textContent,/New/);assert.equal(msgs[1].querySelector('.msg-body').textContent,'Thanks <b>we will fix it</b>');assert.equal(msgs[1].querySelector('b'),null,'message HTML is escaped');
 assert.match(msgs[3].textContent,/This message was deleted/);assert.equal(msgs[3].querySelector('[class*=msg-actions]'),null);
 const label=m=>[...m.querySelectorAll('.msg-actions button')].map(b=>b.textContent);
 assert.deepEqual(label(msgs[0]),['Delete'],'root can be deleted, edit window closed');assert.deepEqual(label(msgs[1]),[],'cannot edit or delete the other person\'s message');assert.deepEqual(label(msgs[2]),['Edit','Delete']);
 assert.equal(state.read,1,'opening marks the conversation read');assert.ok(d.querySelector('#msg-layout').classList.contains('showing-thread'));
 d.querySelector('.msg-back').click();assert.ok(!d.querySelector('#msg-layout').classList.contains('showing-thread'));
});
test('messages: reply, edit, delete call the right endpoints and show server errors',async()=>{
 const state={threads:[listItem()],thread:baseThread()};const {w,d,calls}=await messagesPage(state);
 d.querySelector('#msg-list .msg-item').click();await tick(80);
 const ta=d.querySelector('#msg-reply-body');ta.value='Thanks again';ta.closest('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick(80);assert.equal(state.sent,'Thanks again');
 state.replyError='Too many messages. Try again later.';d.querySelector('#msg-reply-body').value='x';d.querySelector('#msg-reply-body').closest('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick(60);assert.match(d.querySelector('.msg-reply .form-error').textContent,/Too many messages/);
 const mine=[...d.querySelectorAll('#msg-thread .msg')][2];[...mine.querySelectorAll('.msg-actions button')].find(b=>b.textContent==='Edit').click();
 const edit=d.querySelector('.msg-edit textarea');assert.equal(edit.value,'Great, thank you');edit.value='Great, thanks a lot';[...d.querySelectorAll('.msg-edit button')].find(b=>b.textContent==='Save').click();await tick(80);
 assert.deepEqual(state.mutations.at(-1),{method:'PATCH',p:'/messages/m2',body:{body:'Great, thanks a lot'}});
 const root=d.querySelectorAll('#msg-thread .msg')[0];[...root.querySelectorAll('.msg-actions button')].find(b=>b.textContent==='Delete').click();await tick(80);assert.deepEqual(state.mutations.at(-1),{method:'DELETE',p:'/threads/voluntary/f1',body:null},'root uses the thread endpoint');
 w.confirm=()=>false;const before=state.mutations.length;[...d.querySelectorAll('#msg-thread .msg')][2].querySelectorAll('.msg-actions button')[1].click();await tick(40);assert.equal(state.mutations.length,before,'declining the confirmation deletes nothing');
 state.mutateError='Messages can only be edited within 24 hours of sending.';w.confirm=()=>true;[...d.querySelectorAll('#msg-thread .msg')][2].querySelector('.msg-actions button').click();[...d.querySelectorAll('.msg-edit button')].find(b=>b.textContent==='Save').click();await tick(80);assert.match(d.querySelector('.msg-edit .form-error').textContent,/24 hours/);
});
test('messages: deep link opens the conversation, missing conversation and closed thread handled, hidden when logged out',async()=>{
 let state={threads:[listItem()],thread:baseThread()};let m=await messagesPage(state,'https://requva.pages.dev/dashboard.html?thread=voluntary:f1');assert.equal(m.d.querySelectorAll('#msg-thread .msg').length,4,'deep link opened the thread');
 state={threads:[listItem()],thread:baseThread(),missing:true};m=await messagesPage(state,'https://requva.pages.dev/dashboard.html?thread=voluntary:gone');assert.match(m.d.querySelector('#msg-thread [role=alert]').textContent,/no longer available/);
 const closed=baseThread();closed.thread.can_reply=false;state={threads:[listItem()],thread:closed};m=await messagesPage(state,'https://requva.pages.dev/dashboard.html?thread=voluntary:f1');assert.equal(m.d.querySelector('#msg-reply-body'),null);assert.match(m.d.querySelector('#msg-thread').textContent,/closed/);
 state={user:null,threads:[],thread:baseThread()};m=await messagesPage(state);assert.equal(m.d.querySelector('#messages-panel').hidden,true);
 state={threads:[listItem()],thread:baseThread(),replyError:null};m=await messagesPage(state,'https://requva.pages.dev/dashboard.html?thread=../../x');assert.match(m.d.querySelector('#msg-thread').textContent,/Select a conversation/,'invalid deep link ignored');
});

/* ---------- terms and registration form ---------- */
test('registration form: capability boxes are optional, terms box is required, name and location are optional, and the right data is sent',async()=>{
 const m=mount('index.html',{url:'https://requva.pages.dev/',fetch:async(p,q,o)=>p==='/auth/me'?res({user:null}):p==='/auth/register'?res({user:{...user,terms:{required:false}},session_token:'tok'},201):res({products:[],campaigns:[]}),scripts:['session.js','app.js']});await tick(80);
 const {d,w}=m;d.querySelector('[data-mode=register]').click();
 const f=d.querySelector('#auth-form').elements;
 const req=n=>[...d.querySelectorAll('#auth-form [name='+n+']')].map(x=>x.required);
 assert.deepEqual(req('capabilities'),[false,false,false],'founder, product user and tester boxes must not be required');assert.deepEqual(req('accept_terms'),[true]);assert.deepEqual(req('display_name'),[false]);assert.deepEqual(req('location'),[false]);assert.deepEqual(req('recovery_answer'),[true]);assert.deepEqual(req('email'),[true]);
 assert.ok(d.querySelector('#auth-form a[href="/terms.html"][target=_blank]'),'terms link opens in a new tab');assert.ok(d.querySelector('#auth-form a[href="/privacy.html"]'));
 f.email.value='new@example.com';f.password.value='long-password-1234';f.recovery_question.value='school';f.recovery_answer.value='my private answer here';f.display_name.value='Ada';f.location.value='Lagos';f.accept_terms.checked=true;
 d.querySelector('#auth-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick(120);
 const sent=JSON.parse(m.calls.find(c=>c.path==='/auth/register').body);assert.equal(sent.accept_terms,true);assert.equal(sent.display_name,'Ada');assert.equal(sent.location,'Lagos');assert.deepEqual(sent.capabilities,['product_user'],'only the default box is ticked, and nothing else is forced');
 d.querySelector('[data-mode=login]').click();assert.deepEqual(req('accept_terms'),[false]);assert.equal(d.querySelector('#auth-form [name=display_name]').disabled,true,'register only fields are disabled when logging in');
});
const termsUser=(required,accepted)=>({...user,terms:{current:'2026-10-22',accepted_version:accepted,accepted_at:accepted?iso(5):null,required}});
test('terms page: opens, shows version, lets a logged in user read first then accept; acceptance is posted once',async()=>{
 const posts=[];let required=true;
 const api=async(p,q,o)=>{if(p==='/auth/me')return res({user:termsUser(required,required?null:'2026-10-22')});if(p==='/auth/terms/accept'){posts.push(JSON.parse(o.body));required=false;return res({ok:true})}return res({})};
 const m=mount('terms.html',{url:'https://requva.pages.dev/terms.html',fetch:api,scripts:['session.js','terms.js']});m.w.document.dispatchEvent(new m.w.Event('DOMContentLoaded'));await tick(250);
 const {d,w}=m;assert.match(d.querySelector('#terms-version').textContent,/2026-10-22/);assert.equal(d.querySelector('#terms-dialog'),null,'no blocking dialog on the page you need to read');
 assert.ok(d.querySelector('#terms-status #terms-accept-box'));d.querySelector('#terms-accept-btn').click();await tick(40);assert.equal(posts.length,0,'must tick first');assert.match(d.querySelector('#terms-status .form-error').textContent,/Tick the box/);
 d.querySelector('#terms-accept-box').checked=true;d.querySelector('#terms-accept-btn').click();d.querySelector('#terms-accept-btn')?.click();await tick(150);
 assert.deepEqual(posts,[{version:'2026-10-22',accepted:true}]);assert.match(d.querySelector('#terms-status').textContent,/You accepted version 2026-10-22/);
});
test('terms: other pages show a blocking dialog until accepted; guests see a calm note; TERMS_REQUIRED reopens it',async()=>{
 let required=true;const api=async(p,q,o)=>p==='/auth/me'?res({user:termsUser(required,null)}):p==='/auth/terms/accept'?(required=false,res({ok:true})):res({categories:[],products:[],total:0,page:1,page_size:24});
 const m=mount('discover.html',{url:'https://requva.pages.dev/discover',fetch:api,scripts:['session.js','share.js','terms.js','directory.js']});m.w.document.dispatchEvent(new m.w.Event('DOMContentLoaded'));await tick(250);
 const dlg=m.d.querySelector('#terms-dialog');assert.ok(dlg);assert.ok(dlg.querySelector('a[href="/terms.html"][target=_blank]'));
 dlg.querySelector('#terms-accept-box').checked=true;dlg.querySelector('#terms-accept-btn').click();await tick(200);assert.equal(m.d.querySelector('#terms-dialog'),null);
 required=true;m.w.document.dispatchEvent(new m.w.CustomEvent('requva:terms-required'));await tick(120);assert.ok(m.d.querySelector('#terms-dialog'),'server refusal reopens the dialog');
 const g=mount('terms.html',{url:'https://requva.pages.dev/terms.html',fetch:async p=>p==='/auth/me'?res({user:null}):res({}),scripts:['session.js','terms.js']});g.w.document.dispatchEvent(new g.w.Event('DOMContentLoaded'));await tick(200);assert.match(g.d.querySelector('#terms-status').textContent,/Log in or create an account/);
});
test('terms version in the page matches the version the server enforces',()=>{
 const worker=fs.readFileSync(new URL('../worker/src/index.js',import.meta.url),'utf8'),v=worker.match(/TERMS_VERSION='([\d-]+)'/)[1];
 assert.match(read('terms.html'),new RegExp('data-version="'+v+'"'));assert.match(read('terms.html'),new RegExp('Version '+v));
});

/* ---------- support email ---------- */
const EMAIL='support.requva@gmail.com';
test('support email: used everywhere, links are valid, and no page claims emails are sent',()=>{
 assert.match(read('config.js'),new RegExp("contactEmail: '"+EMAIL.replace(/\./g,'\\.')+"'"));
 for(const f of pages){const h=read(f);assert.ok(h.includes('href="/contact.html"'),f+' footer support link');
  for(const m of h.matchAll(/mailto:([^"?]+)(\?[^"]*)?"/g)){assert.equal(m[1],EMAIL,f+' only the support address is used');if(m[2])assert.ok(!/\s/.test(m[2]),f+' mailto query is encoded')}
  const emails=[...h.replace(/<script.*?<\/script>/gs,'').matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)].map(x=>x[0]);for(const e of emails)assert.equal(e,EMAIL,f+' stray address '+e)}
 const contact=read('contact.html');assert.ok(contact.includes('mailto:'+EMAIL));assert.match(contact,/does not send automatic emails/);
 for(const f of pages){const text=read(f).replace(/<[^>]+>/g,' ');assert.ok(!/we will email you|we have emailed|check your inbox|confirmation email|sent you an email/i.test(text),f+' must not claim emails are sent')}
 for(const f of ['app.js','directory.js','growth.js','messages.js','share.js','terms.js','notifications.js'])assert.ok(!/@gmail|@yahoo|@outlook/.test(read(f)),f+' no hard coded personal address');
});
test('sitemap lists the contact page',()=>{assert.ok(read('sitemap.xml').includes('https://requva.pages.dev/contact<'));assert.match(fs.readFileSync(new URL('../functions/sitemap.xml.js',import.meta.url),'utf8'),/'\/contact'/)});

/* ---------- share tracking (browser side) ---------- */
const shareCalls=c=>c.filter(x=>x.path.startsWith('/discover/share/')).map(x=>({path:x.path,...JSON.parse(x.body)}));
test('share tracking: each option records once with its method and source; copy only on success; native only when it completes',async()=>{
 const api=async()=>res({ok:true,counted:true},201);const p={id:'p000001',name:'Ledger',description:'Invoices'};
 let m=mount('discover.html',{fetch:api,scripts:['session.js','share.js'],pre:w=>{Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true})}});
 m.w.RequvaShare.open(p,{source:'directory'});for(const id of ['share-whatsapp','share-whatsapp','share-email','share-gmail','share-x','share-linkedin','share-facebook'])m.d.querySelector('#'+id).dispatchEvent(new m.w.MouseEvent('click',{bubbles:true,cancelable:true}));
 m.d.querySelector('#share-copy').click();m.d.querySelector('#share-copy').click();await tick(40);
 const sent=shareCalls(m.calls);assert.deepEqual(sent.map(s=>s.method),['whatsapp','email','gmail','x','linkedin','facebook','copy_link'],'double clicks are counted once');assert.ok(sent.every(s=>s.source==='directory'&&s.path==='/discover/share/p000001'));
 m=mount('discover.html',{fetch:api,scripts:['session.js','share.js'],pre:w=>{Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async()=>{throw new Error('no')}},configurable:true});w.document.execCommand=()=>false}});
 m.w.RequvaShare.open(p,{source:'detail'});m.d.querySelector('#share-copy').click();await tick(40);assert.equal(shareCalls(m.calls).length,0,'failed copy is not counted');
 m=mount('discover.html',{fetch:api,scripts:['session.js','share.js'],pre:w=>{w.navigator.share=async()=>{const e=new Error('cancelled');e.name='AbortError';throw e}}});m.w.RequvaShare.open(p);m.d.querySelector('#share-native').click();await tick(40);assert.equal(shareCalls(m.calls).length,0,'cancelled native share is not counted');
 m=mount('discover.html',{fetch:api,scripts:['session.js','share.js'],pre:w=>{w.navigator.share=async()=>{}}});m.w.RequvaShare.open(p,{source:'bogus'});m.d.querySelector('#share-native').click();await tick(40);assert.deepEqual(shareCalls(m.calls).map(s=>[s.method,s.source]),[['native','direct']]);
 m=mount('discover.html',{fetch:async()=>res({error:'down'},500),scripts:['session.js','share.js']});m.w.RequvaShare.open(p);m.d.querySelector('#share-x').dispatchEvent(new m.w.MouseEvent('click',{bubbles:true,cancelable:true}));await tick(40);assert.ok(m.d.querySelector('#share-dialog'),'a failing tracker never breaks sharing');
});
test('growth: shares section shows totals, methods, dates and the honest explanation; tolerates missing data',async()=>{
 const {w,d}=await growthPage(async()=>res({}));
 const full={...growthFull,sharing:{total:3,all_time:10,by_method:[{method:'whatsapp',count:2},{method:'copy_link',count:1}],recent:[{method:'whatsapp',created_at:iso(1)},{method:'copy_link',created_at:iso(2)}],note:'Counts clicks on the share buttons inside Requva. It does not show whether anyone opened or shared the product elsewhere.'}};
 const show=data=>{const host=d.createElement('div');host.append(...w.RequvaGrowth.render(data));return host};
 let host=show(full);const sec=[...host.querySelectorAll('section')].find(s=>/Shares through Requva/.test(s.textContent));assert.ok(sec);
 const cards=Object.fromEntries([...sec.querySelectorAll('.metric')].map(c=>[c.querySelector('span').textContent,c.querySelector('strong').textContent]));assert.equal(cards['Shares in this period'],'3');assert.equal(cards['Shares all time'],'10');assert.equal(cards['WhatsApp'],'2');assert.equal(cards['Copy link'],'1');
 assert.equal(sec.querySelectorAll('.share-recent li').length,2);assert.match(sec.querySelector('.share-recent li').textContent,/WhatsApp ·/);assert.match(sec.textContent,/does not show whether anyone opened or shared/);
 host=show({...full,sharing:{total:0,all_time:0,by_method:[],recent:[]}});assert.match(host.textContent,/No shares recorded in this period/);assert.ok(!/\[object|undefined|NaN/.test(textOf(host)));
 host=show({...full,sharing:null});assert.match(host.textContent,/Unavailable.*Share data/);
});
test('dashboard product card shows the all time share count',async()=>{
 const api=async(p,q)=>{if(p==='/auth/me')return res({user});if(p==='/products')return res({products:[{id:'p1',name:'Mine',url:'https://m.example',description:'d',stage:'launched',status:'active',listing_status:'approved',share_count:4,seeking:''}]});if(p==='/discover/products')return res({products:[],total:0,page:1,page_size:24});return res({products:[],campaigns:[],requests:[],activities:[],opportunities:[],feedback:[]})};
 const m=mount('dashboard.html',{url:'https://requva.pages.dev/dashboard.html',fetch:api,scripts:['session.js','share.js','app.js']});await tick(250);
 assert.match(m.d.querySelector('#product-list').textContent,/Shares through Requva tools: 4/);
});
test('profile form in account settings saves display name and location',async()=>{
 let saved=null;const api=async(p,q,o)=>{if(p==='/auth/me')return res({user:{...user,display_name:'Ada',location:'Lagos',terms:{required:false,accepted_version:'2026-10-22',accepted_at:iso(3)}}});if(p==='/auth/profile'){saved=JSON.parse(o.body);return res({ok:true,...saved})}if(p==='/discover/products')return res({products:[],total:0,page:1,page_size:24});return res({products:[],campaigns:[],requests:[],activities:[],opportunities:[],feedback:[]})};
 const m=mount('dashboard.html',{url:'https://requva.pages.dev/dashboard.html',fetch:api,scripts:['session.js','share.js','app.js']});await tick(250);
 m.d.querySelector('#account-settings').click();const pf=m.d.querySelector('#profile-form');assert.equal(pf.elements.display_name.value,'Ada');assert.equal(pf.elements.location.value,'Lagos');assert.match(m.d.querySelector('#settings-terms').textContent,/accepted/);
 pf.elements.display_name.value='Ada O.';pf.elements.location.value='Abuja';pf.dispatchEvent(new m.w.Event('submit',{cancelable:true}));await tick(120);assert.deepEqual(saved,{display_name:'Ada O.',location:'Abuja'});
});

/* ---------- distribution opportunities (admin catalog and founder selection list) ---------- */
const CHANNEL_SET=(()=>{const w=fs.readFileSync(new URL('../worker/src/index.js',import.meta.url),'utf8'),block=w.match(/const CHANNELS = new Set\(\[([^\]]+)\]/)[1];return [...block.matchAll(/'([^']+)'/g)].map(m=>m[1])})();
const adminUser={...user,role:'admin',terms:{required:false}};
const oppRow=(o={})=>({id:'o1',name:'Product Hunt',destination_url:'https://producthunt.com',source_url:'https://producthunt.com/faq',channel:'Directories',audience:'Makers',rationale:'Launch audience',requirements:'',eligibility:'',next_action:'Submit',last_verified_at:'2026-10-20',execution_mode:'manual',status:'needs_review',...o});
function distApi(state){return async(p,q,o)=>{const method=o?.method||'GET';
 if(p==='/auth/me')return res({user:state.user||adminUser});
 if(p==='/admin/summary')return res({users:1});
 if(p==='/admin/products')return state.failOps?res({error:'boom'},500):res({products:[]});
 if(p==='/admin/campaigns')return res({campaigns:[]});if(p==='/admin/users')return res({users:[]});if(p==='/admin/reports')return res({reports:[]});
 if(p==='/ai/admin/settings'||p.startsWith('/admin/ai'))return state.failAI?res({error:'AI settings unavailable'},500):res({settings:{enabled:false,daily_limit:5},usage:[]});
 if(p==='/admin/distribution/opportunities'&&method==='GET')return res({opportunities:state.opps});
 if(p==='/admin/distribution/opportunities'&&method==='POST'){state.posted=JSON.parse(o.body);return state.postError?res({error:state.postError,errors:[state.postError]},400):res({opportunity:{id:'new'}},201)}
 if(/^\/admin\/distribution\/opportunities\//.test(p)&&method==='PATCH'){const body=JSON.parse(o.body),id=p.split('/').pop();state.patches=(state.patches||[]).concat({id,body});const row=state.opps.find(x=>x.id===id);if(row&&body.status)row.status=body.status;return res({ok:true})}
 if(p==='/admin/distribution/activities'||p==='/admin/testing/requests'||p==='/admin/product-reports')return state.failActivities?res({error:'reports down'},500):res({activities:[],requests:[],reports:[]});
 if(p==='/distribution/opportunities'){if(state.failOpps)return res({error:'opportunities down'},500);return res({opportunities:state.opps.filter(x=>x.status==='verified')})}
 if(p==='/distribution/activities'){if(state.failActivities)return res({error:'activities down'},500);return res({activities:[]})}
 if(p==='/testing/requests')return res({requests:[]});
 if(p==='/products')return res({products:[{id:'p1',name:'Mine',url:'https://m.example',description:'d',stage:'launched',status:'active',listing_status:'approved'}]});
 if(p==='/discover/products')return res({products:[],total:0,page:1,page_size:24});
 if(p==='/distribution/activities'&&method==='POST'){state.activity=JSON.parse(o.body);return res({activity:{id:'a1'}},201)}
 return res({products:[],campaigns:[],requests:[],activities:[],opportunities:[],feedback:[],categories:[]})}}
const distPage=async(state)=>{const m=mount('dashboard.html',{url:'https://requva.pages.dev/dashboard.html',fetch:distApi(state),scripts:['session.js','share.js','app.js']});await tick(500);return m};
test('opportunity admin form: channel is a pick list matching exactly what the server accepts',()=>{
 for(const f of ['dashboard.html','index.html','testers.html','admin.html']){const h=read(f),m=h.match(/id="admin-opportunity-form">.*?<label>Channel<select name="channel" required>(.*?)<\/select>/s);assert.ok(m,f+' channel is a select');const opts=[...m[1].matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].filter(x=>!/value=""/.test(x[1])).map(x=>x[2]);assert.deepEqual(opts,CHANNEL_SET,f+' options equal the server channel list');assert.ok(!/placeholder="Reddit, LinkedIn, directory/.test(h),f+' misleading free text hint removed')}
});
test('opportunity admin: the review list and verify control load even when other admin sections fail',async()=>{
 const state={opps:[oppRow()],failOps:true,failAI:true};const {d,w}=await distPage(state);
 const sel=d.querySelector('[data-opportunity-status]');assert.ok(sel,'review status control is present');assert.deepEqual([...sel.options].map(o=>o.textContent),['needs_review','verified','archived']);assert.match(d.querySelector('#admin-opportunity-list').textContent,/Product Hunt/);
 assert.match(d.querySelector('#admin-load-errors').textContent,/Operations.*boom/s);assert.match(d.querySelector('#admin-load-errors').textContent,/AI settings/);
 sel.value='verified';sel.dispatchEvent(new w.Event('change'));await tick(200);
 assert.deepEqual(state.patches,[{id:'o1',body:{status:'verified'}}],'choosing verified sends the verification');assert.equal(d.querySelector('[data-opportunity-status]').value,'verified','list reloads showing the new status');
});
test('opportunity admin: partial failures are shown, not hidden, and the rest still renders',async()=>{
 const {d}=await distPage({opps:[oppRow()],failActivities:true});assert.match(d.querySelector('#admin-opportunity-list').textContent,/Some opportunity data could not load/);assert.match(d.querySelector('#admin-opportunity-list').textContent,/Product Hunt/);
});
test('opportunity admin: saving sends a canonical channel and shows the server\'s specific message',async()=>{
 const state={opps:[],postError:'Choose a channel from the list: LinkedIn, Facebook.'};const {d,w}=await distPage(state);const f=d.querySelector('#admin-opportunity-form');
 for(const [k,v] of Object.entries({name:'Product Hunt',destination_url:'https://producthunt.com',source_url:'https://producthunt.com/faq',channel:'Directories',audience:'Makers',rationale:'x',next_action:'Submit',last_verified_at:'2026-10-20'}))f.elements[k].value=v;
 f.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick(150);assert.equal(state.posted.channel,'Directories');assert.match(f.querySelector('.form-error')?.textContent||d.body.textContent,/Choose a channel from the list/,'specific error shown to the admin');
 assert.match(d.querySelector('#admin-opportunity-list').textContent,/No opportunities entered/);
});
test('founder opportunity list: shows verified entries, explains when empty, survives other failures',async()=>{
 const founder={...user,terms:{required:false}};
 let m=await distPage({user:founder,opps:[oppRow({status:'verified'}),oppRow({id:'o2',name:'Hidden draft',status:'needs_review'})]});
 let sel=m.d.querySelector('#distribution-activity-form [name=opportunity_id]');assert.deepEqual([...sel.options].map(o=>o.textContent),['Choose opportunity','Product Hunt · Directories'],'only verified entries are selectable');
 m=await distPage({user:founder,opps:[]});sel=m.d.querySelector('#distribution-activity-form [name=opportunity_id]');assert.deepEqual([...sel.options].map(o=>o.textContent),['No verified opportunities yet']);assert.match(m.d.querySelector('#opportunity-list').textContent,/No administrator-verified opportunities/);assert.ok(!/Add one in Opportunity catalog/.test(m.d.querySelector('#opportunity-list').textContent),'founders are not told to use admin tools');
 m=await distPage({opps:[]});assert.match(m.d.querySelector('#opportunity-list').textContent,/Add one in Opportunity catalog administration/,'admins are pointed to the catalog');
 m=await distPage({user:founder,opps:[oppRow({status:'verified'})],failActivities:true});sel=m.d.querySelector('#distribution-activity-form [name=opportunity_id]');assert.equal(sel.options.length,2,'a failing activities request no longer empties the opportunity list');assert.match(m.d.querySelector('#distribution-source-note').textContent,/Some distribution data could not load/);
 m=await distPage({user:founder,opps:[oppRow({status:'verified'})],failOpps:true});sel=m.d.querySelector('#distribution-activity-form [name=opportunity_id]');assert.deepEqual([...sel.options].map(o=>o.textContent),['Could not load opportunities']);assert.match(m.d.querySelector('#opportunity-list').textContent,/could not be loaded: opportunities down/);
});
