/* Messages panel: conversations about feedback, with names, roles, locations, timestamps, read state, edit and delete. */
(()=>{
const R=window.Requva,{el,api}=R,$=s=>document.querySelector(s);
const fmt=iso=>{try{return new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}catch{return String(iso||'')}};
let filter='all',seq=0,started=false,timer=null,openKey=null,busy=false;
const who=a=>el('span',{class:'msg-who'},el('strong',{text:a.name}),' ',el('span',{class:'dir-badge',text:a.role}),a.location?el('span',{class:'msg-loc',text:' · '+a.location}):null);
const kindLabel=t=>t==='test'?'Test feedback':'Feedback';
async function loadList(quiet){
 const list=$('#msg-list'),status=$('#msg-list-status');if(!list)return;const my=++seq;if(!quiet)status.textContent='Loading conversations…';
 try{const d=await api('/threads'+(filter==='unread'?'?filter=unread':''));if(my!==seq)return;const items=Array.isArray(d.threads)?d.threads:[];
  const badge=$('#msg-unread-count');if(badge){badge.textContent=String(d.unread_total||0);badge.hidden=!d.unread_total}
  list.replaceChildren(...items.map(t=>{const key=t.type+':'+t.id,btn=el('button',{type:'button',class:'msg-item'+(t.unread?' unread':''),'aria-current':key===openKey?'true':null,'data-key':key},
    el('span',{class:'msg-item-top'},who(t.counterpart),t.unread?el('span',{class:'notif-count','aria-label':t.unread+' unread'},String(t.unread)):null),
    el('span',{class:'msg-item-meta',text:t.product.name+' · '+kindLabel(t.type)+(t.status==='withdrawn'?' · deleted':'')}),el('span',{class:'msg-item-preview',text:t.preview}),el('small',{text:fmt(t.last_activity)+(t.reply_count?' · '+t.reply_count+(t.reply_count===1?' reply':' replies'):'')}));
   btn.addEventListener('click',()=>openThread(t.type,t.id));return el('li',{},btn)}));
  status.textContent=items.length?'':(filter==='unread'?'No unread messages.':'No conversations yet. Feedback you send or receive appears here.')}
 catch(e){if(my!==seq)return;status.textContent=e.status===401?'Log in again to see your messages.':'Could not load conversations. '+e.message}}
function messageEl(m,t){
 const li=el('li',{class:'msg'+(m.mine?' mine':'')+(m.unread?' unread':'')+(m.deleted?' deleted':''),'data-id':m.id});
 const meta=el('div',{class:'msg-head'},who(m.author),el('time',{datetime:m.created_at,text:fmt(m.created_at)}),m.edited_at&&!m.deleted?el('span',{class:'msg-flag',text:'edited'}):null,m.unread?el('span',{class:'msg-flag msg-new',text:'New'}):null,m.mine&&!m.deleted?el('span',{class:'msg-flag',text:m.seen?'Seen':'Sent'}):null);
 const body=m.deleted?el('p',{class:'msg-body msg-deleted'},el('em',{text:'This message was deleted.'})):el('p',{class:'msg-body',text:m.body});
 const actions=el('div',{class:'msg-actions'});
 const url=m.is_root?'/threads/'+t.type+'/'+encodeURIComponent(t.id):'/messages/'+encodeURIComponent(m.id);
 if(m.can_edit){const b=el('button',{type:'button',class:'text-link'},'Edit');b.addEventListener('click',()=>{const ta=el('textarea',{rows:'3',maxlength:'2000','aria-label':'Edit your message'});ta.value=m.body;const err=el('p',{class:'form-error',role:'alert'}),save=el('button',{type:'button',class:'button button-dark'},'Save'),cancel=el('button',{type:'button',class:'text-link'},'Cancel');
   cancel.addEventListener('click',()=>openThread(t.type,t.id,true));save.addEventListener('click',async()=>{if(busy)return;busy=true;save.disabled=true;try{await api(url,{method:'PATCH',body:JSON.stringify({body:ta.value})});await openThread(t.type,t.id,true)}catch(e){err.textContent=e.message}finally{busy=false;save.disabled=false}});
   body.replaceWith(el('div',{class:'msg-edit'},ta,el('div',{},save,' ',cancel),err));actions.hidden=true});actions.append(b)}
 if(m.can_delete){const b=el('button',{type:'button',class:'text-link'},'Delete');b.addEventListener('click',async()=>{if(busy||!confirm('Delete this message? This cannot be undone.'))return;busy=true;try{await api(url,{method:'DELETE'});await openThread(t.type,t.id,true);loadList(true)}catch(e){alert(e.message)}finally{busy=false}});actions.append(b)}
 li.append(meta,body);if(actions.children.length)li.append(actions);return li}
async function openThread(type,id,keepScroll){
 const pane=$('#msg-thread');if(!pane)return;const my=++seq,key=type+':'+id;openKey=key;$('#msg-layout')?.classList.add('showing-thread');
 try{const d=await api('/threads/'+type+'/'+encodeURIComponent(id));if(my!==seq)return;const t=d.thread;
  const back=el('button',{type:'button',class:'text-link msg-back'},'← All conversations');back.addEventListener('click',()=>{$('#msg-layout')?.classList.remove('showing-thread');openKey=null});
  const ta=el('textarea',{rows:'3',maxlength:'2000',required:true,id:'msg-reply-body','aria-label':'Write a reply',placeholder:'Write a reply'}),err=el('p',{class:'form-error',role:'alert'}),send=el('button',{type:'submit',class:'button button-dark'},'Send reply');
  const form=el('form',{class:'msg-reply'},ta,send,err);
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;send.disabled=true;err.textContent='';try{await api('/threads/'+type+'/'+encodeURIComponent(id)+'/messages',{method:'POST',body:JSON.stringify({body:ta.value})});await openThread(type,id,true);loadList(true)}catch(x){err.textContent=x.message}finally{busy=false;send.disabled=false}});
  pane.replaceChildren(back,el('h3',{text:t.product.name}),el('p',{class:'form-note',text:kindLabel(type)+' · '+(t.viewer_role==='founder'?'You are the founder.':'You wrote the original message.')+' You can edit your own messages for '+t.edit_window_hours+' hours.'}),el('ul',{class:'msg-thread'},...d.messages.map(m=>messageEl(m,t))),t.can_reply?form:el('p',{class:'form-note',text:'This conversation is closed because the original message was deleted.'}));
  if(!keepScroll)pane.scrollIntoView?.({block:'nearest'});
  if(d.unread_count>0){try{await api('/threads/'+type+'/'+encodeURIComponent(id)+'/read',{method:'POST',body:'{}'});loadList(true);window.RequvaNotify?.refreshCount?.()}catch{}}}
 catch(e){if(my!==seq)return;pane.replaceChildren(el('p',{class:'dir-error',role:'alert'},e.status===404?'This conversation is no longer available.':e.message))}}
async function init(){
 const panel=$('#messages-panel');if(!panel)return;const me=await R.me(true);
 if(!me){panel.hidden=true;clearInterval(timer);timer=null;started=false;return}
 panel.hidden=false;if(started)return;started=true;
 panel.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;panel.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));loadList()}));
 await loadList();timer=setInterval(()=>{if(!document.hidden&&!panel.hidden)loadList(true)},60000);
 const m=(new URLSearchParams(location.search).get('thread')||'').match(/^(voluntary|test):([\w-]+)$/);if(m){await openThread(m[1],m[2]);panel.scrollIntoView?.()}}
window.RequvaMessages={init,openThread,loadList};
let lastUser;document.addEventListener('requva:auth',e=>{const id=e.detail?.id||null;if(id===lastUser)return;lastUser=id;started=false;init()});
document.addEventListener('DOMContentLoaded',()=>setTimeout(init,450));
})();
