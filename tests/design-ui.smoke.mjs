import {JSDOM} from 'jsdom';import fs from 'fs';
const F='/home/claude/requva/frontend/';
async function run(file,url,mock,scripts){
 const html=fs.readFileSync(F+file,'utf8').replace(/<script[^>]*><\/script>/g,'');
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.REQUVA_CONFIG={apiBase:'https://api.test'};w.fetch=async(u,o)=>mock(String(u),o);
 for(const s of scripts)w.eval(fs.readFileSync(F+s,'utf8'));await new Promise(r=>setTimeout(r,200));return {d:w.document,w}}
const ok=(b,m)=>{console.log((b?'PASS ':'FAIL ')+m);if(!b)process.exitCode=1};
const res=(d,s=200)=>({ok:s<400,status:s,json:async()=>d});
const p={id:'a1',name:'LedgerLite',tagline:'Books',description:'d',stage:'launched',pricing_model:'free',seeking:[],visit_url:'/api/v1/go/a1'};
let {d}=await run('index.html','https://x.test/',u=>res({products:[p,{...p,id:'b2',name:'Two'}]}),['home.js']);
ok(d.querySelectorAll('#home-fresh li').length===2,'homepage lists fresh products from the API');
ok(d.querySelector('#home-fresh a').getAttribute('href')==='/product.html?id=a1','homepage links to product page');
({d}=await run('index.html','https://x.test/',u=>res({},500),['home.js']));
ok(/unavailable/.test(d.querySelector('#home-fresh').textContent),'homepage handles API failure');
let seen;({d}=await run('leaving.html','https://x.test/leaving.html?id=a1&src=search',(u,o)=>{seen=seen||o;return res({product:{...p,website_host:'ledgerlite.example'}})},['directory.js']));
const a=d.querySelector('.dir-actions a.button');ok(a&&a.href==='https://api.test/api/v1/go/a1?src=search&confirm=1','leaving page continues with confirm=1');
ok(d.querySelector('.host').textContent==='ledgerlite.example','leaving page shows the real host');
const {w}=await run('discover.html','https://x.test/discover.html',()=>res({categories:[],products:[],total:0,page:1,page_size:24,user:null}),['directory.js']);
let hdr;const w2=(await run('discover.html','https://x.test/discover.html',(u,o)=>{if(u.includes('auth/me'))hdr=o?.headers;return res({categories:[],products:[],total:0,page:1,page_size:24,user:null})},[]));
w2.w.localStorage.setItem('requva_token','tok123');w2.w.eval(fs.readFileSync(F+'directory.js','utf8'));await new Promise(r=>setTimeout(r,200));
ok(hdr&&hdr.Authorization==='Bearer tok123','directory sends the bearer token when present');
