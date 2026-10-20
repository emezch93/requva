// Run: npm i jsdom (in a temp dir) then node directory-ui.smoke.mjs. Mocks the API, checks directory and product pages.
import {JSDOM} from 'jsdom';import fs from 'fs';
const F='/home/claude/requva/frontend/';
async function run(file,url,mock){
 const html=fs.readFileSync(F+file,'utf8').replace(/<script[^>]*><\/script>/g,'');
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.REQUVA_CONFIG={apiBase:'https://api.test'};w.fetch=async(u)=>mock(String(u));
 w.eval(fs.readFileSync(F+'directory.js','utf8'));await new Promise(r=>setTimeout(r,200));return w.document}
const ok=(b,m)=>{console.log((b?'PASS ':'FAIL ')+m);if(!b)process.exitCode=1};
const res=(d,s=200)=>({ok:s<400,status:s,json:async()=>d});
const prods=[{id:'a1',name:'LedgerLite',tagline:'Books <b>x</b>',description:'d',stage:'launched',pricing_model:'freemium',testing_request_id:'t',seeking:['feedback'],visit_url:'/api/v1/go/a1'}];
let d=await run('discover.html','https://x.test/discover.html',u=>u.includes('categories')?res({categories:[{slug:'a',name:'Cat A',product_count:1}]}):u.includes('discover/products')?res({products:prods,total:1,page:1,page_size:24,ranking:'r'}):res({user:null}));
ok(d.querySelectorAll('.dir-card').length===1,'directory renders a card from API data');
ok(d.querySelector('.dir-card a.button').href==='https://api.test/api/v1/go/a1?src=explore','visit link goes through tracked redirect');
ok(!d.querySelector('.dir-card b'),'API text is escaped, not injected as HTML');
ok(d.querySelector('#dir-category').options.length===2,'categories loaded from API');
ok(d.querySelector('.dir-badge-lime'),'testing badge only when testing request exists');
d=await run('discover.html','https://x.test/discover.html',u=>u.includes('categories')?res({categories:[]}):u.includes('discover/products')?res({products:[],total:0,page:1,page_size:24}):res({}));
ok(/No products have been published/.test(d.querySelector('#dir-status').textContent),'empty state');
d=await run('discover.html','https://x.test/discover.html?q=zz',u=>u.includes('categories')?res({categories:[]}):u.includes('discover/products')?res({products:[],total:0,page:1,page_size:24}):res({}));
ok(/No products match/.test(d.querySelector('#dir-status').textContent),'no results state');
d=await run('discover.html','https://x.test/discover.html',u=>u.includes('categories')?res({categories:[]}):u.includes('discover/products')?res({error:'boom'},500):res({}));
ok(d.querySelector('[role=alert]')&&/boom/.test(d.querySelector('[role=alert]').textContent),'error state with retry');
d=await run('product.html','https://x.test/product.html?id=a1',u=>u.includes('discover/products/a1')?res({product:{...prods[0],description:'Full desc',website_host:'ledgerlite.example',testing:{instructions:'Do it',effort_minutes:10}}}):res({user:null}));
ok(d.querySelector('h1').textContent==='LedgerLite','detail view renders');
ok([...d.querySelectorAll('a')].some(a=>/Test this product/.test(a.textContent)),'test action shown when testing is open');
d=await run('product.html','https://x.test/product.html?id=zz',u=>u.includes('discover/products/zz')?res({error:'nf'},404):res({}));
ok(/not available/.test(d.querySelector('[role=alert]').textContent),'unavailable product state');
