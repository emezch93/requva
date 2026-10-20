(()=>{
const API=(window.REQUVA_CONFIG?.apiBase||'').replace(/\/$/,'');
const $=s=>document.querySelector(s);
const PRICING={free:'Free',freemium:'Freemium',paid:'Paid',subscription:'Subscription',contact:'Contact for pricing'};
const STAGE={idea:'Idea',launched:'Launched',growing:'Growing'};
const SEEKING={users:'Seeking users',feedback:'Seeking feedback',testers:'Seeking testers'};
function el(tag,attrs={},...kids){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(v===undefined||v===null||v===false)continue;if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else n.setAttribute(k,v===true?'':v)}for(const c of kids.flat()){if(c==null||c===false)continue;n.append(c.nodeType?c:document.createTextNode(c))}return n}
async function get(path){let r;try{r=await fetch(API+'/api/v1'+path,{credentials:'include'})}catch{throw new Error('Could not reach Requva. Check your connection and try again.')}const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'Request failed ('+r.status+')'),{status:r.status});return d}
function nav(){const toggle=$('#menu-toggle'),menu=$('#primary-nav');toggle?.addEventListener('click',()=>{const open=menu.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open))});get('/auth/me').then(d=>{const u=d.user;document.querySelectorAll('[data-auth-only]').forEach(x=>x.hidden=!u);document.querySelectorAll('[data-guest-only]').forEach(x=>x.hidden=!!u)}).catch(()=>{});const y=$('#year');if(y)y.textContent=new Date().getFullYear()}
const badge=(t,cls='')=>el('span',{class:'dir-badge '+cls,text:t});
function card(p,src){const visit=API+p.visit_url+'?src='+src;return el('article',{class:'dir-card'},
 el('h3',{},el('a',{href:'/product.html?id='+encodeURIComponent(p.id)},p.name)),
 p.tagline?el('p',{class:'dir-tagline',text:p.tagline}):el('p',{class:'dir-tagline',text:(p.description||'').slice(0,140)}),
 el('div',{class:'dir-badges'},p.pricing_model&&badge(PRICING[p.pricing_model]),badge(STAGE[p.stage]||p.stage),p.testing_request_id&&badge('Open for testers','dir-badge-lime'),(p.seeking||[]).filter(x=>x!=='testers').map(x=>badge(SEEKING[x]))),
 el('div',{class:'dir-actions'},el('a',{class:'button button-dark',href:visit,target:'_blank',rel:'noopener noreferrer'},'Visit product ↗'),el('a',{class:'text-link',href:'/product.html?id='+encodeURIComponent(p.id)},'Details')))}
async function directory(){
 const form=$('#dir-form'),grid=$('#dir-grid'),status=$('#dir-status'),more=$('#dir-count'),cat=$('#dir-category');
 try{const d=await get('/discover/categories');for(const c of d.categories)cat.append(el('option',{value:c.slug},c.name+(c.product_count?' ('+c.product_count+')':'')))}catch{}
 const params=new URLSearchParams(location.search);for(const[k,v]of params){const f=form.elements[k];if(f&&f.type!=='checkbox')f.value=v;else if(f&&k==='testing')f.checked=v==='1'}
 let page=1;
 async function load(reset=true){if(reset)page=1;status.textContent='Loading products…';if(reset)grid.replaceChildren();const q=new URLSearchParams();const fd=new FormData(form);for(const[k,v]of fd){if(v)q.set(k,v)}q.set('page',String(page));
  const keep=new URLSearchParams(q);keep.delete('page');history.replaceState(null,'',keep.toString()?'?'+keep:location.pathname);
  try{const d=await get('/discover/products?'+q);for(const p of d.products)grid.append(card(p,q.get('q')?'search':'explore'));
   $('#dir-ranking').textContent=d.ranking||'';
   if(!d.total){status.textContent=q.get('q')||q.get('category')||q.get('pricing')||q.get('stage')||q.get('testing')?'No products match these filters. Try fewer filters or a broader search.':'No products have been published yet. Be the first to list one.';more.hidden=true;return}
   status.textContent=d.total+' product'+(d.total===1?'':'s');more.hidden=page*d.page_size>=d.total}
  catch(e){status.textContent='';grid.replaceChildren(el('p',{class:'dir-error',role:'alert'},e.message,' ',el('button',{type:'button',class:'text-link',id:'dir-retry'},'Try again')));$('#dir-retry').addEventListener('click',()=>load(true))}}
 form.addEventListener('submit',e=>{e.preventDefault();load(true)});form.addEventListener('change',()=>load(true));
 more.addEventListener('click',()=>{page+=1;load(false)});
 document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>{form.reset();const s=b.dataset.section;if(s==='recent')form.elements.sort.value='recent';if(s==='testers')form.elements.sort.value='testers';load(true)}));
 load(true)}
async function detail(){
 const root=$('#product-root'),id=new URLSearchParams(location.search).get('id');
 if(!id){root.replaceChildren(el('p',{class:'dir-error',role:'alert'},'No product selected. ',el('a',{href:'/discover.html'},'Browse products')));return}
 try{const{product:p}=await get('/discover/products/'+encodeURIComponent(id));document.title=p.name+' — Requva';
  fetch(API+'/api/v1/discover/view/'+encodeURIComponent(id)+'?src=detail',{method:'POST',credentials:'include',headers:{'X-Requested-With':'Requva'}}).catch(()=>{});
  const t=p.testing;
  root.replaceChildren(
   el('a',{class:'text-link',href:'/discover.html'},'← All products'),
   el('h1',{text:p.name}),p.tagline&&el('p',{class:'dir-tagline',text:p.tagline}),
   el('div',{class:'dir-badges'},p.pricing_model&&badge(PRICING[p.pricing_model]),badge(STAGE[p.stage]||p.stage),p.supported_region&&badge(p.supported_region),t&&badge('Open for testers','dir-badge-lime'),(p.seeking||[]).map(x=>badge(SEEKING[x]))),
   el('div',{class:'dir-actions'},el('a',{class:'button button-dark',href:API+p.visit_url+'?src=detail',target:'_blank',rel:'noopener noreferrer'},'Visit product ↗'),t&&el('a',{class:'button button-lime',href:'/testers.html'},'Test this product'),el('span',{class:'dir-host',text:p.website_host})),
   el('section',{},el('h2',{text:'What it does'}),el('p',{class:'dir-body',text:p.description})),
   p.problem&&el('section',{},el('h2',{text:'Problem it solves'}),el('p',{text:p.problem})),
   p.audience&&el('section',{},el('h2',{text:'Who it is for'}),el('p',{text:p.audience})),
   t&&el('section',{class:'dir-testing'},el('h2',{text:'Testing opportunity'}),el('p',{text:t.instructions}),t.tester_type&&el('p',{},el('strong',{},'Looking for: '),t.tester_type),t.effort_minutes&&el('p',{},el('strong',{},'Time needed: '),t.effort_minutes+' minutes'),t.closes_at&&el('p',{},el('strong',{},'Closes: '),t.closes_at),el('p',{class:'form-note',text:'Testing is opt in. Participation is recorded only when you opt in, start, and submit feedback. No reward is offered unless the owner states one.'})),
   el('p',{class:'form-note',text:'Requva lists products submitted by their founders. Details are not independently verified.'}))}
 catch(e){root.replaceChildren(el('p',{class:'dir-error',role:'alert'},e.status===404?'This product is not available. It may have been paused or removed.':e.message,' ',el('a',{href:'/discover.html'},'Browse products')))}}
nav();if($('#dir-form'))directory();if($('#product-root'))detail();
})();
