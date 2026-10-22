import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const page=await import(new URL('functions/p/[id].js',root));
const sitemap=await import(new URL('functions/sitemap.xml.js',root));
const html=fs.readFileSync(new URL('frontend/product.html',root),'utf8');
const ASSETS={fetch:async()=>new Response(html,{status:200,headers:{'content-type':'text/html'}})};
const ctx=(id,extra={})=>({request:new Request('https://requva.pages.dev/p/'+id),env:{ASSETS,...extra},params:{id}});
const withApi=(fn,run)=>async()=>{const real=globalThis.fetch;globalThis.fetch=fn;try{await run()}finally{globalThis.fetch=real}};
const product={id:'p000001',name:'Ledger <script>alert(1)</script> "Pro"',tagline:'Bookkeeping & more',description:'Long description'};
test('product page function injects escaped per product SEO tags and security headers',withApi(async()=>new Response(JSON.stringify({product}),{status:200}),async()=>{
 const r=await page.onRequestGet(ctx('p000001'));const h=await r.text();assert.equal(r.status,200);
 assert.ok(h.includes('<link rel="canonical" href="https://requva.pages.dev/p/p000001">'));assert.ok(h.includes('property="og:title"'));assert.ok(!h.includes('<script>alert(1)'),'name is escaped');assert.ok(h.includes('&lt;script&gt;'));
 assert.ok(!h.includes('noindex'),'indexable when the product exists');assert.equal(h.match(/<title>/g).length,1);
 assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(r.headers.get('x-frame-options'),'DENY');
}));
test('product page function: unknown product is 404 and noindex; API outage degrades to generic noindex page; invalid ids rejected without calling the API',async()=>{
 let calls=0;
 await withApi(async()=>{calls++;return new Response('{}',{status:404})},async()=>{const r=await page.onRequestGet(ctx('p000009'));assert.equal(r.status,404);assert.ok((await r.text()).includes('noindex'))})();
 await withApi(async()=>{calls++;throw new Error('down')},async()=>{const r=await page.onRequestGet(ctx('p000001'));const h=await r.text();assert.equal(r.status,200);assert.ok(h.includes('noindex'));assert.ok(h.includes('<div')||h.length>500,'page still served so the client can render')})();
 calls=0;await withApi(async()=>{calls++;return new Response('{}')},async()=>{const r=await page.onRequestGet(ctx('..%2F..'));assert.equal(r.status,404);assert.equal(calls,0)})();
});
test('product page function follows asset redirects and supports a service binding',async()=>{
 const redirecting={fetch:async req=>new URL(req.url).pathname==='/product.html'?new Response(null,{status:308,headers:{Location:'/product'}}):new Response(html,{status:200})};
 const API={fetch:async req=>{assert.match(req.url,/\/api\/v1\/discover\/products\/p000001$/);return new Response(JSON.stringify({product}),{status:200})}};
 const r=await page.onRequestGet({request:new Request('https://requva.pages.dev/p/p000001'),env:{ASSETS:redirecting,API},params:{id:'p000001'}});assert.equal(r.status,200);assert.ok((await r.text()).includes('og:url'));
});
test('sitemap function lists published products, escapes, drops invalid ids, falls back to static file',async()=>{
 await withApi(async()=>new Response(JSON.stringify({products:[{id:'p000001',updated_at:'2026-10-01T00:00:00Z'},{id:'bad id<>',updated_at:'x'}]})),async()=>{
  const r=await sitemap.onRequestGet({request:new Request('https://requva.pages.dev/sitemap.xml'),env:{ASSETS}});const x=await r.text();assert.match(r.headers.get('content-type'),/xml/);assert.ok(x.includes('<loc>https://requva.pages.dev/p/p000001</loc><lastmod>2026-10-01</lastmod>'));assert.ok(!x.includes('bad id'));assert.ok(x.includes('https://requva.pages.dev/discover'))})();
 const staticXml='<urlset>static</urlset>';
 await withApi(async()=>{throw new Error('down')},async()=>{const r=await sitemap.onRequestGet({request:new Request('https://requva.pages.dev/sitemap.xml'),env:{ASSETS:{fetch:async()=>new Response(staticXml)}}});assert.equal(await r.text(),staticXml)})();
});
