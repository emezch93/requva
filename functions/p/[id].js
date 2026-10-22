// Serves /p/<id> with per product title, description and Open Graph tags so link previews and crawlers see real content.
// Falls back to the plain product page when the API cannot be reached. Without this function, _redirects still serves the page.
const DEFAULT_API='https://requva.emezch93.workers.dev';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ID=/^[\w-]{4,64}$/;
const SECURITY={"X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY", "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' https://requva.emezch93.workers.dev; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests"};

export function seoBlock(site,p){
 const desc=String(p.tagline||p.description||'').replace(/\s+/g,' ').trim().slice(0,155),title=p.name+' | Requva',url=site+'/p/'+encodeURIComponent(p.id);
 return '<!--seo-start--><title>'+esc(title)+'</title><meta name="description" content="'+esc(desc)+'"><link rel="canonical" href="'+esc(url)+'"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(desc)+'"><meta property="og:type" content="website"><meta property="og:url" content="'+esc(url)+'"><meta property="og:site_name" content="Requva"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="'+esc(title)+'"><meta name="twitter:description" content="'+esc(desc)+'"><!--seo-end-->'}
const NOINDEX='<!--seo-start--><title>Product | Requva</title><meta name="robots" content="noindex,nofollow"><!--seo-end-->';
export function inject(html,block){return html.replace(/<!--seo-start-->[\s\S]*?<!--seo-end-->/,()=>block)}
async function shell(env,request){let r=await env.ASSETS.fetch(new Request(new URL('/product.html',request.url)));if(r.status>=300&&r.status<400){const loc=r.headers.get('Location');if(loc)r=await env.ASSETS.fetch(new Request(new URL(loc,request.url)))}return r}
export async function onRequestGet({request,env,params}){
 const id=String(params.id||''),page=await shell(env,request);if(!page.ok)return page;const html=await page.text();
 const headers={...SECURITY,'content-type':'text/html; charset=utf-8'};
 if(!ID.test(id))return new Response(inject(html,NOINDEX),{status:404,headers:{...headers,'cache-control':'no-store'}});
 const site=(env.SITE_URL||new URL(request.url).origin).replace(/\/$/,''),api=(env.API_ORIGIN||DEFAULT_API).replace(/\/$/,''),target=api+'/api/v1/discover/products/'+encodeURIComponent(id);
 try{const res=env.API?await env.API.fetch(new Request(target)):await fetch(target,{signal:AbortSignal.timeout(2500)});
  if(res.status===404)return new Response(inject(html,NOINDEX),{status:404,headers:{...headers,'cache-control':'no-store'}});
  if(!res.ok)throw Error('api '+res.status);const {product}=await res.json();if(!product||!product.id)throw Error('bad payload');
  return new Response(inject(html,seoBlock(site,product)),{status:200,headers:{...headers,'cache-control':'public, max-age=300'}})}
 catch{return new Response(inject(html,NOINDEX),{status:200,headers:{...headers,'cache-control':'no-store'}})}}
