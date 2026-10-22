/* Public directory, product page and leaving page. Filters are server side; state lives in the URL. */
(()=>{
const R=window.Requva,{el,api}=R,$=s=>document.querySelector(s);
const PRICING={free:'Free',freemium:'Freemium',paid:'Paid',subscription:'Subscription',contact:'Contact for pricing'};
const STAGE={idea:'Idea',launched:'Launched',growing:'Growing'};
const SEEKING={users:'Seeking users',feedback:'Seeking feedback',testers:'Seeking testers'};
const SORTS=['relevance','recent','testers'];
const badge=(t,cls='')=>el('span',{class:'dir-badge '+cls,text:t});
const productPath=id=>'/p/'+encodeURIComponent(id);
function nav(){const toggle=$('#menu-toggle'),menu=$('#primary-nav');toggle?.addEventListener('click',()=>{const o=menu.classList.toggle('open');toggle.setAttribute('aria-expanded',String(o))});
 R.me().then(u=>{document.querySelectorAll('[data-auth-only]').forEach(x=>x.hidden=!u);document.querySelectorAll('[data-guest-only]').forEach(x=>x.hidden=!!u)});const y=$('#year');if(y)y.textContent=new Date().getFullYear()}
function card(p,src){const visit=R.API+p.visit_url+'?src='+src,share=el('button',{type:'button',class:'button button-quiet','data-share':p.id,'aria-label':'Share '+p.name},'Share');share.addEventListener('click',()=>window.RequvaShare?.open(p));
 return el('article',{class:'dir-card'},el('h3',{},el('a',{href:productPath(p.id)},p.name)),el('p',{class:'dir-tagline',text:p.tagline||(p.description||'').slice(0,140)}),
  el('div',{class:'dir-badges'},p.pricing_model&&badge(PRICING[p.pricing_model]||p.pricing_model),badge(STAGE[p.stage]||p.stage),p.testing_request_id&&badge('Open for testers','dir-badge-lime'),(p.seeking||[]).filter(x=>x!=='testers').map(x=>badge(SEEKING[x]||x))),
  el('div',{class:'dir-actions'},el('a',{class:'button button-dark',href:visit,target:'_blank',rel:'noopener noreferrer'},'Visit product ↗'),share,el('a',{class:'text-link',href:productPath(p.id)},'Details')))}
async function directory(){
 const form=$('#dir-form'),grid=$('#dir-grid'),status=$('#dir-status'),err=$('#dir-error'),moreBtn=$('#dir-count'),note=$('#dir-note'),cat=$('#dir-category'),clear=$('#dir-clear');
 let known=new Set(),page=1,seq=0,debounce=null;
 try{const d=await api('/discover/categories');for(const c of d.categories||[]){known.add(c.slug);cat.append(el('option',{value:c.slug},c.name+(c.product_count?' ('+c.product_count+')':'')))}}catch{}
 const f=form.elements;
 function apply(params){let dropped=false;const pick=(name,ok)=>{const v=params.get(name)||'';if(v&&!ok(v)){dropped=true;return ''}return v};
  f.q.value=(params.get('q')||'').slice(0,80);f.category.value=pick('category',v=>known.has(v));f.pricing.value=pick('pricing',v=>v in PRICING);f.stage.value=pick('stage',v=>v in STAGE);f.seeking.value=pick('seeking',v=>v in SEEKING);f.sort.value=pick('sort',v=>SORTS.includes(v))||'relevance';f.testing.checked=params.get('testing')==='1';
  note.textContent=dropped?'Some filters in this link were not recognised and were ignored.':''}
 const current=()=>{const q=new URLSearchParams();for(const k of ['q','category','pricing','stage','seeking']){const v=String(f[k].value||'').trim();if(v)q.set(k,v)}if(f.sort.value&&f.sort.value!=='relevance')q.set('sort',f.sort.value);if(f.testing.checked)q.set('testing','1');return q};
 const active=()=>current().toString()!=='';
 async function load({reset=true,push=false}={}){const my=++seq,q=current(),qs=q.toString();
  if(reset){page=1;grid.replaceChildren()}if(push&&qs!==location.search.replace(/^\?/,''))history.pushState(null,'',qs?'?'+qs:location.pathname);
  err.replaceChildren();status.textContent='Loading products…';moreBtn.hidden=true;clear.hidden=!active();
  const req=new URLSearchParams(q);req.set('page',String(page));
  try{const d=await api('/discover/products?'+req);if(my!==seq)return;for(const p of d.products||[])grid.append(card(p,q.get('q')?'search':'explore'));
   $('#dir-ranking').textContent=d.ranking||'';
   if(!d.total){status.textContent=active()?'No products match these filters.':'No products have been published yet. Be the first to list one.';return}
   const shown=grid.children.length;status.textContent=d.total+' product'+(d.total===1?'':'s')+(shown<d.total?' · showing '+shown:'');moreBtn.hidden=shown>=d.total}
  catch(e){if(my!==seq)return;status.textContent='';const retry=el('button',{type:'button',class:'text-link'},'Try again');retry.addEventListener('click',()=>load({reset}));err.replaceChildren(el('p',{class:'dir-error',role:'alert'},e.message,' ',retry))}}
 apply(new URLSearchParams(location.search));
 form.addEventListener('submit',e=>{e.preventDefault();clearTimeout(debounce);load({push:true})});
 form.addEventListener('change',()=>load({push:true}));
 f.q.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>load({push:true}),300)});
 clear.addEventListener('click',()=>{apply(new URLSearchParams());load({push:true})});
 moreBtn.addEventListener('click',()=>{page+=1;load({reset:false})});
 document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>{apply(new URLSearchParams());const s=b.dataset.section;if(s==='recent')f.sort.value='recent';if(s==='testers')f.sort.value='testers';load({push:true})}));
 window.addEventListener('popstate',()=>{apply(new URLSearchParams(location.search));load({push:false})});
 load({push:false})}
function feedbackBox(id){const status=el('p',{class:'form-note',role:'status','aria-live':'polite'}),ta=el('textarea',{maxlength:'2000',rows:'3',required:true,id:'fb-body'}),kind=el('select',{id:'fb-kind'},...[['general','General'],['bug','Something is broken'],['idea','Idea'],['praise','What works well']].map(([v,t])=>el('option',{value:v},t))),btn=el('button',{class:'button button-dark',type:'submit'},'Send feedback'),form=el('form',{class:'dir-form'},el('label',{},'Type',kind),el('label',{class:'dir-search'},'Your feedback (at least 5 characters)',ta),btn);
 form.addEventListener('submit',async e=>{e.preventDefault();if(btn.disabled)return;btn.disabled=true;status.textContent='Sending…';try{await api('/discover/products/'+encodeURIComponent(id)+'/feedback',{method:'POST',body:JSON.stringify({body:ta.value,kind:kind.value})});status.textContent='Thank you. Your feedback was sent to the founder. You can withdraw it from your dashboard.';ta.value=''}
  catch(err){if(err.status===401)status.replaceChildren('Log in to leave feedback. ',el('a',{href:'/dashboard.html'},'Log in or create an account'));else if(err.code==='CAPABILITY_REQUIRED'){const act=el('button',{type:'button',class:'text-link'},'Activate product user on my account');act.addEventListener('click',async()=>{try{await api('/auth/capabilities',{method:'POST',body:JSON.stringify({capability:err.capability})});status.textContent='Activated. Send your feedback again.'}catch(x){status.textContent=x.message}});status.replaceChildren(err.message+' ',act)}else status.textContent=err.message}
  finally{btn.disabled=false}});
 return el('section',{},el('h2',{text:'Leave feedback'}),el('p',{class:'form-note',text:'Voluntary and optional. The founder sees your feedback without your email address.'}),form,status)}
function productId(){const m=location.pathname.match(/^\/p\/([\w-]+)\/?$/),id=m?decodeURIComponent(m[1]):new URLSearchParams(location.search).get('id');return window.RequvaShare?.validId(id)?id:null}
async function detail(){
 const root=$('#product-root'),id=productId();
 if(!id){root.replaceChildren(el('p',{class:'dir-error',role:'alert'},'This product link is not valid. ',el('a',{href:'/discover.html'},'Browse products')));return}
 try{const{product:p}=await api('/discover/products/'+encodeURIComponent(id));document.title=p.name+' — Requva';
  api('/discover/view/'+encodeURIComponent(id)+'?src=detail',{method:'POST',body:'{}'}).catch(()=>{});
  const t=p.testing,share=el('button',{type:'button',class:'button button-quiet',id:'detail-share'},'Share');share.addEventListener('click',()=>window.RequvaShare?.open(p));
  root.replaceChildren(el('a',{class:'text-link',href:'/discover.html'},'← All products'),el('h1',{text:p.name}),p.tagline&&el('p',{class:'dir-tagline',text:p.tagline}),
   el('div',{class:'dir-badges'},p.pricing_model&&badge(PRICING[p.pricing_model]||p.pricing_model),badge(STAGE[p.stage]||p.stage),p.supported_region&&badge(p.supported_region),t&&badge('Open for testers','dir-badge-lime'),(p.seeking||[]).map(x=>badge(SEEKING[x]||x))),
   el('div',{class:'dir-actions'},el('a',{class:'button button-dark',href:R.API+p.visit_url+'?src=detail',target:'_blank',rel:'noopener noreferrer'},'Visit product ↗'),share,t&&el('a',{class:'button button-lime',href:'/testers.html'},'Test this product'),el('span',{class:'dir-host',text:p.website_host})),
   el('section',{},el('h2',{text:'What it does'}),el('p',{class:'dir-body',text:p.description})),p.problem&&el('section',{},el('h2',{text:'Problem it solves'}),el('p',{text:p.problem})),p.audience&&el('section',{},el('h2',{text:'Who it is for'}),el('p',{text:p.audience})),
   t&&el('section',{class:'dir-testing'},el('h2',{text:'Testing opportunity'}),el('p',{text:t.instructions}),t.tester_type&&el('p',{},el('strong',{},'Looking for: '),t.tester_type),t.effort_minutes&&el('p',{},el('strong',{},'Time needed: '),t.effort_minutes+' minutes'),t.closes_at&&el('p',{},el('strong',{},'Closes: '),t.closes_at),el('p',{class:'form-note',text:'Testing is opt in. Participation is recorded only when you opt in, start, and submit feedback. No reward is offered unless the owner states one.'})),
   feedbackBox(p.id),el('p',{class:'form-note',text:'Requva lists products submitted by their founders. Details are not independently verified.'}))}
 catch(e){root.replaceChildren(el('p',{class:'dir-error',role:'alert'},e.status===404?'This product is not available. It may have been paused or removed.':e.message,' ',el('a',{href:'/discover.html'},'Browse products')))}}
async function leaving(){const root=$('#leaving-root'),q=new URLSearchParams(location.search),id=q.get('id');if(!window.RequvaShare?.validId(id)){root.textContent='No product selected.';return}
 try{const{product:p}=await api('/discover/products/'+encodeURIComponent(id)),src=['search','detail','explore','direct'].includes(q.get('src'))?q.get('src'):'direct';
  root.replaceChildren(el('span',{class:'section-kicker',text:'Heads up'}),el('h1',{text:'You are leaving Requva'}),el('p',{},'You are about to open ',el('strong',{text:p.name}),' at:'),el('p',{},el('span',{class:'host',text:p.website_host})),el('p',{class:'form-note',text:'This listing is new. Requva checks listings automatically but does not verify them or the sites they link to. Do not enter passwords or payment details unless you trust the site.'}),el('div',{class:'dir-actions'},el('a',{class:'button button-dark',href:R.API+p.visit_url+'?src='+src+'&confirm=1',rel:'noopener noreferrer'},'Continue to site ↗'),el('a',{class:'text-link',href:productPath(id)},'Back to listing')))}
 catch(e){root.replaceChildren(el('p',{class:'dir-error',role:'alert'},e.status===404?'This product is no longer available.':e.message,' ',el('a',{href:'/discover.html'},'Browse products')))}}
const cl=$('#contact-line');if(cl&&window.REQUVA_CONFIG?.contactEmail)cl.replaceChildren('email ',el('a',{href:'mailto:'+window.REQUVA_CONFIG.contactEmail,text:window.REQUVA_CONFIG.contactEmail}));
nav();if($('#dir-form'))directory();if($('#product-root'))detail();if($('#leaving-root'))leaving();
})();
