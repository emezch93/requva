/* Founder growth workspace: per product metrics, including honest share tracking. Conversations live in messages.js. */
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
const METHOD={copy_link:'Copy link',whatsapp:'WhatsApp',email:'Email',gmail:'Gmail',x:'X',linkedin:'LinkedIn',facebook:'Facebook',native:'Device share'};
const when=iso=>{try{return new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}catch{return String(iso||'')}};
function sharing(sh){
 if(!sh||typeof sh!=='object')return group('Shares through Requva',metric('Share data','Unavailable','The server did not return share data. Try again shortly.'));
 const by=Array.isArray(sh.by_method)?sh.by_method:[],recent=Array.isArray(sh.recent)?sh.recent:[];
 return el('section',{},el('h3',{text:'Shares through Requva'}),
  el('div',{class:'dir-grid'},metric('Shares in this period',num(sh.total),'Share button uses counted in the selected period.'),metric('Shares all time',num(sh.all_time)),by.map(x=>metric(METHOD[x.method]||x.method,num(x.count)))),
  recent.length?el('ul',{class:'share-recent','aria-label':'Recent shares'},recent.map(r=>el('li',{text:(METHOD[r.method]||r.method)+' · '+when(r.created_at)}))):el('p',{class:'form-note',text:'No shares recorded in this period.'}),
  el('p',{class:'form-note',text:sh.note||'Requva counts clicks on its own share buttons. It does not show whether anyone opened or shared the product elsewhere.'}))}
function render(d){d=d||{};const disc=d.discovery||{},t=d.testing||{},fb=d.feedback||{},prod=d.product||{};
 const status=prod.listing_status==='approved'?'Live':prod.listing_status==='pending'?'Held for review':prod.listing_status?'Restricted':'Unknown';
 return[
  group('Discovery on Requva',metric('Listing views',num(disc.listing_views),'Opens of your Requva listing.'),metric('Outbound clicks',num(disc.outbound_clicks),'Clicks through Requva to your site. Not visits or signups.'),metric('Listing status',status,prod.hold_reason||'')),
  acquisition(d.acquisition),
  sharing(d.sharing),
  group('Testing',metric('Testing requests created',num(t.requests_created)),metric('Opted in',num(t.opted_in),'Interest only.'),metric('Started',num(t.started)),metric('Feedback submitted',num(t.feedback_submitted))),
  group('Feedback',metric('Voluntary feedback',num(fb.general_in_period)),metric('Answered by you',num(fb.general_answered)),metric('Structured test feedback',num(fb.structured_in_period)))]}
let seq=0;
async function loadGrowth(){const sel=$('#growth-product'),body=$('#growth-body'),st=$('#growth-status');if(!sel||!body)return;const id=sel.value;if(!id)return;const days=$('#growth-days').value,my=++seq;
 body.replaceChildren();body.dataset.product=id;st.textContent='Loading metrics for this product…';
 try{const d=await api('/products/'+encodeURIComponent(id)+'/growth?days='+encodeURIComponent(days));if(my!==seq)return;st.textContent='';body.replaceChildren(...render(d))}
 catch(e){if(my!==seq)return;st.textContent=e.status===401?'Your session expired. Log in again to see your metrics.':e.message}}
async function categories(){const sel=$('#category-slug');if(!sel||sel.options.length>1)return;try{const d=await api('/discover/categories');for(const c of d.categories||[])sel.append(el('option',{value:c.slug,text:c.name}))}catch{}}
let started=false;
async function init(){const me=await R.me(true);const panel=$('#growth-panel');if(!me){if(panel)panel.hidden=true;return}
 if(panel)panel.hidden=false;if(started)return;started=true;await categories();
 const sel=$('#growth-product');if(!sel)return;
 try{const d=await api('/products'),items=Array.isArray(d.products)?d.products:[];sel.replaceChildren(...items.map(p=>el('option',{value:p.id,text:p.name})));
  if(!items.length){$('#growth-status').textContent='Publish a product to see its growth metrics.';return}
  const want=new URLSearchParams(location.search).get('product');if(want&&items.some(p=>p.id===want))sel.value=want;
  sel.addEventListener('change',loadGrowth);$('#growth-days').addEventListener('change',loadGrowth);await loadGrowth();
  if(location.hash==='#growth-panel')document.querySelector(location.hash)?.scrollIntoView?.()}
 catch(e){$('#growth-status').textContent=e.message}}
window.RequvaGrowth={render,init};
document.addEventListener('DOMContentLoaded',()=>setTimeout(init,400));
let lastUser;document.addEventListener('requva:auth',e=>{const id=e.detail?.id||null;if(id===lastUser)return;lastUser=id;started=false;if(id)init();else{const p=$('#growth-panel');if(p)p.hidden=true}});
})();
