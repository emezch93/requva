/* Terms acceptance: inline on the legal pages (so people can read first), blocking dialog elsewhere. Server enforces; this is the interface. */
(()=>{
const R=window.Requva,el=R.el,api=R.api;
const READ=['/terms','/terms.html','/privacy','/privacy.html','/contact','/contact.html'];
const onReadPage=()=>READ.includes(location.pathname);
const fmt=iso=>{try{return new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}catch{return String(iso||'')}};
let dlg=null,busy=false;
function closeDialog(){if(dlg){dlg.close?dlg.close():dlg.removeAttribute('open');dlg.remove();dlg=null}}
function acceptForm(terms){
 const box=el('input',{type:'checkbox',id:'terms-accept-box'}),status=el('p',{class:'form-error',role:'alert'}),btn=el('button',{type:'button',class:'button button-dark',id:'terms-accept-btn'},'Accept and continue');
 const label=el('label',{class:'terms-check'},box,' I have read and accept the ',el('a',{href:'/terms.html',target:'_blank',rel:'noopener'},'Terms of use'),' and the ',el('a',{href:'/privacy.html',target:'_blank',rel:'noopener'},'Privacy notice'),' (version '+terms.current+').');
 btn.addEventListener('click',async()=>{if(busy)return;if(!box.checked){status.textContent='Tick the box to confirm you have read and accept the terms.';return}
  busy=true;btn.disabled=true;status.textContent='';
  try{await api('/auth/terms/accept',{method:'POST',body:JSON.stringify({version:terms.current,accepted:true})});closeDialog();document.dispatchEvent(new CustomEvent('requva:terms-accepted'));await sync(true)}
  catch(e){status.textContent=e.message}finally{busy=false;btn.disabled=false}});
 return el('div',{class:'terms-accept'},label,btn,status)}
function openDialog(terms){
 if(dlg)return;dlg=el('dialog',{id:'terms-dialog','aria-labelledby':'terms-dialog-title',class:'share-dialog'});
 dlg.addEventListener('cancel',e=>e.preventDefault());
 const out=el('button',{type:'button',class:'text-link'},'Log out instead');out.addEventListener('click',()=>R.logout());
 dlg.append(el('h2',{id:'terms-dialog-title',text:'Please accept the Terms of use'}),el('p',{text:'We have terms to keep Requva fair and safe. Read them, then accept to continue. You can keep browsing without accepting, but you cannot make changes.'}),el('p',{},el('a',{href:'/terms.html',target:'_blank',rel:'noopener'},'Read the Terms of use (opens in a new tab)')),acceptForm(terms),out);
 document.body.append(dlg);if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','')}
function render(user){
 const slot=document.querySelector('#terms-status');
 if(!user){closeDialog();slot?.replaceChildren(el('p',{class:'form-note',text:'Log in or create an account to accept these terms. Creating an account asks you to accept them.'}));return}
 const t=user.terms;if(!t)return;
 if(!t.required){closeDialog();slot?.replaceChildren(el('p',{class:'terms-ok',text:'You accepted version '+t.accepted_version+' on '+fmt(t.accepted_at)+'.'}));return}
 if(onReadPage()){slot?.replaceChildren(el('p',{text:'Read the terms below, then accept this version to keep making changes on Requva.'}),acceptForm(t));return}
 openDialog(t)}
async function sync(force){render(await R.me(force))}
window.RequvaTerms={sync,render};
document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>sync(),80));
document.addEventListener('requva:auth',()=>sync(true));
document.addEventListener('requva:terms-required',()=>sync(true));
})();
