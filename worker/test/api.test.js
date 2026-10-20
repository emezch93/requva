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
 sql.exec(readFileSync(new URL('../migrations/0004_operational_reporting.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0005_self_service_publishing.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0006_user_capabilities.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0007_directory.sql',import.meta.url),'utf8'));
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
 const r=await call(DB,'/auth/register',{method:'POST',body:{email,password:'founder-password-123',capabilities:['founder','product_user','tester'],...recovery}});
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
 const DB=database();let r=await call(DB,'/health');const health=await payload(r);assert.equal(health.passwordHashIterations,100000);assert.equal(health.schemaVersion,7);r=await call(DB,'/auth/me');assert.equal(r.status,200);assert.equal((await payload(r)).user,null);
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
  const plan=await call(DB,'/ai/campaign-plan',{method:'POST',headers:{Cookie:user.cookie},body:{product_id:product.id,channel:'Communities',goal:'Learn from relevant users'},extra:{AI_ENABLED:'true',GEMINI_API_KEY:'test-secret-not-returned',GEMINI_FAST_MODEL:'gemini-3.5-flash-lite',GEMINI_REASONING_MODEL:'gemini-3.8-flash'}});
  assert.equal(plan.status,201,await plan.clone().text());assert.ok((await payload(plan)).campaign.id);
  const stats=await call(DB,'/analytics/summary',{headers:{Cookie:user.cookie}});assert.equal((await payload(stats)).campaignActivity,0,'AI campaign plans are not completed distribution activity');
 }finally{globalThis.fetch=originalFetch;DB.close()}
});

test('campaign plans stay out of activity totals until an evidenced owner report',async()=>{
 const DB=database(),owner=await signup(DB,'campaign-owner@example.com');
 let r=await call(DB,'/products',{method:'POST',headers:{Cookie:owner.cookie},body:{name:'Workpad',url:'https://workpad.example',description:'A shared workspace for small teams',stage:'idea'}});
 assert.equal(r.status,201);const product=(await payload(r)).product;
 r=await call(DB,'/campaigns',{method:'POST',headers:{Cookie:owner.cookie},body:{product_id:product.id,channel:'Communities',goal:'Learn from relevant users'}});
 assert.equal(r.status,201);const campaign=(await payload(r)).campaign;
 r=await call(DB,'/analytics/summary',{headers:{Cookie:owner.cookie}});assert.equal((await payload(r)).campaignActivity,0,'a saved plan is not executed work');
 DB.sql.prepare("INSERT INTO analytics_events(id,owner_id,product_id,event_type,source) VALUES(?,?,?,'campaign_activity','manual')").run(crypto.randomUUID(),owner.user.id,product.id);
 const legacy=await call(DB,'/analytics/summary',{headers:{Cookie:owner.cookie}});assert.equal((await payload(legacy)).campaignActivity,0,'legacy plan events remain stored but are excluded from execution totals');
 assert.equal(DB.sql.prepare("SELECT COUNT(*) AS n FROM analytics_events WHERE event_type='campaign_activity'").get().n,1,'legacy record is preserved');
 r=await call(DB,'/campaigns/'+campaign.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'completed'}});assert.equal(r.status,409,'campaign must be started before completion');
 r=await call(DB,'/campaigns/'+campaign.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'in_progress'}});assert.equal(r.status,200);
 r=await call(DB,'/campaigns/'+campaign.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'completed'}});assert.equal(r.status,400,'completion needs evidence');
 r=await call(DB,'/campaigns/'+campaign.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'completed',completion_notes:'Read the community rules and submitted an approved product post.'}});assert.equal(r.status,200);
 r=await call(DB,'/analytics/summary',{headers:{Cookie:owner.cookie}});assert.equal((await payload(r)).campaignActivity,1,'a reported action is counted once');
 r=await call(DB,'/campaigns/'+campaign.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'in_progress'}});assert.equal(r.status,409,'a completed report is final');
 r=await call(DB,'/analytics/summary',{headers:{Cookie:owner.cookie}});assert.equal((await payload(r)).campaignActivity,1);
 DB.close();
});
test('owners can manage testing-request availability and cannot reopen expired requests',async()=>{
 const DB=database(),owner=await signup(DB,'request-owner@example.com'),other=await signup(DB,'other-owner@example.com');
 let r=await call(DB,'/products',{method:'POST',headers:{Cookie:owner.cookie},body:{name:'Testable',url:'https://testable.example',description:'A product looking for useful feedback'}});
 const product=(await payload(r)).product;
 const create=async(closes_at)=>{const data={product_id:product.id,tester_type:'Early users',instructions:'Try the signup flow.',feedback_questions:'What was confusing?',consent_terms:'Feedback will be shared with the founder.'};if(closes_at)data.closes_at=closes_at;const response=await call(DB,'/testing/requests',{method:'POST',headers:{Cookie:owner.cookie},body:data});assert.equal(response.status,201,await response.clone().text());return(await payload(response)).request.id};
 const openId=await create();
 r=await call(DB,'/testing/requests/'+openId,{method:'PATCH',headers:{Cookie:other.cookie},body:{status:'closed'}});assert.equal(r.status,404,'another owner cannot manage this request');
 r=await call(DB,'/testing/requests/'+openId,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'paused'}});assert.equal(r.status,200);
 r=await call(DB,'/testing/requests/'+openId,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'open'}});assert.equal(r.status,200);
 const expiredId=await create('2000-01-01');
 r=await call(DB,'/testing/requests/'+expiredId,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'open'}});assert.equal(r.status,400);
 DB.close();
});
test('distribution opportunities require admin verification and owner completion requires independent review',async()=>{
 const DB=database(),owner=await signup(DB,'founder@example.com'),admin=await signup(DB,'admin@example.com'),tester=await signup(DB,'volunteer@example.com');
 DB.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.user.id);
 let r=await call(DB,'/products',{method:'POST',headers:{Cookie:owner.cookie},body:{name:'Fieldnotes',url:'https://fieldnotes.example',description:'A shared workspace for small design teams',problem:'Project context is scattered',audience:'Small design teams',category:'Productivity',objective:'Learn if teams return',feedback_target:'Onboarding clarity',stage:'idea'}});
 assert.equal(r.status,201,await r.clone().text());const product=(await payload(r)).product;
 assert.equal(product.listing_status,'approved');assert.equal(product.published,true);
 r=await call(DB,'/discover/products');assert.equal((await payload(r)).products.length,1,'valid product is public without admin approval');
 r=await call(DB,'/products/'+product.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{description:'Updated launch details for the public listing.'}});assert.equal(r.status,200);r=await call(DB,'/discover/products');assert.equal((await payload(r)).products.length,1,'a clean edit stays published without review');
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
 r=await call(DB,'/distribution/activities/'+activity.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'blocked'}});assert.equal(r.status,400,'blocked work requires a reason');
 r=await call(DB,'/distribution/activities/'+activity.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'blocked',notes:'The moderators have not replied yet.'}});assert.equal(r.status,200);
 r=await call(DB,'/distribution/activities/'+activity.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'reported_completed',external_url:'https://community.example/posts/123',evidence_notes:'The post is visible at the linked URL.'}});assert.equal(r.status,200);assert.equal((await payload(r)).status,'reported_completed');
 r=await call(DB,'/distribution/activities/'+activity.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'verified_completed'}});assert.equal(r.status,403);
 r=await call(DB,'/admin/distribution/activities/'+activity.id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'verified_completed',verification_notes:'The linked post is public and matches this plan.'}});assert.equal(r.status,403);
 r=await call(DB,'/admin/distribution/activities/'+activity.id,{method:'PATCH',headers:{Cookie:admin.cookie},body:{status:'verified_completed',verification_notes:'The linked post is public and matches this plan.'}});assert.equal(r.status,200);
 r=await call(DB,'/products/'+product.id+'/reports',{method:'POST',headers:{Cookie:tester.cookie},body:{category:'misleading',details:'Please check the description.'}});assert.equal(r.status,201);
 r=await call(DB,'/admin/product-reports',{headers:{Cookie:admin.cookie}});assert.equal((await payload(r)).reports.length,1);
 DB.close();
});

test('self-service publishing: invalid rejected, suspicious held, duplicates handled, reports restrict, owners cannot self-release',async()=>{
 const DB=database(),a=await signup(DB,'a@example.com'),b=await signup(DB,'b@example.com');
 const post=(who,body)=>call(DB,'/products',{method:'POST',headers:{Cookie:who.cookie},body});
 let r=await post(a,{name:'X',url:'not a url',description:'short'});assert.equal(r.status,400);assert.ok((await payload(r)).errors.length>=2);
 r=await post(a,{name:'Tidy Tools',url:'https://tidytools.example/app',description:'Small utilities for tidy spreadsheets'});assert.equal(r.status,201);const good=(await payload(r)).product;assert.equal(good.listing_status,'approved');
 r=await post(a,{name:'Tidy Tools Again',url:'https://www.tidytools.example/app/',description:'Same site submitted twice by owner'});assert.equal(r.status,409);
 r=await post(b,{name:'Copycat',url:'https://tidytools.example/app',description:'Someone else claiming the same address'});assert.equal(r.status,201);const dup=(await payload(r)).product;assert.equal(dup.listing_status,'pending');assert.equal(dup.published,false);assert.ok(dup.hold_reason);
 r=await post(b,{name:'Short',url:'https://bit.ly/abc123',description:'Uses a link shortener for the site'});assert.equal((await payload(r)).product.listing_status,'pending');
 r=await call(DB,'/discover/products');assert.deepEqual((await payload(r)).products.map(p=>p.id),[good.id],'held listings are not public');
 r=await call(DB,'/products/'+dup.id,{method:'PATCH',headers:{Cookie:b.cookie},body:{url:'https://copycat-original.example'}});assert.equal(r.status,200);
 r=await call(DB,'/discover/products');assert.equal((await payload(r)).products.length,2,'owner fix that passes screening releases a screening hold');
 const reporters=[];for(const e of ['r1@example.com','r2@example.com','r3@example.com'])reporters.push(await signup(DB,e));
 for(const rep of reporters){r=await call(DB,'/products/'+good.id+'/reports',{method:'POST',headers:{Cookie:rep.cookie},body:{category:'spam',details:'Looks wrong'}});assert.equal(r.status,201)}
 assert.equal(DB.sql.prepare('SELECT listing_status s FROM products WHERE id=?').get(good.id).s,'pending','three distinct reports hold the listing');
 r=await call(DB,'/products/'+good.id,{method:'PATCH',headers:{Cookie:a.cookie},body:{description:'Updated description that is still fine'}});assert.equal(r.status,200);
 assert.equal(DB.sql.prepare('SELECT listing_status s FROM products WHERE id=?').get(good.id).s,'pending','owner cannot release a report hold');
 DB.sql.prepare("UPDATE products SET listing_status='rejected',hold_source='moderator' WHERE id=?").run(dup.id);r=await call(DB,'/products/'+dup.id,{method:'PATCH',headers:{Cookie:b.cookie},body:{description:'Trying to edit my way out of a restriction'}});assert.equal(DB.sql.prepare('SELECT listing_status s FROM products WHERE id=?').get(dup.id).s,'rejected');
 r=await call(DB,'/products/'+good.id,{method:'PATCH',headers:{Cookie:b.cookie},body:{name:'Hijack'}});assert.equal(r.status,404,'other founders cannot edit');
 DB.close();
});
test('migration 0005 releases legacy pending listings that pass screening and preserves the rest',()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0001_initial','0002_ai_campaigns_and_tracking','0003_distribution_workflows','0004_operational_reporting'])sql.exec(readFileSync(new URL('../migrations/'+f+'.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO users(id,email,password_hash,password_salt,referral_code) VALUES('u','u@x.com','h','s','rc')");
 const ins=sql.prepare("INSERT INTO products(id,owner_id,name,url,description,listing_status) VALUES(?,?,?,?,?,?)");
 ins.run('ok','u','Legit','https://legit.example','A legitimate product description','pending');ins.run('short','u','Sneaky','https://bit.ly/zzz','Shortened link product here','pending');ins.run('rej','u','Banned','https://banned.example','Previously rejected listing text','rejected');
 sql.exec(readFileSync(new URL('../migrations/0005_self_service_publishing.sql',import.meta.url),'utf8'));
 const st=id=>sql.prepare('SELECT listing_status s,hold_source h FROM products WHERE id=?').get(id);
 assert.equal(st('ok').s,'approved');assert.equal(st('short').s,'pending');assert.equal(st('short').h,'screening');assert.equal(st('rej').s,'rejected');assert.equal(sql.prepare('SELECT COUNT(*) c FROM products').get().c,3);
 sql.close();
});

test('unified accounts: capabilities chosen at signup, activated later, enforced server-side',async()=>{
 const DB=database();
 let r=await call(DB,'/auth/register',{method:'POST',body:{email:'multi@example.com',password:'founder-password-123',capabilities:['product_user','bogus'],...recovery}});assert.equal(r.status,201);
 const c=cookie(r);assert.deepEqual((await payload(r)).user.capabilities,['product_user']);
 const product={name:'Capable',url:'https://capable.example',description:'A product made by a later founder'};
 r=await call(DB,'/products',{method:'POST',headers:{Cookie:c},body:product});assert.equal(r.status,403);assert.equal((await payload(r)).code,'CAPABILITY_REQUIRED');
 r=await call(DB,'/testers/join',{method:'POST',headers:{Cookie:c},body:{product_id:'x'}});assert.equal(r.status,403);
 r=await call(DB,'/auth/capabilities',{method:'POST',headers:{Cookie:c},body:{capability:'admin'}});assert.equal(r.status,400);
 r=await call(DB,'/auth/capabilities',{method:'POST',headers:{Cookie:c},body:{capability:'founder'}});assert.equal(r.status,200);
 r=await call(DB,'/auth/capabilities',{method:'POST',headers:{Cookie:c},body:{capability:'founder'}});assert.deepEqual((await payload(r)).capabilities.sort(),['founder','product_user']);
 r=await call(DB,'/products',{method:'POST',headers:{Cookie:c},body:product});assert.equal(r.status,201);
 r=await call(DB,'/auth/me',{headers:{Cookie:c}});assert.deepEqual((await payload(r)).user.capabilities.sort(),['founder','product_user'],'same account, no duplicate');
 assert.equal(DB.sql.prepare('SELECT COUNT(*) c FROM users').get().c,1);
 DB.close();
});
test('migration 0006 backfills capabilities from existing activity',()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0001_initial','0002_ai_campaigns_and_tracking','0003_distribution_workflows','0004_operational_reporting','0005_self_service_publishing'])sql.exec(readFileSync(new URL('../migrations/'+f+'.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO users(id,email,password_hash,password_salt,referral_code) VALUES('f','f@x.com','h','s','r1'),('t','t@x.com','h','s','r2'),('n','n@x.com','h','s','r3')");
 sql.exec("INSERT INTO products(id,owner_id,name,url,description) VALUES('p','f','P','https://p.example','Describes the product')");
 sql.exec("INSERT INTO testers(id,user_id,product_id) VALUES('x','t','p')");
 sql.exec(readFileSync(new URL('../migrations/0006_user_capabilities.sql',import.meta.url),'utf8'));
 const caps=id=>sql.prepare('SELECT capability c FROM user_capabilities WHERE user_id=? ORDER BY c').all(id).map(x=>x.c);
 assert.deepEqual(caps('f'),['founder','product_user']);assert.deepEqual(caps('t'),['product_user','tester']);assert.deepEqual(caps('n'),['product_user']);
 sql.close();
});

test('public directory: categories, search, filters, detail, tracked outbound clicks, owner-only stats',async()=>{
 const DB=database(),f=await signup(DB,'dir@example.com'),other=await signup(DB,'other@example.com');
 let r=await call(DB,'/discover/categories');const cats=(await payload(r)).categories;assert.equal(cats.length,9);
 const post=body=>call(DB,'/products',{method:'POST',headers:{Cookie:f.cookie},body});
 r=await post({name:'LedgerLite',url:'https://ledgerlite.example',tagline:'Bookkeeping for freelancers',description:'Track invoices and expenses without spreadsheets, built for solo freelancers in Nigeria.',problem:'Freelancers lose track of invoices',audience:'Freelancers',category_slug:'business-finance',pricing_model:'freemium',seeking:['testers','feedback'],stage:'launched'});assert.equal(r.status,201,await r.clone().text());const a=(await payload(r)).product;
 r=await post({name:'PixelPal',url:'https://pixelpal.example',description:'Design helper for social graphics and quick mockups',category_slug:'design-creative',pricing_model:'free'});assert.equal(r.status,201);
 r=await post({name:'Bad',url:'https://bad.example',description:'Has an invalid category slug here',category_slug:'nope'});assert.equal(r.status,400);
 r=await post({name:'Bad2',url:'https://bad2.example',description:'Has an invalid pricing model here',pricing_model:'gold'});assert.equal(r.status,400);
 r=await call(DB,'/discover/products?q=invoices');let d=await payload(r);assert.equal(d.total,1);assert.equal(d.products[0].name,'LedgerLite');assert.equal(JSON.stringify(d).includes('ledgerlite.example'),false,'raw website only exposed through the tracked link');
 r=await call(DB,'/discover/products?category=design-creative');assert.equal((await payload(r)).total,1);
 r=await call(DB,'/discover/products?pricing=free');assert.equal((await payload(r)).products[0].name,'PixelPal');
 r=await call(DB,'/discover/products?q=zzzznothing');assert.equal((await payload(r)).total,0);
 r=await call(DB,'/discover/products?testing=1');assert.equal((await payload(r)).total,0,'no open testing request yet');
 r=await call(DB,'/testing/requests',{method:'POST',headers:{Cookie:f.cookie},body:{product_id:a.id,tester_type:'Freelancers',instructions:'Create an invoice end to end.',eligibility:'Freelance work',effort_minutes:10,feedback_questions:'What was unclear?',consent_terms:'Feedback is shared with the owner.'}});assert.equal(r.status,201,await r.clone().text());
 r=await call(DB,'/discover/products?sort=testers');d=await payload(r);assert.deepEqual(d.products.map(p=>p.name),['LedgerLite']);
 r=await call(DB,'/discover/products/'+a.id);d=await payload(r);assert.equal(d.product.website_host,'ledgerlite.example');assert.ok(d.product.testing.instructions);assert.deepEqual(d.product.seeking.sort(),['feedback','testers']);
 r=await call(DB,'/discover/view/'+a.id+'?src=detail',{method:'POST'});assert.equal(r.status,201);
 r=await app.fetch(new Request('https://api.example.test/api/v1/go/'+a.id+'?src=search',{headers:{'CF-Connecting-IP':'9.9.9.9'}}),env(DB));assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'https://ledgerlite.example/');
 r=await call(DB,'/go/does-not-exist');assert.equal(r.status,404);
 assert.equal(DB.sql.prepare("SELECT COUNT(*) c FROM product_events WHERE product_id=? AND event_type='outbound_click'").get(a.id).c,1);
 r=await call(DB,'/products/'+a.id+'/discovery-stats?days=7',{headers:{Cookie:f.cookie}});d=await payload(r);assert.equal(r.status,200);assert.equal(d.listing_views,1);assert.equal(d.outbound_clicks,1);
 r=await call(DB,'/products/'+a.id+'/discovery-stats',{headers:{Cookie:other.cookie}});assert.equal(r.status,404,'other founders cannot read private stats');r=await call(DB,'/products/'+a.id+'/discovery-stats');assert.equal(r.status,401);
 DB.sql.prepare("UPDATE products SET status='paused' WHERE id=?").run(a.id);r=await call(DB,'/discover/products/'+a.id);assert.equal(r.status,404,'paused listings are not public');
 DB.close();
});
