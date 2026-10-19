import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import app from '../src/index.js';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  sql.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  return {
    prepare(query) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async run() { const result=sql.prepare(query).run(...params); return { ...result, meta: { changes: Number(result.changes) } }; },
        async first() { return sql.prepare(query).get(...params) ?? null; },
        async all() { return { results: sql.prepare(query).all(...params) }; },
      };
    },
  };
}
const ORIGIN='https://requva.pages.dev';
function env(DB) { return {DB,FRONTEND_ORIGIN:ORIGIN,ADMIN_SETUP_TOKEN:'test-only-secret'}; }
async function call(DB,path,{method='GET',body,headers={}}={}) {
  const h=new Headers({Origin:ORIGIN,'X-Requested-With':'Requva','CF-Connecting-IP':Math.random().toString(),...headers});
  if(body!==undefined)h.set('Content-Type','application/json');
  return app.fetch(new Request(`https://api.example.test/api/v1${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env(DB));
}
function cookie(response){const value=response.headers.get('Set-Cookie');assert.ok(value,'expected session cookie');return value.split(';')[0]}
async function payload(response){const data=await response.json();return data}

test('health endpoint and origin/CSRF checks',async()=>{
 const DB=database();let r=await call(DB,'/health');assert.equal(r.status,200);assert.equal((await payload(r)).ok,true);
 r=await app.fetch(new Request('https://api.example.test/api/v1/auth/register',{method:'POST',headers:{Origin:'https://attacker.invalid','X-Requested-With':'Requva','Content-Type':'application/json'},body:'{}'}),env(DB));assert.equal(r.status,403);
 r=await app.fetch(new Request(`https://api.example.test/api/v1/auth/register`,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{}'}),env(DB));assert.equal(r.status,403);
});

test('admin bootstrap, account auth, product ownership, campaign and consent-based tester feedback',async()=>{
 const DB=database();let r=await call(DB,'/admin/setup',{method:'POST',body:{setup_token:'test-only-secret',email:'admin@example.com',password:'admin-password-123'}});assert.equal(r.status,201);const adminCookie=cookie(r);
 r=await call(DB,'/auth/register',{method:'POST',body:{email:'owner@example.com',password:'founder-password-123'}});assert.equal(r.status,201);let ownerCookie=cookie(r);
 r=await call(DB,'/auth/register',{method:'POST',body:{email:'tester@example.com',password:'tester-password-123'}});assert.equal(r.status,201);const testerCookie=cookie(r);
 r=await call(DB,'/products',{method:'POST',headers:{Cookie:ownerCookie},body:{name:'Fieldnotes',url:'https://fieldnotes.example',description:'A shared project workspace for small design teams',stage:'idea'}});assert.equal(r.status,201);const product=(await payload(r)).product;
 r=await call(DB,'/campaigns',{method:'POST',headers:{Cookie:ownerCookie},body:{product_id:product.id,channel:'Communities',goal:'Learn which teams need a calmer planning space'}});assert.equal(r.status,201);assert.equal((await payload(r)).campaign.execution_mode,'manual');
 r=await call(DB,'/testers/join',{method:'POST',headers:{Cookie:testerCookie},body:{product_id:product.id}});assert.equal(r.status,201);
 r=await call(DB,'/feedback',{method:'POST',headers:{Cookie:testerCookie},body:{product_id:product.id,body:'The onboarding was clear; I got stuck when inviting a teammate.',consent:true}});assert.equal(r.status,201);
 r=await call(DB,'/analytics/summary',{headers:{Cookie:ownerCookie}});assert.equal(r.status,200);const stats=await payload(r);assert.equal(stats.campaignActivity,1);assert.equal(stats.feedbackCount,1);assert.equal(stats.visits,0);
 r=await call(DB,'/admin/summary',{headers:{Cookie:adminCookie}});assert.equal(r.status,200);assert.equal((await payload(r)).users,3);
 r=await call(DB,'/admin/summary',{headers:{Cookie:ownerCookie}});assert.equal(r.status,403);
 r=await call(DB,'/auth/password',{method:'POST',headers:{Cookie:ownerCookie},body:{current_password:'founder-password-123',new_password:'founder-password-456'}});assert.equal(r.status,200);assert.ok(r.headers.get('Set-Cookie'));ownerCookie=cookie(r);
 r=await call(DB,'/auth/me',{headers:{Cookie:ownerCookie}});assert.equal(r.status,200);
 r=await call(DB,'/analytics/events',{method:'POST',headers:{Cookie:ownerCookie},body:{product_id:product.id,event_type:'visit',source:'verified_integration'}});assert.equal(r.status,501);
});

