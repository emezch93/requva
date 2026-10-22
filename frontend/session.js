/* Shared browser helpers: one API client, one memoised session lookup, one DOM builder. */
(()=>{
const API=(window.REQUVA_CONFIG?.apiBase||'').replace(/\/$/,'');
const tok=()=>{try{return localStorage.getItem('requva_token')}catch{return null}};
const setToken=t=>{try{t?localStorage.setItem('requva_token',t):localStorage.removeItem('requva_token')}catch{}};
function el(tag,attrs={},...kids){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(v===undefined||v===null||v===false)continue;if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else n.setAttribute(k,v===true?'':v)}for(const c of kids.flat(Infinity)){if(c==null||c===false)continue;n.append(c.nodeType?c:document.createTextNode(String(c)))}return n}
async function api(path,options={}){
 if(!API)throw Object.assign(new Error('The API address is not configured.'),{status:0});
 let r;try{r=await fetch(API+'/api/v1'+path,{...options,credentials:'include',headers:{'Content-Type':'application/json','X-Requested-With':'Requva',...(tok()?{Authorization:'Bearer '+tok()}:{}),...(options.headers||{})}})}
 catch{throw Object.assign(new Error('Could not reach Requva. Check your connection and try again.'),{status:0})}
 const d=await r.json().catch(()=>({}));
 if(!r.ok){if(d.code==='TERMS_REQUIRED')document.dispatchEvent(new CustomEvent('requva:terms-required'));throw Object.assign(new Error(d.error||'Request failed ('+r.status+')'),{status:r.status,code:d.code,capability:d.capability})}
 return d}
let mePromise=null;
const me=force=>{if(!mePromise||force)mePromise=api('/auth/me').then(d=>d.user||null).catch(()=>null);return mePromise};
async function logout(){try{await api('/auth/logout',{method:'POST',body:'{}'})}catch{}setToken(null);mePromise=null;location.reload()}
window.Requva={API,tok,setToken,el,api,me,logout};
document.addEventListener('DOMContentLoaded',()=>{if(!window.__requvaApp)document.querySelector('#logout-nav')?.addEventListener('click',logout)});
})();
