/* Product sharing: canonical URL, share dialog, copy link with honest failure handling. */
(()=>{
const R=window.Requva,el=R.el;
const base=()=>(window.REQUVA_CONFIG?.siteUrl||location.origin).replace(/\/$/,'');
const validId=id=>/^[\w-]{4,64}$/.test(String(id||''));
const urlFor=id=>{if(!validId(id))throw Error('Invalid product id');return base()+'/p/'+encodeURIComponent(id)};
const blurb=p=>{const d=String(p.tagline||p.description||'').replace(/\s+/g,' ').trim();return d.length>140?d.slice(0,137)+'…':d};
function links(p){const url=urlFor(p.id),text=p.name+(blurb(p)?' — '+blurb(p):''),msg=text+'\n'+url,enc=encodeURIComponent,subject='Check out '+p.name+' on Requva';
 return{url,text,whatsapp:'https://wa.me/?text='+enc(msg),
  email:'mailto:?subject='+enc(subject)+'&body='+enc(text+'\n\n'+url),
  gmail:'https://mail.google.com/mail/?view=cm&fs=1&su='+enc(subject)+'&body='+enc(text+'\n\n'+url),
  x:'https://x.com/intent/post?text='+enc(text)+'&url='+enc(url),
  linkedin:'https://www.linkedin.com/sharing/share-offsite/?url='+enc(url),
  facebook:'https://www.facebook.com/sharer/sharer.php?u='+enc(url)}}
async function copy(text,input){
 try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true}}catch{}
 try{if(input){input.focus();input.select();if(document.execCommand&&document.execCommand('copy'))return true}}catch{}
 if(input){input.focus();input.select()}return false}
let dialog=null,current=null;
function ensure(){if(dialog)return dialog;
 dialog=el('dialog',{id:'share-dialog','aria-labelledby':'share-title',class:'share-dialog'});document.body.append(dialog);
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close?.()});return dialog}
function open(p){
 if(!p||!validId(p.id))return;current=p;const l=links(p),d=ensure(),status=el('p',{class:'form-note',role:'status','aria-live':'polite',id:'share-status'}),input=el('input',{type:'text',readonly:true,value:l.url,'aria-label':'Product link',id:'share-link'});input.value=l.url;
 const copyBtn=el('button',{type:'button',class:'button button-dark',id:'share-copy'},'Copy link');
 copyBtn.addEventListener('click',async()=>{const ok=await copy(l.url,input);status.textContent=ok?'Link copied.':'Copying was blocked by your browser. The link is selected, press Ctrl+C or long press to copy it.'});
 const a=(label,href,id)=>el('a',{class:'button button-quiet',href,target:'_blank',rel:'noopener noreferrer',id},label);
 const close=el('button',{type:'button',class:'text-link','aria-label':'Close share dialog'},'Close');close.addEventListener('click',()=>d.close?d.close():d.removeAttribute('open'));
 const native=typeof navigator.share==='function'?el('button',{type:'button',class:'button button-lime',id:'share-native'},'Share using your device'):null;
 native?.addEventListener('click',async()=>{try{await navigator.share({title:p.name,text:l.text,url:l.url})}catch(e){if(e&&e.name!=='AbortError')status.textContent='Device sharing failed. Use one of the options below.'}});
 d.replaceChildren(el('h2',{id:'share-title',text:'Share '+p.name}),el('div',{class:'share-copy'},input,copyBtn),native,
  el('div',{class:'share-grid'},a('WhatsApp',l.whatsapp,'share-whatsapp'),a('Email',l.email,'share-email'),a('Gmail',l.gmail,'share-gmail'),a('X',l.x,'share-x'),a('LinkedIn',l.linkedin,'share-linkedin'),a('Facebook',l.facebook,'share-facebook')),
  el('p',{class:'form-note',text:'These buttons open each service\u2019s share screen with the text filled in. Nothing is posted until you confirm there.'}),status,close);
 if(d.showModal){if(!d.open)d.showModal()}else d.setAttribute('open','')}
window.RequvaShare={urlFor,links,copy,open,validId};
})();
