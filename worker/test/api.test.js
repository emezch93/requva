import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import app from '../src/index.js';

const ORIGIN='https://requva.pages.dev';
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 sql.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0002_ai_campaigns_and_tracking.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0003_distribution_workflows.sql',import.meta.url),'utf8'));
 const prepare=query=>{let params=[];return{bind(...values){params=values;return this},run(){const r=sql.prepare(query).run(...params);return{...r,meta:{changes:Number(r.changes)}}},first(){return sql.prepare(query).get(...params)??null},all(){return{results:sql.prepare(query).all(...params)}}}};
 return{prepare,batch(statements){sql.exec('SAVEPOINT d1_batch');try{const out=statements.map(s=>s.run());sql.exec('RELEASE d1_batch');return out}catch(error){sql.exec('ROLLBACK TO d1_batch');sql.exec('RELEASE d1_batch');throw error}},close(){sql.close()},sql};
}
function env(DB,extra={}){return{DB,FRONTEND_ORIGIN:ORIGIN,AI_ENABLED:'false',...extra}}
async function call(DB,path,{method='GET',body,headers={},extra={}}={}){
 const h=new Headers({Origin:ORIGIN,'X-Requested-With':'Requva','CF-Connecting-IP':crypto.randomUUID(),...headers});
 if(body!==undefined)h.set('Content-Type','application/json');
 return app.fetch(new Request('https://api.example.test/api/v1'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env(DB,extra));
}
const cookie=r=>{const value=r.headers.get('Set-Cookie');assert.ok(value,'expected session cookie');return value.split(';')[0]};
const payload=r=>r.json();
const recovery={recovery_question:'private_phrase',recovery_answer:'a long secret phrase I can remember'};
async function signup(DB,email='owner@example.com'){
 const r=await call(DB,'/auth/register',{method:'POST',body:{email,password:'founder-password-123',...recovery}});
 assert.equal(r.status,201,await r.clone().text());return{cookie:cookie(r),user:(await payload(r)).user};
}

test('register, me, login, logout, and recovery reset use Workers-supported 100k PBKDF2',async()=>{
 const DB=database();const account=await signup(DB);assert.equal(account.user.email,'owner@example.com');
 let r=await call(DB,'/auth/me');assert.equal(r.status,200);assert.equal((await payload(r)).user,null);
 r=await call(DB,'/auth/me',{headers:{Cookie:account.cookie}});assert.equal((await payload(r)).user.id,account.user.id);
 r=await call(DB,'/auth/login',{method:'POST',body:{email:account.user.email,password:'founder-password-123'}});assert.equal(r.status,200);const loggedIn=cookie(r);
 r=await call(DB,'/auth/reset',{method:'POST',body:{email:account.user.email,...recovery,new_password:'founder-password-456'}});assert.equal(r.status,200,await r.clone().text());
 r=await call(DB,'/auth/me',{headers:{Cookie:loggedIn}});assert.equal((await payload(r)).user,null,'reset revokes prior sessions');
 r=await call(DB,'/auth/login',{method:'POST',body:{email:account.user.email,password:'founder-password-456'}});assert.equal(r.status,200);
});
test('product, campaign, tester, consent feedback, analytics, and duplicate-safe tracking events',async()=>{
 const DB=database();const owner=await signup(DB);const tester=await signup(DB,'tester@example.com');
 let r=await call(DB,'/products',{method:'POST',headers:{Cookie:owner.cookie},body:{name:'Fieldnotes',url:'https://fieldnotes.example',description:'Shared project workspace for small design teams',stage:'idea'}});assert.equal(r.status,201);const product=(await payload(r)).product;DB.sql.prepare("UPDATE products SET listing_status='approved' WHERE id=?").run(product.id);
 r=await call(DB,'/campaigns',{method:'POST',headers:{Cookie:owner.cookie},body:{product_id:product.id,channel:'Communities',goal:'Learn which teams need this'}});assert.equal(r.status,201);assert.equal((await payload(r)).campaign.execution_mode,'manual');
 r=await call(DB,'/testers/join',{method:'POST',headers:{Cookie:tester.cookie},body:{product_id:product.id}});assert.equal(r.status,201);
 r=await call(DB,'/testers/join',{method:'POST',headers:{Cookie:tester.cookie},body:{product_id:product.id}});assert.equal(r.status,409);
 r=await call(DB,'/feedback',{method:'POST',headers:{Cookie:tester.cookie},body:{product_id:product.id,body:'Onboarding was clear; inviting a teammate was confusing.',consent:true}});assert.equal(r.status,201);
 r=await call(DB,'/analytics/summary',{headers:{Cookie:owner.cookie}});assert.equal(r.status,200);let stats=await payload(r);assert.equal(stats.feedbackCount,1);assert.equal(stats.visits,0);
 r=await call(DB,'/integrations/token',{method:'POST',headers:{Cookie:owner.cookie},body:{product_id:product.id}});assert.equal(r.status,201);const token=(await payload(r)).token;
 const send=()=>app.fetch(new Request('https://api.example.test/api/v1/analytics/events',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','CF-Connecting-IP':crypto.randomUUID()},body:JSON.stringify({event_type:'visit',event_key:'first-visit'})}),env(DB));
 r=await send();assert.equal(r.status,201);r=await send();assert.equal((await payload(r)).duplicate,true);
 r=await call(DB,'/analytics/summary',{headers:{Cookie:owner.cookie}});stats=await payload(r);assert.equal(stats.visits,1);
});
test('guest, CSRF, and admin access boundaries are enforced',async()=>{
 const DB=database();let r=await call(DB,'/health');assert.equal((await payload(r)).passwordHashIterations,100000);r=await call(DB,'/auth/me');assert.equal(r.status,200);assert.equal((await payload(r)).user,null);
 r=await call(DB,'/products');assert.equal(r.status,401);
 r=await app.fetch(new Request('https://api.example.test/api/v1/auth/register',{method:'POST',headers:{Origin:'https://attacker.invalid','X-Requested-With':'Requva','Content-Type':'application/json'},body:'{}'}),env(DB));assert.equal(r.status,403);
 const user=await signup(DB,'ordinary@example.com');r=await call(DB,'/admin/ai/status',{headers:{Cookie:user.cookie}});assert.equal(r.status,403);
 DB.sql.prepare('UPDATE users SET role=? WHERE id=?').run('admin',user.user.id);
 r=await call(DB,'/admin/ai/status',{headers:{Cookie:user.cookie},extra:{AI_ENABLED:'true',GEMINI_API_KEY:'secret-value'}});assert.equal(r.status,200);const status=await payload(r);assert.equal(status.configured,true);assert.equal(JSON.stringify(status).includes('secret-value'),false);
 r=await call(DB,'/admin/ai/settings',{method:'POST',headers:{Cookie:user.cookie},extra:{AI_ENABLED:'true'},body:{enabled:true,daily_limit:7,fast_model:'gemini-3.5-flash-lite',reasoning_model:'gemini-3.8-flash'}});assert.equal(r.status,200);assert.equal(JSON.parse(DB.sql.prepare("SELECT value_json FROM settings WHERE key='ai.config'").get().value_json).daily_limit,7);
});
test('Gemini stays server-side, uses the configured key, and records usage',async()=>{
 const DB=database(),user=await signup(DB);
 let productResponse=await call(DB,'/products',{method:'POST',headers:{Cookie:user.cookie},body:{name:'Fieldnotes',url:'https://fieldnotes.example',description:'Shared workspace for design teams',stage:'idea'}});const product=(await payload(productResponse)).product;
 const expected={summary:'Try one focused community interview.',evidence:['Founder-provided description only.'],audiences:[{label:'Small design teams',why:'They may share the coordination problem.'}],channels:[{name:'Communities',fit:'Relevant peers can give feedback.',first_step:'Ask a moderator before posting.'}],draft:{headline:'Testing a calmer workspace',body:'I am looking for a few teams to try this.',call_to_action:'Reply if interested.'},actions:[{priority:'high',title:'Interview teams',reason:'Learn before scaling.',next_step:'Talk to three relevant teams.'}],uncertainties:['The website was not fetched.']};
 const originalFetch=globalThis.fetch;let sentKey=null;
 globalThis.fetch=async(_url,options)=>{sentKey=new Headers(options.headers).get('x-goog-api-key');return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(expected)}]}}]}),{status:200,headers:{'Content-Type':'application/json'}})};
 try{
  const r=await call(DB,'/ai/product-analysis',{method:'POST',headers:{Cookie:user.cookie},body:{product_id:product.id},extra:{AI_ENABLED:'true',GEMINI_API_KEY:'test-secret-not-returned',GEMINI_FAST_MODEL:'gemini-3.5-flash-lite',GEMINI_REASONING_MODEL:'gemini-3.8-flash'}});
  assert.equal(r.status,200,await r.clone().text());const result=await payload(r);assert.equal(result.result.summary,expected.summary);assert.equal(sentKey,'test-secret-not-returned');assert.equal(JSON.stringify(result).includes('test-secret-not-returned'),false);
  const usage=DB.sql.prepare('SELECT outcome,feature FROM ai_usage').get();assert.equal(usage.outcome,'success');assert.equal(usage.feature,'product_analysis');
 }finally{globalThis.fetch=originalFetch;DB.close()}
});

test('distribution opportunities require admin verification and owner completion requires independent review',async()=>{
 const DB=database(),owner=await signup(DB,'founder@example.com'),admin=await signup(DB,'admin@example.com'),tester=await signup(DB,'volunteer@example.com');
 DB.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.user.id);
 let r=await call(DB,'/products',{method:'POST',headers:{Cookie:owner.cookie},body:{name:'Fieldnotes',url:'https://fieldnotes.example',description:'A shared workspace for small design teams',problem:'Project context is scattered',audience:'Small design teams',category:'Productivity',objective:'Learn if teams return',feedback_target:'Onboarding clarity',stage:'idea'}});
 assert.equal(r.status,201,await r.clone().text());const product=(await payload(r)).product;
 assert.equal(product.listing_status,'pending');
 r=await call(DB,'/admin/products/'+product.id,{method:'PATCH',headers:{Cookie:admin.cookie},body:{listing_status:'approved'}});assert.equal(r.status,200);
 r=await call(DB,'/products/'+product.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{description:'Updated launch details for review.'}});assert.equal(r.status,200);r=await call(DB,'/discover/products');assert.equal((await payload(r)).products.length,0,'changing public listing details returns it to moderation');r=await call(DB,'/admin/products/'+product.id,{method:'PATCH',headers:{Cookie:admin.cookie},body:{listing_status:'approved'}});assert.equal(r.status,200);
 r=await call(DB,'/admin/distribution/opportunities',{method:'POST',headers:{Cookie:admin.cookie},body:{name:'Design team community',destination_url:'https://community.example/join',source_url:'https://community.example/rules',channel:'Communities',audience:'Small design teams',rationale:'Members discuss team workflows',requirements:'Ask moderators before sharing',eligibility:'Product founders',next_action:'Read posting rules',last_verified_at:'2026-10-19'}});
 assert.equal(r.status,201,await r.clone().text());const opportunity=(await payload(r)).opportunity;assert.equal(opportunity.status,'needs_review');
 r=await call(DB,'/distribution/opportunities',{headers:{Cookie:owner.cookie}});assert.equal((await payload(r)).opportunities.length,0);
 r=await call(DB,'/admin/distribution/opportunities/'+opportunity.id,{method:'PATCH',headers:{Cookie:admin.cookie},body:{status:'verified'}});assert.equal(r.status,200);
 r=await call(DB,'/distribution/opportunities',{headers:{Cookie:owner.cookie}});assert.equal((await payload(r)).opportunities.length,1);
 r=await call(DB,'/admin/distribution/opportunities/'+opportunity.id,{method:'PATCH',headers:{Cookie:admin.cookie},body:{rationale:'Updated after checking current community rules.'}});assert.equal(r.status,200);assert.equal((await payload(r)).status,'needs_review');r=await call(DB,'/distribution/opportunities',{headers:{Cookie:owner.cookie}});assert.equal((await payload(r)).opportunities.length,0,'editing a verified listing sends it back to review');r=await call(DB,'/admin/distribution/opportunities/'+opportunity.id,{method:'PATCH',headers:{Cookie:admin.cookie},body:{status:'verified'}});assert.equal(r.status,200);
 r=await call(DB,'/testing/requests',{method:'POST',headers:{Cookie:owner.cookie},body:{product_id:product.id,tester_type:'Small design team leads',instructions:'Try the first project setup flow.',eligibility:'Currently managing a small team',effort_minutes:15,feedback_questions:'What felt confusing?',consent_terms:'Your feedback is shared with the product owner.'}});
 assert.equal(r.status,201,await r.clone().text());const request=(await payload(r)).request;
 r=await call(DB,'/discover/products');let listing=(await payload(r)).products[0];assert.equal(listing.testing_request_id,request.id);assert.equal(listing.feedback_questions,'What felt confusing?');
 r=await call(DB,'/testers/join',{method:'POST',headers:{Cookie:tester.cookie},body:{product_id:product.id,testing_request_id:request.id}});assert.equal(r.status,400);
 r=await call(DB,'/testers/join',{method:'POST',headers:{Cookie:tester.cookie},body:{product_id:product.id,testing_request_id:request.id,consent:true}});assert.equal(r.status,201,await r.clone().text());
 assert.equal(DB.sql.prepare('SELECT testing_consent_terms FROM testers WHERE user_id=?').get(tester.user.id).testing_consent_terms,'Your feedback is shared with the product owner.');
 r=await call(DB,'/testers/start',{method:'POST',headers:{Cookie:tester.cookie},body:{product_id:product.id}});assert.equal(r.status,200);
 r=await call(DB,'/feedback',{method:'POST',headers:{Cookie:tester.cookie},body:{product_id:product.id,body:'Setup was straightforward.',consent:true}});assert.equal(r.status,201);
 r=await call(DB,'/testing/requests',{headers:{Cookie:owner.cookie}});assert.equal((await payload(r)).requests[0].feedback_count,1);
 r=await call(DB,'/distribution/activities',{method:'POST',headers:{Cookie:owner.cookie},body:{product_id:product.id,opportunity_id:opportunity.id,title:'Ask community moderators',planned_action:'Review current rules and request approval before posting.',draft:'I am testing a new workspace and would value feedback.',next_action:'Read the pinned community rules.'}});
 assert.equal(r.status,201,await r.clone().text());const activity=(await payload(r)).activity;
 r=await call(DB,'/distribution/activities/'+activity.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'reported_completed',external_url:'https://community.example/posts/123',evidence_notes:'The post is visible at the linked URL.'}});assert.equal(r.status,200);assert.equal((await payload(r)).status,'reported_completed');
 r=await call(DB,'/distribution/activities/'+activity.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'verified_completed'}});assert.equal(r.status,403);
 r=await call(DB,'/admin/distribution/activities/'+activity.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'verified_completed',verification_notes:'The linked post is public and matches this plan.'}});assert.equal(r.status,403);
 r=await call(DB,'/admin/distribution/activities/'+activity.id,{method:'PATCH',headers:{Cookie:admin.cookie},body:{status:'verified_completed',verification_notes:'The linked post is public and matches this plan.'}});assert.equal(r.status,200);
 r=await call(DB,'/products/'+product.id+'/reports',{method:'POST',headers:{Cookie:tester.cookie},body:{category:'misleading',details:'Please check the description.'}});assert.equal(r.status,201);
 r=await call(DB,'/admin/product-reports',{headers:{Cookie:admin.cookie}});assert.equal((await payload(r)).reports.length,1);
 DB.close();
});
