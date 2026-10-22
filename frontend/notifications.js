/* In app notification centre. Shows only for signed in users; all data comes from /notifications. */
(()=>{
const R=window.Requva,el=R.el,api=R.api;
let btn=null,panel=null,count=null,list=null,more=null,nextBefore=null,timer=null,open=false;
const safeLink=l=>typeof l==='string'&&l.startsWith('/')&&!l.startsWith('//')?l:'/dashboard.html';
const ago=iso=>{const s=Math.max(0,(Date.now()-Date.parse(iso))/1000);if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+' min ago';if(s<86400)return Math.floor(s/3600)+' h ago';return Math.floor(s/86400)+' d ago'};
function setCount(n){if(!count)return;count.textContent=n>99?'99+':String(n);count.hidden=!n;btn.setAttribute('aria-label','Notifications, '+n+' unread')}
function item(n){const a=el('a',{href:safeLink(n.link),class:'notif-item'+(n.read_at?'':' unread'),'data-id':n.id},el('strong',{text:n.title}),n.body&&el('span',{text:n.body}),el('small',{text:ago(n.created_at)}));
 a.addEventListener('click',async e=>{if(n.read_at)return;e.preventDefault();try{await api('/notifications/'+encodeURIComponent(n.id)+'/read',{method:'POST',body:'{}'})}catch{}location.href=a.getAttribute('href')});return el('li',{},a)}
async function load(reset){if(!list)return;const status=panel.querySelector('.notif-status');status.textContent='Loading…';
 try{const q=new URLSearchParams({limit:'15'});if(!reset&&nextBefore)q.set('before',nextBefore);const d=await api('/notifications?'+q);if(reset)list.replaceChildren();for(const n of d.notifications||[])list.append(item(n));nextBefore=d.next_before||null;more.hidden=!nextBefore;setCount(d.unread_count||0);status.textContent=list.children.length?'':'No notifications yet. Activity on your products appears here.'}
 catch(e){status.textContent='Could not load notifications. '+(e.status===401?'Please log in again.':'Try again shortly.')}}
async function refreshCount(){try{const d=await api('/notifications?limit=1');setCount(d.unread_count||0)}catch{}}
function toggle(force){open=force===undefined?!open:force;panel.hidden=!open;btn.setAttribute('aria-expanded',String(open));if(open){nextBefore=null;load(true)}}
function build(){
 count=el('span',{class:'notif-count',hidden:true},'0');btn=el('button',{type:'button',class:'button button-quiet',id:'notif-toggle','aria-expanded':'false','aria-controls':'notif-panel'},'Alerts ',count);
 const markAll=el('button',{type:'button',class:'text-link'},'Mark all read');markAll.addEventListener('click',async()=>{try{await api('/notifications/read-all',{method:'POST',body:'{}'});nextBefore=null;load(true)}catch{}});
 list=el('ul',{class:'notif-list'});more=el('button',{type:'button',class:'text-link',hidden:true},'Load older');more.addEventListener('click',()=>load(false));
 panel=el('div',{id:'notif-panel',class:'notif-panel',role:'region','aria-label':'Notifications',hidden:true},el('div',{class:'notif-head'},el('strong',{text:'Notifications'}),markAll),el('p',{class:'form-note notif-status',role:'status','aria-live':'polite'}),list,more);
 btn.addEventListener('click',()=>toggle());document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){toggle(false);btn.focus()}});
 document.addEventListener('click',e=>{if(open&&!panel.contains(e.target)&&!btn.contains(e.target))toggle(false)});
 const host=document.querySelector('.top-actions');if(!host)return false;host.prepend(btn);host.append(panel);return true}
function sync(user){
 if(!user){clearInterval(timer);timer=null;btn?.remove();panel?.remove();btn=panel=count=list=more=null;return}
 if(btn)return;if(!build())return;refreshCount();timer=setInterval(()=>{if(!document.hidden)refreshCount()},60000)}
window.RequvaNotify={sync,refreshCount};
document.addEventListener('requva:auth',e=>sync(e.detail));
document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>R.me().then(sync),50));
})();
