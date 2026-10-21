(()=>{
const API=(window.REQUVA_CONFIG?.apiBase||'').replace(/\/$/,''),list=document.getElementById('home-fresh');
if(!list)return;
function li(...kids){const n=document.createElement('li');for(const k of kids)n.append(k);return n}
fetch(API+'/api/v1/discover/products?sort=recent').then(r=>{if(!r.ok)throw Error('x');return r.json()}).then(d=>{
 const items=(d.products||[]).slice(0,5);
 if(!items.length){list.replaceChildren(li(Object.assign(document.createElement('small'),{textContent:'No products yet. Be the first to list one.'})));return}
 list.replaceChildren(...items.map(p=>{const a=document.createElement('a');a.href='/product.html?id='+encodeURIComponent(p.id);a.textContent=p.name;const s=document.createElement('small');s.textContent=p.tagline||(p.category||'New listing');return li(a,s)}))
}).catch(()=>{list.replaceChildren(li(Object.assign(document.createElement('small'),{textContent:'Directory unavailable right now.'})))});
})();
