// Dynamic sitemap: static pages plus every published product. Falls back to the static sitemap.xml if the API is unavailable.
const DEFAULT_API='https://requva.emezch93.workers.dev';
const x=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function onRequestGet({request,env}){
 const site=(env.SITE_URL||new URL(request.url).origin).replace(/\/$/,''),api=(env.API_ORIGIN||DEFAULT_API).replace(/\/$/,''),target=api+'/api/v1/discover/sitemap';
 try{const res=env.API?await env.API.fetch(new Request(target)):await fetch(target,{signal:AbortSignal.timeout(2500)});if(!res.ok)throw Error('api');const {products}=await res.json();
  const urls=['/','/discover','/privacy','/terms','/contact'].map(p=>'<url><loc>'+x(site+p)+'</loc></url>').concat((products||[]).filter(p=>/^[\w-]{4,64}$/.test(p.id)).map(p=>'<url><loc>'+x(site+'/p/'+encodeURIComponent(p.id))+'</loc>'+(p.updated_at?'<lastmod>'+x(String(p.updated_at).slice(0,10))+'</lastmod>':'')+'</url>'));
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.join('')+'</urlset>',{headers:{'content-type':'application/xml; charset=utf-8','cache-control':'public, max-age=900'}})}
 catch{return env.ASSETS.fetch(new Request(new URL('/sitemap.xml',request.url)))}}
