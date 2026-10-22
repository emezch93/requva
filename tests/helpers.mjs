import {JSDOM} from 'jsdom';import fs from 'node:fs';
export const OPEN=[];
export const FRONT=new URL('../frontend/',import.meta.url);
export const read=f=>fs.readFileSync(new URL(f,FRONT),'utf8');
export const res=(data,status=200)=>({ok:status<400,status,json:async()=>data});
export const tick=(ms=20)=>new Promise(r=>setTimeout(r,ms));
export function mount(file,{url='https://requva.pages.dev/',fetch,scripts=[],pre}={}){
 const html=read(file).replace(/<script[^>]*><\/script>/g,'');
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;OPEN.push(w);
 w.REQUVA_CONFIG={apiBase:'https://api.test',siteUrl:'https://requva.pages.dev',contactEmail:''};
 const calls=[];w.fetch=async(u,o={})=>{const p=new URL(String(u));calls.push({method:o.method||'GET',path:p.pathname.replace('/api/v1',''),query:p.searchParams,headers:o.headers||{},body:o.body});return fetch(p.pathname.replace('/api/v1',''),p.searchParams,o,calls.at(-1))};
 w.confirm=()=>true;w.prompt=()=>'other';pre?.(w);
 for(const s of scripts)w.eval(read(s));
 return {w,d:w.document,calls}}
export const user={id:'u1',email:'a@b.c',role:'user',capabilities:['founder','product_user','tester']};
