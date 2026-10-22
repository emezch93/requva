/* Founder growth workspace: per product metrics, voluntary feedback inbox and feedback history. */
(()=>{
const R=window.Requva,{el,api}=R,$=s=>document.querySelector(s);
const num=v=>Number.isFinite(v)?String(v):'—';
const metric=(label,value,note)=>el('div',{class:'dir-card metric'},el('strong',{text:value}),el('span',{text:label}),note&&el('small',{class:'form-note',text:note}));
const group=(title,...cards)=>el('section',{},el('h3',{text:title}),el('div',{class:'dir-grid'},cards));
const NOT_CONFIGURED='External acquisition tracking is not configured.';
const SETUP='To measure visits, signups, activation and retention, create a tracking token for this product (Product tracking token) and send events from your own server. Requva does not count clicks as signups.';
function acquisition(a){
 if(!a||typeof a!=='object')return group('Acquisition and usage',metric('Acquisition data','Unavailable','The server did not return acquisition data. Try again shortly.'));
 if(a.configured!==true)return group('Acquisition and usage',metric('Signups',NOT_CONFIGURED,SETUP));
 return group('Acquisition and usage',metric('Visits',num(a.visits),'Reported by your tracking integration.'),metric('Signups',num(a.signups)),metric('Activations',num(a.activations)),metric('Retention events',num(a.retention)))}
function render(d){d=d||{};const disc=d.discovery||{},t=d.testing||{},fb=d.feedback||{},dist=(d.distribution&&d.distribution.by_status)||{},prod=d.product||{};
 const status=prod.listing_status==='approved'?'Live':prod.listing_status==='pending'?'Held for review':prod.listing_status?'Restricted':'Unknown';
 return[
  group('Discovery on Requva',metric('Listing views',num(disc.listing_views),'Opens of your Requva listing.'),metric('Outbound clicks',num(disc.outbound_clicks),'Clicks through Requva to your site. Not visits or signups.'),metric('Listing status',status,prod.hold_reason||'')),
  acquisition(d.acquisition),
  group('Testing',metric('Campaigns created',num(t.campaigns_created)),metric('Opted in',num(t.opted_in),'Interest only.'),metric('Started',num(t.started)),metric('Feedback submitted',num(t.feedback_submitted))),
  group('Feedback',metric('Voluntary feedback',num(fb.general_in_period)),metric('Answered by you',num(fb.general_answered)),metric('Structured test feedback',num(fb.structured_in_period))),
  group('Distribution',metric('Reported complete',num((dist.reported_completed||0)+(dist.awaiting_verification||0)),'Founder reported.'),metric('Verified complete',num(dist.verified_completed||0),'Independently verified.'),metric('Unsuccessful or blocked',num((dist.unsuccessful||0)+(dist.blocked||0))))]}
let seq=0;
async function loadGrowth(){const sel=$('#growth-product'),body=$('#growth-body'),st=$('#growth-status');if(!sel||!body)return;const id=sel.value;if(!id)return;const days=$('#growth-days').value,my=++seq;
 body.replaceChildren();body.dataset.product=id;st.textContent='Loading metrics for this product…';
 try{const d=await api('/products/'+encodeURIComponent(id)+'/growth?days='+encodeURIComponent(days));if(my!==seq)return;st.textContent='';body.replaceChildren(...render(d));await inbox(id,my)}
 catch(e){if(my!==seq)return;st.textContent=e.status===401?'Your session expired. Log in again to see your metrics.':e.message}}
async function inbox(id,my){const box=$('#general-feedback-inbox');if(!box)return;try{const d=await api('/products/'+encodeURIComponent(id)+'/general-feedback');if(my!==seq)return;const items=Array.isArray(d.feedback)?d.feedback:[];
 if(!items.length){box.replaceChildren(el('p',{class:'form-note',text:'No voluntary feedback yet.'}));return}
 box.replaceChildren(...items.map(f=>{const ta=el('textarea',{maxlength:'1000',rows:'2','aria-label':'Your response'});ta.value=f.owner_response||'';const btn=el('button',{type:'button',class:'button button-quiet'},f.owner_response?'Update response':'Respond');
  btn.addEventListener('click',async()=>{if(btn.disabled)return;btn.disabled=true;try{await api('/products/'+encodeURIComponent(id)+'/general-feedback/'+encodeURIComponent(f.id)+'/respond',{method:'POST',body:JSON.stringify({response:ta.value})});btn.textContent='Saved'}catch(e){btn.textContent='Not saved: '+e.message}finally{btn.disabled=false}});
  return el('article',{class:'dir-card'},el('span',{class:'dir-badge',text:f.kind||'general'}),el('p',{text:f.body}),ta,btn)}))}
 catch(e){if(my===seq)box.replaceChildren(el('p',{class:'form-note',text:e.message}))}}
async function mine(){const list=$('#my-feedback-list');if(!list)return;try{const d=await api('/feedback/general/mine'),items=Array.isArray(d.feedback)?d.feedback:[];
 if(!items.length){list.replaceChildren(el('p',{class:'form-note',text:'You have not left voluntary feedback yet. Open a product page to leave some.'}));return}
 list.replaceChildren(...items.map(f=>{const b=f.status==='visible'?el('button',{type:'button',class:'button button-quiet'},'Withdraw'):el('span',{class:'dir-badge',text:f.status});if(f.status==='visible')b.addEventListener('click',async()=>{try{await api('/feedback/general/'+encodeURIComponent(f.id),{method:'DELETE'});mine()}catch(e){b.textContent=e.message}});return el('article',{class:'dir-card'},el('strong',{text:f.product_name}),el('span',{class:'dir-badge',text:f.kind}),el('p',{text:f.body}),f.owner_response&&el('p',{},el('strong',{},'Founder response: '),f.owner_response),b)}))}
 catch(e){list.replaceChildren(el('p',{class:'form-note',text:e.message}))}}
async function categories(){const sel=$('#category-slug');if(!sel||sel.options.length>1)return;try{const d=await api('/discover/categories');for(const c of d.categories||[])sel.append(el('option',{value:c.slug,text:c.name}))}catch{}}
let started=false;
async function init(){const me=await R.me(true);const panel=$('#growth-panel'),hist=$('#my-general-feedback');if(!me){if(panel)panel.hidden=true;if(hist)hist.hidden=true;return}
 if(panel)panel.hidden=false;if(hist)hist.hidden=false;if(started)return;started=true;await categories();mine();
 const sel=$('#growth-product');if(!sel)return;
 try{const d=await api('/products'),items=Array.isArray(d.products)?d.products:[];sel.replaceChildren(...items.map(p=>el('option',{value:p.id,text:p.name})));
  if(!items.length){$('#growth-status').textContent='Publish a product to see its growth metrics.';return}
  const want=new URLSearchParams(location.search).get('product');if(want&&items.some(p=>p.id===want))sel.value=want;
  sel.addEventListener('change',loadGrowth);$('#growth-days').addEventListener('change',loadGrowth);await loadGrowth();
  if(location.hash==='#growth-panel'||location.hash==='#general-feedback-inbox')document.querySelector(location.hash)?.scrollIntoView?.()}
 catch(e){$('#growth-status').textContent=e.message}}
window.RequvaGrowth={render,init};
document.addEventListener('DOMContentLoaded',()=>setTimeout(init,400));
let lastUser;document.addEventListener('requva:auth',e=>{const id=e.detail?.id||null;if(id===lastUser)return;lastUser=id;started=false;if(id)init();else{const p=$('#growth-panel');if(p)p.hidden=true}});
})();
