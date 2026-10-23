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
 sql.exec(readFileSync(new URL('../migrations/0008_general_feedback.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0009_hardening.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0010_notifications.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0011_messaging_terms_shares.sql',import.meta.url),'utf8'));
 const prepare=query=>{let params=[];return{bind(...values){params=values;return this},run(){const r=sql.prepare(query).run(...params);return{...r,meta:{changes:Number(r.changes)}}},first(){return sql.prepare(query).get(...params)??null},all(){return{results:sql.prepare(query).all(...params)}}}};
 return{prepare,batch(statements){sql.exec('SAVEPOINT d1_batch');try{const out=statements.map(s=>s.run());sql.exec('RELEASE d1_batch');return out}catch(error){sql.exec('ROLLBACK TO d1_batch');sql.exec('RELEASE d1_batch');throw error}},close(){sql.close()},sql};
}
function env(DB,extra={}){return{DB,FRONTEND_ORIGIN:ORIGIN,AI_ENABLED:'false',...extra}}
async function call(DB,path,{method='GET',body,headers={},extra={}}={}){
 const h=new Headers({Origin:ORIGIN,'X-Requested-With':'Requva','CF-Connecting-IP':crypto.randomUUID(),'User-Agent':'Mozilla/5.0 (test)',...headers});
 if(body!==undefined)h.set('Content-Type','application/json');
 return app.fetch(new Request('https://api.example.test/api/v1'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env(DB,extra));
}
const cookie=r=>{const value=r.headers.get('Set-Cookie');assert.ok(value,'expected session cookie');return value.split(';')[0]};
const payload=r=>r.json();
const recovery={recovery_question:'private_phrase',recovery_answer:'a long secret phrase I can remember'};
async function signup(DB,email='owner@example.com'){
 const r=await call(DB,'/auth/register',{method:'POST',body:{email,password:'founder-password-123',accept_terms:true,capabilities:['founder','product_user','tester'],...recovery}});
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
 const DB=database();let r=await call(DB,'/health');const health=await payload(r);assert.equal(health.passwordHashIterations,100000);assert.equal(health.schemaVersion,11);r=await call(DB,'/auth/me');assert.equal(r.status,200);assert.equal((await payload(r)).user,null);
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
 for(const rep of reporters.slice(0,2)){r=await call(DB,'/products/'+good.id+'/reports',{method:'POST',headers:{Cookie:rep.cookie},body:{category:'spam',details:'Looks wrong'}});assert.equal(r.status,201)}
 assert.equal(DB.sql.prepare('SELECT listing_status s FROM products WHERE id=?').get(good.id).s,'approved','two reports do not hold');
 DB.sql.prepare("UPDATE users SET created_at='2020-01-01T00:00:00.000Z' WHERE email LIKE 'r_@example.com'").run();
 for(const rep of reporters.slice(2)){r=await call(DB,'/products/'+good.id+'/reports',{method:'POST',headers:{Cookie:rep.cookie},body:{category:'spam',details:'Looks wrong'}});assert.equal(r.status,201)}
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
 let r=await call(DB,'/auth/register',{method:'POST',body:{email:'multi@example.com',password:'founder-password-123',accept_terms:true,capabilities:['product_user','bogus'],...recovery}});assert.equal(r.status,201);
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
 const DB=database(),f=await signup(DB,'dir@example.com'),other=await signup(DB,'other@example.com');DB.sql.prepare("UPDATE users SET created_at='2020-01-01T00:00:00.000Z'").run();
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
 const go=(q,ip='9.9.9.9',ua='Mozilla/5.0')=>app.fetch(new Request('https://api.example.test/api/v1/go/'+a.id+q,{headers:{'CF-Connecting-IP':ip,'User-Agent':ua}}),env(DB));
 r=await go('?src=search');assert.equal(r.status,302);assert.match(r.headers.get('Location'),/\/leaving\.html\?id=/,'new listings go through the leaving page');assert.equal(DB.sql.prepare("SELECT COUNT(*) c FROM product_events WHERE event_type='outbound_click'").get().c,0,'no click until confirmed');
 r=await go('?src=search&confirm=1');assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'https://ledgerlite.example/');
 r=await go('?src=search&confirm=1');assert.equal(r.status,302);r=await go('?confirm=1','8.8.8.8','Googlebot/2.1');assert.equal(r.status,302);r=await go('?confirm=1','7.7.7.7','');
 r=await call(DB,'/go/does-not-exist');assert.equal(r.status,404);
 assert.equal(DB.sql.prepare("SELECT COUNT(*) c FROM product_events WHERE product_id=? AND event_type='outbound_click'").get(a.id).c,1,'repeat click from same visitor, bots and empty user agents are not counted');
 r=await call(DB,'/products/'+a.id+'/discovery-stats?days=7',{headers:{Cookie:f.cookie}});d=await payload(r);assert.equal(r.status,200);assert.equal(d.listing_views,1);assert.equal(d.outbound_clicks,1);
 r=await call(DB,'/products/'+a.id+'/discovery-stats',{headers:{Cookie:other.cookie}});assert.equal(r.status,404,'other founders cannot read private stats');r=await call(DB,'/products/'+a.id+'/discovery-stats');assert.equal(r.status,401);
 DB.sql.prepare("UPDATE products SET status='paused' WHERE id=?").run(a.id);r=await call(DB,'/discover/products/'+a.id);assert.equal(r.status,404,'paused listings are not public');
 DB.close();
});

test('general feedback: submit, founder view and respond, withdraw, report hides, privacy and ownership',async()=>{
 const DB=database(),f=await signup(DB,'fo@example.com'),u1=await signup(DB,'u1@example.com'),u2=await signup(DB,'u2@example.com'),u3=await signup(DB,'u3@example.com'),x=await signup(DB,'x@example.com');
 let r=await call(DB,'/products',{method:'POST',headers:{Cookie:f.cookie},body:{name:'FeedApp',url:'https://feedapp.example',description:'An app that wants honest feedback from users'}});const pid=(await payload(r)).product.id;
 const give=(who,body,id=pid)=>call(DB,'/discover/products/'+id+'/feedback',{method:'POST',headers:{Cookie:who.cookie},body});
 r=await call(DB,'/discover/products/'+pid+'/feedback',{method:'POST',body:{body:'guest feedback here'}});assert.equal(r.status,401);
 r=await give(f,{body:'Praising my own product'});assert.equal(r.status,403);
 r=await give(u1,{body:'ok'});assert.equal(r.status,400);
 r=await give(u1,{body:'The signup form hides the submit button on mobile',kind:'bug'});assert.equal(r.status,201);const fid=(await payload(r)).feedback.id;
 r=await give(u2,{body:'Great idea, please add dark mode',kind:'idea'});assert.equal(r.status,201);const fid2=(await payload(r)).feedback.id;
 r=await give(u1,{body:'valid feedback on a missing product',kind:'bug'},'missing');assert.equal(r.status,404);
 r=await call(DB,'/products/'+pid+'/general-feedback',{headers:{Cookie:f.cookie}});let d=await payload(r);assert.equal(d.feedback.length,2);assert.equal(JSON.stringify(d).includes('u1@example.com'),false,'author email never exposed');
 r=await call(DB,'/products/'+pid+'/general-feedback',{headers:{Cookie:x.cookie}});assert.equal(r.status,404,'other founders cannot read feedback');
 r=await call(DB,'/products/'+pid+'/general-feedback/'+fid+'/respond',{method:'POST',headers:{Cookie:f.cookie},body:{response:'Thanks, fixing this week.'}});assert.equal(r.status,200);
 r=await call(DB,'/feedback/general/mine',{headers:{Cookie:u1.cookie}});d=await payload(r);assert.equal(d.feedback[0].owner_response,'Thanks, fixing this week.');
 r=await call(DB,'/feedback/general/'+fid2,{method:'DELETE',headers:{Cookie:u1.cookie}});assert.equal(r.status,404,'only the author can withdraw');
 r=await call(DB,'/feedback/general/'+fid2,{method:'DELETE',headers:{Cookie:u2.cookie}});assert.equal(r.status,200);
 r=await call(DB,'/products/'+pid+'/general-feedback',{headers:{Cookie:f.cookie}});assert.equal((await payload(r)).feedback.length,1,'withdrawn feedback disappears from founder view');
 r=await call(DB,'/feedback/general/'+fid+'/report',{method:'POST',headers:{Cookie:u1.cookie},body:{reason:'x'}});assert.equal(r.status,403,'cannot report own');
 r=await call(DB,'/feedback/general/'+fid+'/report',{method:'POST',headers:{Cookie:u2.cookie},body:{reason:'spam'}});assert.equal(r.status,201);
 r=await call(DB,'/feedback/general/'+fid+'/report',{method:'POST',headers:{Cookie:u2.cookie},body:{reason:'spam'}});assert.equal(r.status,409);
 r=await call(DB,'/feedback/general/'+fid+'/report',{method:'POST',headers:{Cookie:u3.cookie},body:{reason:'abuse'}});assert.equal(r.status,201);
 r=await call(DB,'/products/'+pid+'/general-feedback',{headers:{Cookie:f.cookie}});assert.equal((await payload(r)).feedback.length,0,'two distinct reports hide feedback');
 DB.close();
});
test('growth workspace: honest metrics, funnel states, unconfigured tracking, ownership',async()=>{
 const DB=database(),f=await signup(DB,'g@example.com'),o=await signup(DB,'o@example.com');
 let r=await call(DB,'/products',{method:'POST',headers:{Cookie:f.cookie},body:{name:'GrowApp',url:'https://growapp.example',description:'A product used to check growth metrics'}});const pid=(await payload(r)).product.id;
 await call(DB,'/discover/view/'+pid,{method:'POST'});await call(DB,'/discover/view/'+pid,{method:'POST'});
 r=await call(DB,'/products/'+pid+'/growth?days=7',{headers:{Cookie:f.cookie}});let d=await payload(r);assert.equal(r.status,200);
 assert.equal(d.discovery.listing_views,2);assert.equal(d.discovery.outbound_clicks,0);
 assert.equal(d.acquisition.configured,false);assert.equal(d.acquisition.message,'Signup tracking not configured');assert.equal(d.acquisition.signups,undefined,'no zero signups when unconfigured');
 assert.equal(d.testing.opted_in,0);assert.match(d.distribution.note,/verified/i);
 r=await call(DB,'/testing/requests',{method:'POST',headers:{Cookie:f.cookie},body:{product_id:pid,tester_type:'Anyone',instructions:'Try the main flow.',feedback_questions:'What broke?',consent_terms:'Feedback goes to the owner.'}});assert.equal(r.status,201);
 r=await call(DB,'/testers/join',{method:'POST',headers:{Cookie:o.cookie},body:{product_id:pid,testing_request_id:(await payload(r)).request?.id}});
 r=await call(DB,'/products/'+pid+'/growth',{headers:{Cookie:f.cookie}});d=await payload(r);assert.equal(d.testing.campaigns_created,1);
 r=await call(DB,'/products/'+pid+'/growth',{headers:{Cookie:o.cookie}});assert.equal(r.status,404);
 r=await call(DB,'/products/'+pid+'/growth');assert.equal(r.status,401);
 DB.close();
});

test('hardening: bearer sessions work without cookies, young account limits, stricter screening, admin alerts',async()=>{
 const DB=database();
 let r=await call(DB,'/auth/register',{method:'POST',body:{email:'bearer@example.com',password:'founder-password-123',accept_terms:true,capabilities:['founder','product_user'],...recovery}});const token=(await payload(r)).session_token;assert.ok(token);
 r=await call(DB,'/auth/me',{headers:{Authorization:'Bearer '+token}});assert.equal((await payload(r)).user.email,'bearer@example.com','bearer token authenticates without any cookie');
 r=await call(DB,'/auth/me',{headers:{Authorization:'Bearer wrong'}});assert.equal((await payload(r)).user,null);
 r=await call(DB,'/auth/login',{method:'POST',body:{email:'bearer@example.com',password:'founder-password-123'}});assert.ok((await payload(r)).session_token);
 const alerts=[],realFetch=globalThis.fetch;globalThis.fetch=async(u,o)=>{alerts.push({u:String(u),body:o.body});return new Response('ok')};
 const post=(body)=>call(DB,'/products',{method:'POST',headers:{Authorization:'Bearer '+token},body,extra:{ALERT_WEBHOOK_URL:'https://hooks.example/alert'}});
 try{
  r=await post({name:'Plain',url:'http://plain.example',description:'Uses plain http for the site address'});assert.equal((await payload(r)).product.listing_status,'pending','http holds');
  r=await post({name:'Gadget',url:'https://paypal-login.example',description:'Looks like a payment brand site'});assert.equal((await payload(r)).product.listing_status,'pending','brand words hold');
  r=await post({name:'Third',url:'https://third.example',description:'A third listing on a brand new account'});assert.equal(r.status,429,'third product in the first day is refused');
 }finally{globalThis.fetch=realFetch}
 assert.equal(alerts.length,2);assert.ok(alerts.every(a=>a.u==='https://hooks.example/alert'&&!/@/.test(a.body)),'alerts carry no emails');
 DB.sql.prepare("UPDATE users SET created_at='2020-01-01T00:00:00.000Z'").run();
 r=await post({name:'Bankly',url:'https://bankly.example',description:'Product name matches its own domain words'});assert.equal((await payload(r)).product.listing_status,'approved','matching brand word is allowed');
 r=await call(DB,'/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);
 r=await call(DB,'/auth/me',{headers:{Authorization:'Bearer '+token}});assert.equal((await payload(r)).user,null,'logout revokes the bearer session');
 DB.close();
});
test('directory paging and ranking happen in SQL so older listings stay reachable',async()=>{
 const DB=database(),f=await signup(DB,'bulk@example.com');
 DB.sql.prepare("UPDATE users SET created_at='2020-01-01T00:00:00.000Z'").run();
 const uid=DB.sql.prepare('SELECT id FROM users').get().id;
 const ins=DB.sql.prepare("INSERT INTO products(id,owner_id,name,url,description,listing_status,created_at) VALUES(?,?,?,?,?,'approved',?)");
 for(let i=0;i<400;i++)ins.run('p'+String(i).padStart(4,'0'),uid,'Tool '+i,'https://t'+i+'.example','A generic description for bulk product '+i,new Date(Date.UTC(2025,0,1)+i*3600e3).toISOString());
 ins.run('needle','%s'.replace('%s',uid),'Zebra Ledger','https://zebra.example','Needle in the haystack bookkeeping tool','2020-01-01T00:00:00.000Z');
 let r=await call(DB,'/discover/products?q=zebra');let d=await payload(r);assert.equal(d.total,1);assert.equal(d.products[0].id,'needle','oldest listing is still found');
 r=await call(DB,'/discover/products?sort=recent&page=17');d=await payload(r);assert.equal(d.total,401);assert.equal(d.products.length,17,'last page via SQL paging');
 r=await call(DB,'/discover/products?q=tool');d=await payload(r);assert.equal(d.total,401);assert.equal(d.products.length,24);
 DB.close();
});

const old=DB=>DB.sql.prepare("UPDATE users SET created_at='2020-01-01T00:00:00.000Z'").run();
test('notifications: created by real events, owner only, read state, paging, no duplicates',async()=>{
 const DB=database(),f=await signup(DB,'nf@example.com'),other=await signup(DB,'nother@example.com'),t1=await signup(DB,'nt1@example.com'),u1=await signup(DB,'nu1@example.com');old(DB);
 let r=await call(DB,'/products',{method:'POST',headers:{Cookie:f.cookie},body:{name:'NotiApp',url:'https://notiapp.example',description:'A product that receives notifications'}});const pid=(await payload(r)).product.id;
 const list=async(who,q='')=>payload(await call(DB,'/notifications'+q,{headers:{Cookie:who.cookie}}));
 assert.equal((await list(f)).notifications.length,0,'no notification without an event');
 r=await call(DB,'/testers/join',{method:'POST',headers:{Cookie:t1.cookie},body:{product_id:pid}});assert.equal(r.status,201);
 r=await call(DB,'/testers/join',{method:'POST',headers:{Cookie:t1.cookie},body:{product_id:pid}});assert.equal(r.status,409);
 let d=await list(f);assert.equal(d.notifications.length,1,'failed duplicate join creates no notification');assert.equal(d.notifications[0].type,'tester_opted_in');assert.equal(JSON.stringify(d).includes('nt1@example.com'),false,'tester identity not leaked');
 r=await call(DB,'/testers/start',{method:'POST',headers:{Cookie:t1.cookie},body:{product_id:pid}});assert.equal(r.status,200);
 r=await call(DB,'/testers/start',{method:'POST',headers:{Cookie:t1.cookie},body:{product_id:pid}});assert.equal(r.status,404);
 r=await call(DB,'/feedback',{method:'POST',headers:{Cookie:t1.cookie},body:{product_id:pid,body:'The checkout button is hidden on small screens',consent:true}});assert.equal(r.status,201);
 r=await call(DB,'/discover/products/'+pid+'/feedback',{method:'POST',headers:{Cookie:u1.cookie},body:{body:'Love the idea, please add an export option',kind:'idea'}});const gid=(await payload(r)).feedback.id;
 d=await list(f);assert.deepEqual(d.notifications.map(n=>n.type).sort(),['feedback_new','test_completed','test_started','tester_opted_in']);assert.equal(d.unread_count,4);
 assert.ok(d.notifications.every(n=>n.link.startsWith('/dashboard.html?product='+pid)||/^\/dashboard\.html\?thread=(voluntary|test):[\w-]+#messages-panel$/.test(n.link)),'links point at the product workspace or the conversation');
 assert.equal((await list(other)).notifications.length,0,'another founder sees nothing');assert.equal((await list(t1)).notifications.length,0);
 const nid=d.notifications[0].id;
 r=await call(DB,'/notifications/'+nid+'/read',{method:'POST',headers:{Cookie:other.cookie}});assert.equal(r.status,404,'cannot mark another user\'s notification');
 r=await call(DB,'/notifications/'+nid+'/read',{method:'POST',headers:{Cookie:f.cookie}});assert.equal(r.status,200);
 d=await list(f);assert.equal(d.unread_count,3);assert.equal((await list(f,'?unread=1')).notifications.length,3);
 d=await list(f,'?limit=2');assert.equal(d.notifications.length,2);assert.ok(d.next_before);d=await list(f,'?limit=2&before='+encodeURIComponent(d.next_before));assert.equal(d.notifications.length,2);assert.equal(d.next_before,null);
 r=await call(DB,'/products/'+pid+'/general-feedback/'+gid+'/respond',{method:'POST',headers:{Cookie:f.cookie},body:{response:'Export is planned.'}});assert.equal(r.status,200);
 r=await call(DB,'/products/'+pid+'/general-feedback/'+gid+'/respond',{method:'POST',headers:{Cookie:f.cookie},body:{response:'Export is planned.'}});assert.equal(r.status,200);
 d=await list(u1);assert.equal(d.notifications.length,2,'each founder reply notifies the author once');assert.ok(d.notifications.every(n=>n.type==='message_reply'));assert.match(d.notifications[0].link,/thread=voluntary:/);
 r=await call(DB,'/notifications/read-all',{method:'POST',headers:{Cookie:f.cookie}});assert.equal((await payload(r)).updated,3);assert.equal((await list(f)).unread_count,0);assert.equal((await list(u1)).unread_count,2,'read-all affects only the caller');
 r=await call(DB,'/notifications');assert.equal(r.status,401);
 r=await call(DB,'/auth/password',{method:'POST',headers:{Cookie:f.cookie},body:{current_password:'founder-password-123',new_password:'another-long-password-456'}});assert.equal(r.status,200);f.cookie=cookie(r);
 assert.ok((await list(f)).notifications.some(n=>n.type==='security'),'password change raises a security notification');
 DB.close();
});
test('notifications: listing holds, external signups per day, admin verification',async()=>{
 const DB=database(),f=await signup(DB,'n2@example.com');old(DB);
 const post=body=>call(DB,'/products',{method:'POST',headers:{Cookie:f.cookie},body});
 let r=await post({name:'Held',url:'http://held.example',description:'Plain http site gets held for review'});assert.equal((await payload(r)).product.listing_status,'pending');
 r=await post({name:'Tracked',url:'https://tracked.example',description:'A product with a tracking integration'});const pid=(await payload(r)).product.id;
 let d=await payload(await call(DB,'/notifications',{headers:{Cookie:f.cookie}}));assert.equal(d.notifications.filter(n=>n.type==='listing_status').length,1);
 r=await call(DB,'/integrations/token',{method:'POST',headers:{Cookie:f.cookie},body:{product_id:pid}});const token=(await payload(r)).token;
 const send=(type,key)=>app.fetch(new Request('https://api.example.test/api/v1/analytics/events',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','CF-Connecting-IP':crypto.randomUUID()},body:JSON.stringify({event_type:type,event_key:key})}),env(DB));
 assert.equal((await send('signup','s1')).status,201);assert.equal((await send('signup','s1')).status,200);assert.equal((await send('signup','s2')).status,201);assert.equal((await send('visit','v1')).status,201);
 d=await payload(await call(DB,'/notifications',{headers:{Cookie:f.cookie}}));assert.equal(d.notifications.filter(n=>n.type==='external_signup').length,1,'one signup notification per product per day');assert.equal(d.notifications.filter(n=>/visit/.test(n.type)).length,0,'plain visits do not notify');
 DB.close();
});
test('discovery filters: individual, combined, invalid, cleared, ineligible hidden',async()=>{
 const DB=database(),f=await signup(DB,'flt@example.com');old(DB);
 const mk=async(b)=>{const r=await call(DB,'/products',{method:'POST',headers:{Cookie:f.cookie},body:b});assert.equal(r.status,201,await r.clone().text());return (await payload(r)).product.id};
 const a=await mk({name:'Ledger Pro',url:'https://ledgerpro.example',tagline:'Bookkeeping',description:'Invoices and expenses made simple for freelancers',problem:'Lost invoices',audience:'Freelance designers',category_slug:'business-finance',pricing_model:'paid',stage:'launched',seeking:['testers']});
 const b=await mk({name:'Pixel Pal',url:'https://pixelpal.example',description:'Quick mockups for social graphics and banners',problem:'Slow design work',audience:'Small businesses',category_slug:'design-creative',pricing_model:'free',stage:'idea',seeking:['feedback']});
 const c=await mk({name:'Study Buddy',url:'https://studybuddy.example',description:'Flashcards and study plans for students',audience:'Students',category_slug:'education-learning',pricing_model:'free',stage:'launched',seeking:['users','testers']});
 const held=await mk({name:'Heldy',url:'http://heldy.example',description:'Held because it uses plain http',category_slug:'business-finance',pricing_model:'free'});
 const gone=await mk({name:'Gone Tool',url:'https://gonetool.example',description:'Archived tools must never appear in discovery',pricing_model:'free'});
 await call(DB,'/products/'+gone,{method:'DELETE',headers:{Cookie:f.cookie}});
 const q=async s=>{const r=await call(DB,'/discover/products'+s);return {status:r.status,...(await payload(r))}};
 const names=d=>d.products.map(p=>p.name).sort();let r;
 assert.deepEqual(names(await q('')),['Ledger Pro','Pixel Pal','Study Buddy'],'held and archived never listed; empty filters exclude nothing');
 assert.deepEqual(names(await q('?q=LEDGER')),['Ledger Pro'],'case insensitive name');
 assert.deepEqual(names(await q('?q=flashcards')),['Study Buddy'],'description search');
 assert.deepEqual(names(await q('?q=lost%20invoices')),['Ledger Pro'],'problem search');
 assert.deepEqual(names(await q('?q=STUDENTS')),['Study Buddy'],'audience search');
 assert.deepEqual(names(await q('?category=design-creative')),['Pixel Pal']);
 assert.deepEqual(names(await q('?pricing=free')),['Pixel Pal','Study Buddy']);
 assert.deepEqual(names(await q('?stage=launched')),['Ledger Pro','Study Buddy']);
 assert.deepEqual(names(await q('?seeking=testers')),['Ledger Pro','Study Buddy']);
 assert.deepEqual(names(await q('?pricing=free&stage=launched')),['Study Buddy'],'combined filters');
 assert.deepEqual(names(await q('?pricing=free&stage=launched&seeking=testers&q=study')),['Study Buddy']);
 const none=await q('?pricing=paid&stage=idea');assert.equal(none.total,0);assert.equal(none.products.length,0,'no match returns an empty list, never everything');
 for(const bad of ['?pricing=gold','?stage=moon','?seeking=aliens','?category=nope'])assert.equal((await q(bad)).status,400,bad+' rejected, not silently ignored');
 assert.equal((await q('?q=%25_%27%22')).status,200,'special characters are safe');
 r=await call(DB,'/products/'+b,{method:'PATCH',headers:{Cookie:f.cookie},body:{status:'paused'}});assert.equal(r.status,200);
 assert.deepEqual(names(await q('')),['Ledger Pro','Study Buddy'],'paused listing leaves discovery');
 r=await call(DB,'/products/'+b,{method:'PATCH',headers:{Cookie:f.cookie},body:{status:'active'}});assert.equal(r.status,200);assert.equal((await q('')).total,3,'resumed listing returns');
 r=await call(DB,'/testing/requests',{method:'POST',headers:{Cookie:f.cookie},body:{product_id:a,tester_type:'Designers',instructions:'Create an invoice.',feedback_questions:'What broke?',consent_terms:'Shared with the owner.'}});assert.equal(r.status,201);
 assert.deepEqual(names(await q('?testing=1')),['Ledger Pro'],'open testing request filter');
 DB.close();
});
test('growth dashboard: configured vs unconfigured, zero vs missing, per product isolation',async()=>{
 const DB=database(),f=await signup(DB,'gr@example.com');old(DB);
 const mk=async(n,u)=>(await payload(await call(DB,'/products',{method:'POST',headers:{Cookie:f.cookie},body:{name:n,url:u,description:n+' is a product for growth testing'}}))).product.id;
 const p1=await mk('One','https://one.example'),p2=await mk('Two','https://two.example');
 const g=async id=>payload(await call(DB,'/products/'+id+'/growth?days=30',{headers:{Cookie:f.cookie}}));
 assert.equal((await g(p1)).acquisition.configured,false);
 const token=(await payload(await call(DB,'/integrations/token',{method:'POST',headers:{Cookie:f.cookie},body:{product_id:p1}}))).token;
 const send=(type,key)=>app.fetch(new Request('https://api.example.test/api/v1/analytics/events',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','CF-Connecting-IP':crypto.randomUUID()},body:JSON.stringify({event_type:type,event_key:key})}),env(DB));
 await send('visit','v1');await send('visit','v2');await send('signup','s1');
 let d=await g(p1);assert.equal(d.acquisition.configured,true);assert.equal(d.acquisition.visits,2);assert.equal(d.acquisition.signups,1);assert.equal(d.acquisition.activations,0,'configured with no activations is zero, not unavailable');
 d=await g(p2);assert.equal(d.acquisition.configured,false,'other product is not affected by this product\'s token');assert.equal(d.acquisition.signups,undefined);
 DB.close();
});

test('notification paging is stable when many notifications share one timestamp',async()=>{
 const DB=database(),f=await signup(DB,'tie@example.com');const uid=DB.sql.prepare('SELECT id FROM users').get().id;
 const ins=DB.sql.prepare("INSERT INTO notifications(id,user_id,type,title,dedupe_key,created_at) VALUES(?,?,?,?,?,?)");
 for(let i=0;i<7;i++)ins.run('n'+i,uid,'x','Same time '+i,'k'+i,'2026-10-21T10:00:00.000Z');
 ins.run('older',uid,'x','Older','kold','2026-10-21T09:00:00.000Z');
 const seen=[];let before='',guard=0;do{const r=await call(DB,'/notifications?limit=3'+(before?'&before='+encodeURIComponent(before):''),{headers:{Cookie:f.cookie}});const d=await payload(r);seen.push(...d.notifications.map(n=>n.id));before=d.next_before||'';guard++}while(before&&guard<10);
 assert.equal(seen.length,8);assert.equal(new Set(seen).size,8,'no duplicates and none skipped across pages');
 const r=await call(DB,'/notifications?before=2026-10-21T10:00:00.000Z',{headers:{Cookie:f.cookie}});assert.equal((await payload(r)).notifications.length,8,'malformed cursor is ignored safely');
 DB.close();
});

/* ---------- messaging, profiles, terms, share tracking ---------- */
const reg=async(DB,email,extra={})=>{const r=await call(DB,'/auth/register',{method:'POST',body:{email,password:'founder-password-123',capabilities:['founder','product_user','tester'],...recovery,...extra}});return {r,cookie:cookie(r),user:(await payload(r.clone?.()||r))?.user}};
test('terms: registration requires acceptance, acceptance is recorded, old accounts must accept before writing',async()=>{
 const DB=database();
 let r=await call(DB,'/auth/register',{method:'POST',body:{email:'noterms@example.com',password:'founder-password-123',capabilities:['founder'],...recovery}});assert.equal(r.status,400);assert.match((await payload(r)).error,/Terms of use/);
 r=await call(DB,'/auth/register',{method:'POST',body:{email:'noterms@example.com',password:'founder-password-123',accept_terms:'yes',capabilities:['founder'],...recovery}});assert.equal(r.status,400,'only a real boolean true counts');
 const a=await reg(DB,'terms@example.com',{accept_terms:true});assert.equal(a.r.status,201);
 let me=await payload(await call(DB,'/auth/me',{headers:{Cookie:a.cookie}}));assert.equal(me.user.terms.required,false);assert.equal(me.user.terms.accepted_version,'2026-10-22');assert.ok(me.user.terms.accepted_at);
 const row=DB.sql.prepare("SELECT version,method FROM terms_acceptances WHERE user_id=(SELECT id FROM users WHERE email='terms@example.com')").get();assert.deepEqual({...row},{version:'2026-10-22',method:'registration'});
 // simulate an account created before terms were recorded
 DB.sql.prepare("UPDATE users SET terms_version='',terms_accepted_at=NULL WHERE email='terms@example.com'").run();
 me=await payload(await call(DB,'/auth/me',{headers:{Cookie:a.cookie}}));assert.equal(me.user.terms.required,true);
 const post=()=>call(DB,'/products',{method:'POST',headers:{Cookie:a.cookie},body:{name:'Termed',url:'https://termed.example',description:'Needs accepted terms first'}});
 r=await post();assert.equal(r.status,403);assert.equal((await payload(r)).code,'TERMS_REQUIRED');
 assert.equal((await call(DB,'/products',{headers:{Cookie:a.cookie}})).status,200,'reading still works');
 assert.equal((await call(DB,'/notifications/read-all',{method:'POST',headers:{Cookie:a.cookie}})).status,200,'notification reads are exempt');
 r=await call(DB,'/auth/terms/accept',{method:'POST',headers:{Cookie:a.cookie},body:{version:'2000-01-01',accepted:true}});assert.equal(r.status,409,'stale version refused');
 r=await call(DB,'/auth/terms/accept',{method:'POST',headers:{Cookie:a.cookie},body:{version:'2026-10-22',accepted:false}});assert.equal(r.status,400);
 r=await call(DB,'/auth/terms/accept',{method:'POST',headers:{Cookie:a.cookie},body:{version:'2026-10-22',accepted:true}});assert.equal(r.status,200);
 assert.equal((await post()).status,201,'writes work after acceptance');
 const rows=DB.sql.prepare("SELECT method FROM terms_acceptances WHERE user_id=(SELECT id FROM users WHERE email='terms@example.com') ORDER BY accepted_at").all().map(x=>x.method);assert.deepEqual(rows,['registration','prompt']);
 assert.equal((await call(DB,'/auth/terms/accept',{method:'POST',body:{version:'2026-10-22',accepted:true}})).status,401,'guests cannot accept');
 DB.close();
});
test('profiles: name and location are optional, cleaned, never an email, and shown to the other side',async()=>{
 const DB=database();
 let r=await call(DB,'/auth/register',{method:'POST',body:{email:'p1@example.com',password:'founder-password-123',accept_terms:true,display_name:'me@leak.com',capabilities:['founder'],...recovery}});assert.equal(r.status,400,'email as display name refused');
 const f=await reg(DB,'pf@example.com',{accept_terms:true,display_name:'  Ada   <b>Obi</b> ',location:'Lagos, Nigeria'});assert.equal(f.r.status,201);
 let me=(await payload(await call(DB,'/auth/me',{headers:{Cookie:f.cookie}}))).user;assert.equal(me.display_name,'Ada bObi/b','markup characters stripped');assert.equal(me.location,'Lagos, Nigeria');
 r=await call(DB,'/auth/profile',{method:'PATCH',headers:{Cookie:f.cookie},body:{display_name:'Ada O.',location:''}});assert.equal(r.status,200);
 me=(await payload(await call(DB,'/auth/me',{headers:{Cookie:f.cookie}}))).user;assert.equal(me.display_name,'Ada O.');assert.equal(me.location,'');
 r=await call(DB,'/auth/profile',{method:'PATCH',headers:{Cookie:f.cookie},body:{display_name:'x',location:'a@b.co'}});assert.equal(r.status,400);
 assert.equal((await call(DB,'/auth/profile',{method:'PATCH',body:{display_name:'x'}})).status,401);
 DB.close();
});
async function convo(){const DB=database(),f=await signup(DB,'mf@example.com'),u=await signup(DB,'mu@example.com'),x=await signup(DB,'mx@example.com');old(DB);
 DB.sql.prepare("UPDATE users SET display_name='Founder Fay',location='Lagos, Nigeria' WHERE email='mf@example.com'").run();DB.sql.prepare("UPDATE users SET display_name='Uche User',location='Accra, Ghana' WHERE email='mu@example.com'").run();
 let r=await call(DB,'/products',{method:'POST',headers:{Cookie:f.cookie},body:{name:'ChatApp',url:'https://chatapp.example',description:'A product used to test conversations'}});const pid=(await payload(r)).product.id;
 r=await call(DB,'/discover/products/'+pid+'/feedback',{method:'POST',headers:{Cookie:u.cookie},body:{body:'The pricing page is confusing to read',kind:'general'}});const tid=(await payload(r)).feedback.id;
 return {DB,f,u,x,pid,tid}}
test('messaging: names, roles, locations, timestamps, replies in both directions, privacy',async()=>{
 const {DB,f,u,x,pid,tid}=await convo();
 let r=await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:f.cookie}});let d=await payload(r);assert.equal(r.status,200);
 assert.equal(d.messages.length,1);const root=d.messages[0];assert.equal(root.author.name,'Uche User');assert.equal(root.author.role,'Product user');assert.equal(root.author.location,'Accra, Ghana');assert.ok(Date.parse(root.created_at));assert.equal(root.mine,false);assert.equal(d.thread.viewer_role,'founder');
 assert.equal(JSON.stringify(d).includes('@example.com'),false,'no email addresses anywhere');assert.equal(JSON.stringify(d).includes('author_id'),false);
 r=await call(DB,'/threads/voluntary/'+tid+'/messages',{method:'POST',headers:{Cookie:f.cookie},body:{body:'Thanks, we will simplify it.'}});assert.equal(r.status,201);
 r=await call(DB,'/threads/voluntary/'+tid+'/messages',{method:'POST',headers:{Cookie:u.cookie},body:{body:'Great, thank you!'}});assert.equal(r.status,201);
 d=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:u.cookie}}));assert.deepEqual(d.messages.map(m=>m.author.role),['Product user','Founder','Product user']);assert.equal(d.messages[1].author.name,'Founder Fay');assert.equal(d.messages[1].author.location,'Lagos, Nigeria');assert.deepEqual(d.messages.map(m=>m.mine),[true,false,true]);
 assert.equal((await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:x.cookie}})).status,404,'outsiders cannot open it');
 assert.equal((await call(DB,'/threads/voluntary/'+tid+'/messages',{method:'POST',headers:{Cookie:x.cookie},body:{body:'let me in please'}})).status,404,'outsiders cannot post');
 assert.equal((await call(DB,'/threads/voluntary/'+tid+'/messages',{method:'POST',headers:{Cookie:f.cookie},body:{body:'   '}})).status,400);
 assert.equal((await call(DB,'/threads/voluntary/'+tid)).status,401);
 DB.close();
});
test('messaging: read and unread, seen markers, thread list, notifications cleared when opened',async()=>{
 const {DB,f,u,pid,tid}=await convo();
 const list=async(w,q='')=>payload(await call(DB,'/threads'+q,{headers:{Cookie:w.cookie}}));
 let d=await list(f);assert.equal(d.threads.length,1);assert.equal(d.threads[0].unread,1,'founder has the new feedback unread');assert.equal(d.unread_total,1);assert.equal(d.threads[0].counterpart.name,'Uche User');assert.equal(d.threads[0].viewer_role,'founder');
 d=await list(u);assert.equal(d.threads[0].unread,0,'authors never see their own message as unread');assert.equal(d.threads[0].counterpart.role,'Founder');
 let t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:f.cookie}}));assert.equal(t.messages[0].unread,true,'viewing does not mark read by itself');
 assert.equal((await call(DB,'/threads/voluntary/'+tid+'/read',{method:'POST',headers:{Cookie:f.cookie}})).status,200);
 d=await list(f);assert.equal(d.threads[0].unread,0);assert.equal((await list(f,'?filter=unread')).threads.length,0);
 t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:u.cookie}}));assert.equal(t.messages[0].seen,true,'sender sees the founder has read it');
 await call(DB,'/threads/voluntary/'+tid+'/messages',{method:'POST',headers:{Cookie:f.cookie},body:{body:'Fixed now.'}});
 d=await list(u);assert.equal(d.threads[0].unread,1);assert.equal(d.threads[0].reply_count,1);assert.match(d.threads[0].preview,/Fixed now/);
 t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:u.cookie}}));assert.deepEqual(t.messages.map(m=>m.unread),[false,true]);
 let n=await payload(await call(DB,'/notifications',{headers:{Cookie:u.cookie}}));assert.equal(n.unread_count,1);
 t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:f.cookie}}));assert.equal(t.messages[1].seen,false,'founder reply is not seen until the sender opens it');
 await call(DB,'/threads/voluntary/'+tid+'/read',{method:'POST',headers:{Cookie:u.cookie}});n=await payload(await call(DB,'/notifications',{headers:{Cookie:u.cookie}}));assert.equal(n.unread_count,0,'opening a conversation clears its notification');
 await call(DB,'/threads/voluntary/'+tid+'/read',{method:'POST',headers:{Cookie:u.cookie}});t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:f.cookie}}));assert.equal(t.messages[1].seen,true);
 DB.close();
});
test('messaging: edit and delete only your own messages, with a 24 hour edit window and tombstones',async()=>{
 const {DB,f,u,x,pid,tid}=await convo();
 let r=await call(DB,'/threads/voluntary/'+tid+'/messages',{method:'POST',headers:{Cookie:f.cookie},body:{body:'Founder reply one'}});const mid=(await payload(r)).message.id;
 r=await call(DB,'/messages/'+mid,{method:'PATCH',headers:{Cookie:u.cookie},body:{body:'hacked'}});assert.equal(r.status,403,'the other participant cannot edit');
 r=await call(DB,'/messages/'+mid,{method:'DELETE',headers:{Cookie:u.cookie}});assert.equal(r.status,403,'the other participant cannot delete');
 r=await call(DB,'/messages/'+mid,{method:'PATCH',headers:{Cookie:x.cookie},body:{body:'hacked'}});assert.equal(r.status,404,'outsiders learn nothing');
 r=await call(DB,'/messages/'+mid,{method:'PATCH',headers:{Cookie:f.cookie},body:{body:'Founder reply, corrected'}});assert.equal(r.status,200);
 let t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:u.cookie}}));assert.equal(t.messages[1].body,'Founder reply, corrected');assert.ok(t.messages[1].edited_at,'edited marker present');assert.equal(t.messages[1].can_edit,false,'viewer cannot edit it');
 t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:f.cookie}}));assert.equal(t.messages[1].can_edit,true);assert.equal(t.messages[1].can_delete,true);
 DB.sql.prepare("UPDATE feedback_messages SET created_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(mid);
 r=await call(DB,'/messages/'+mid,{method:'PATCH',headers:{Cookie:f.cookie},body:{body:'too late'}});assert.equal(r.status,409,'edit window closed');
 t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:f.cookie}}));assert.equal(t.messages[1].can_edit,false);assert.equal(t.messages[1].can_delete,true,'delete is still allowed');
 r=await call(DB,'/messages/'+mid,{method:'DELETE',headers:{Cookie:f.cookie}});assert.equal(r.status,200);
 t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:u.cookie}}));assert.equal(t.messages[1].deleted,true);assert.equal(t.messages[1].body,null,'content is gone, a tombstone remains');assert.equal(DB.sql.prepare('SELECT body FROM feedback_messages WHERE id=?').get(mid).body,'[deleted]');
 assert.equal((await call(DB,'/messages/'+mid,{method:'DELETE',headers:{Cookie:f.cookie}})).status,409);
 // root message (the original feedback)
 r=await call(DB,'/threads/voluntary/'+tid,{method:'PATCH',headers:{Cookie:f.cookie},body:{body:'founder cannot rewrite feedback'}});assert.equal(r.status,403);
 r=await call(DB,'/threads/voluntary/'+tid,{method:'DELETE',headers:{Cookie:f.cookie}});assert.equal(r.status,403);
 r=await call(DB,'/threads/voluntary/'+tid,{method:'PATCH',headers:{Cookie:u.cookie},body:{body:'The pricing page is confusing, sorry for the typo fix'}});assert.equal(r.status,200);
 t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:f.cookie}}));assert.match(t.messages[0].body,/typo fix/);assert.ok(t.messages[0].edited_at);
 r=await call(DB,'/threads/voluntary/'+tid,{method:'DELETE',headers:{Cookie:u.cookie}});assert.equal(r.status,200);
 assert.equal((await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:f.cookie}})).status,404,'deleted feedback disappears for the founder');
 t=await payload(await call(DB,'/threads/voluntary/'+tid,{headers:{Cookie:u.cookie}}));assert.equal(t.messages[0].deleted,true);assert.equal(t.thread.can_reply,false);
 r=await call(DB,'/threads/voluntary/'+tid+'/messages',{method:'POST',headers:{Cookie:u.cookie},body:{body:'cannot reply to a deleted thread'}});assert.equal(r.status,409);
 DB.close();
});
test('messaging: structured test feedback is a conversation too, editable but not deletable',async()=>{
 const {DB,f,u,x,pid}=await convo();
 let r=await call(DB,'/testers/join',{method:'POST',headers:{Cookie:x.cookie},body:{product_id:pid}});assert.equal(r.status,201);
 r=await call(DB,'/feedback',{method:'POST',headers:{Cookie:x.cookie},body:{product_id:pid,body:'Signup took too many steps to finish',consent:true}});assert.equal(r.status,201);
 let fb=(await payload(await call(DB,'/products/'+pid+'/feedback',{headers:{Cookie:f.cookie}}))).feedback[0];assert.equal(fb.author.role,'Tester');assert.ok(fb.thread_id);assert.equal(JSON.stringify(fb).includes('@example.com'),false);
 let t=await payload(await call(DB,'/threads/test/'+fb.thread_id,{headers:{Cookie:f.cookie}}));assert.equal(t.messages[0].author.role,'Tester');
 r=await call(DB,'/threads/test/'+fb.thread_id+'/messages',{method:'POST',headers:{Cookie:f.cookie},body:{body:'Thank you, which step lost you?'}});assert.equal(r.status,201);
 assert.equal((await call(DB,'/threads/test/'+fb.thread_id,{headers:{Cookie:u.cookie}})).status,404,'other users cannot read test feedback threads');
 r=await call(DB,'/threads/test/'+fb.thread_id,{method:'DELETE',headers:{Cookie:x.cookie}});assert.equal(r.status,409);assert.match((await payload(r)).error,/recorded test result/);
 r=await call(DB,'/threads/test/'+fb.thread_id,{method:'PATCH',headers:{Cookie:x.cookie},body:{body:'Signup took five steps; step three lost me'}});assert.equal(r.status,200);
 const list=await payload(await call(DB,'/threads',{headers:{Cookie:x.cookie}}));assert.equal(list.threads.find(th=>th.type==='test').unread,1);
 DB.close();
});
test('messaging: earlier single replies are carried into conversations by the migration',()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0001_initial','0002_ai_campaigns_and_tracking','0003_distribution_workflows','0004_operational_reporting','0005_self_service_publishing','0006_user_capabilities','0007_directory','0008_general_feedback','0009_hardening','0010_notifications'])sql.exec(readFileSync(new URL('../migrations/'+f+'.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO users(id,email,password_hash,password_salt,referral_code) VALUES('o','o@x.com','h','s','r1'),('a','a@x.com','h','s','r2')");
 sql.exec("INSERT INTO products(id,owner_id,name,url,description,listing_status) VALUES('p','o','P','https://p.example','Describes the product','approved')");
 sql.exec("INSERT INTO product_feedback(id,product_id,author_id,body,owner_response,owner_responded_at) VALUES('f1','p','a','Original feedback text','Old founder reply','2026-09-01T10:00:00.000Z'),('f2','p','a','Feedback with no reply yet','',NULL)");
 sql.exec(readFileSync(new URL('../migrations/0011_messaging_terms_shares.sql',import.meta.url),'utf8'));
 const m=sql.prepare("SELECT thread_id,author_id,body,created_at FROM feedback_messages").all();assert.equal(m.length,1);assert.deepEqual({...m[0]},{thread_id:'f1',author_id:'o',body:'Old founder reply',created_at:'2026-09-01T10:00:00.000Z'});
 assert.equal(sql.prepare("SELECT COUNT(*) c FROM product_feedback").get().c,2,'original feedback rows untouched');assert.equal(sql.prepare("SELECT terms_version v FROM users WHERE id='o'").get().v,'','existing users are not auto-accepted');
 sql.close();
});
test('share tracking: counts own share buttons once, by method, owner only, no raw identifiers',async()=>{
 const {DB,f,u,x,pid}=await convo();
 const share=(method,{ip='1.1.1.1',ua='Mozilla/5.0',id=pid,source='detail'}={})=>app.fetch(new Request('https://api.example.test/api/v1/discover/share/'+id,{method:'POST',headers:{Origin:'https://requva.pages.dev','X-Requested-With':'Requva','Content-Type':'application/json','CF-Connecting-IP':ip,'User-Agent':ua},body:JSON.stringify({method,source})}),env(DB));
 let r=await share('whatsapp');assert.equal(r.status,201);assert.equal((await payload(r)).counted,true);
 r=await share('whatsapp');assert.equal((await payload(r)).counted,false,'same visitor and method within 10 minutes counts once');
 for(const m of ['copy_link','email','gmail','x','linkedin','facebook','native'])assert.equal((await share(m)).status,201,m);
 assert.equal((await share('whatsapp',{ip:'2.2.2.2'})).status,201,'a different visitor counts');
 r=await share('myspace');assert.equal(r.status,400);r=await share('x',{id:'nope'});assert.equal(r.status,404);
 r=await share('x',{ip:'3.3.3.3',ua:'Googlebot/2.1'});assert.equal((await payload(r)).counted,false,'bots are ignored');
 r=await share('x',{ip:'3.3.3.4',ua:''});assert.equal((await payload(r)).counted,false);
 const g=await payload(await call(DB,'/products/'+pid+'/growth?days=30',{headers:{Cookie:f.cookie}}));
 assert.equal(g.sharing.total,9);assert.equal(g.sharing.all_time,9);assert.equal(g.sharing.by_method.find(m=>m.method==='whatsapp').count,2);assert.equal(g.sharing.recent.length,9);assert.ok(g.sharing.recent.every(s=>s.method&&Date.parse(s.created_at)));assert.match(g.sharing.note,/does not show whether anyone opened or shared/);
 assert.equal(JSON.stringify(g.sharing).includes('visitor'),false,'visitor hashes are never returned');
 const prods=await payload(await call(DB,'/products',{headers:{Cookie:f.cookie}}));assert.equal(prods.products.find(p=>p.id===pid).share_count,9);
 assert.equal((await call(DB,'/products/'+pid+'/growth',{headers:{Cookie:x.cookie}})).status,404,'other founders cannot read share stats');
 DB.sql.prepare("UPDATE products SET status='paused' WHERE id=?").run(pid);assert.equal((await share('x',{ip:'9.9.9.9'})).status,404,'unpublished products cannot be share-counted');
 DB.close();
});

test('opportunity catalog: channel names are forgiving, errors name the problem, verification gates the founder list',async()=>{
 const DB=database(),admin=await signup(DB,'oadmin@example.com'),owner=await signup(DB,'ofounder@example.com');old(DB);DB.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.user.id);
 const mk=(over={})=>call(DB,'/admin/distribution/opportunities',{method:'POST',headers:{Cookie:admin.cookie},body:{name:'Product Hunt',destination_url:'https://producthunt.com/',source_url:'https://producthunt.com/faq',channel:'Directories',audience:'Makers',rationale:'Launch audience',next_action:'Submit the product',last_verified_at:'2026-10-20',...over}});
 let r=await call(DB,'/distribution/channels',{headers:{Cookie:owner.cookie}});const channels=(await payload(r)).channels;assert.ok(channels.includes('Directories')&&channels.includes('Search discovery'));assert.equal(channels.length,15);
 for(const [typed,saved] of [['directory','Directories'],['REDDIT','Reddit'],['  linkedin ','LinkedIn'],['twitter','X'],['community','Communities'],['search','Search discovery']]){r=await mk({name:'Entry '+typed.trim(),channel:typed});assert.equal(r.status,201,typed+': '+await r.clone().text());assert.equal((await payload(r)).opportunity.channel,saved,typed+' is saved as '+saved)}
 r=await mk({channel:'MySpace'});let d=await payload(r);assert.equal(r.status,400);assert.match(d.error,/Choose a channel from the list: LinkedIn/);assert.ok(d.errors.length>=1);
 r=await mk({channel:'',name:'',destination_url:'ftp://x'});d=await payload(r);assert.equal(r.status,400);assert.ok(d.errors.length>=3,'every problem is listed, not one vague sentence');assert.ok(d.errors.some(e=>/name/i.test(e)));assert.ok(d.errors.some(e=>/destination/i.test(e)));
 r=await mk({name:'Hunt verified'});const id=(await payload(r)).opportunity.id;
 const founderList=async()=>(await payload(await call(DB,'/distribution/opportunities',{headers:{Cookie:owner.cookie}}))).opportunities.map(o=>o.name);
 assert.deepEqual(await founderList(),[],'nothing is visible to founders until an admin verifies it');
 r=await call(DB,'/admin/distribution/opportunities/'+id,{method:'PATCH',headers:{Cookie:admin.cookie},body:{status:'verified'}});assert.equal(r.status,200);assert.deepEqual(await founderList(),['Hunt verified'],'verified entry appears in the founder selection list');
 r=await call(DB,'/products',{method:'POST',headers:{Cookie:owner.cookie},body:{name:'Listed',url:'https://listed.example',description:'A product to distribute through a verified opportunity'}});const pid=(await payload(r)).product.id;
 r=await call(DB,'/distribution/activities',{method:'POST',headers:{Cookie:owner.cookie},body:{product_id:pid,opportunity_id:id,title:'Launch post',planned_action:'Submit on launch day',next_action:'Write the tagline'}});assert.equal(r.status,201,await r.clone().text());
 r=await call(DB,'/admin/distribution/opportunities/'+id,{method:'PATCH',headers:{Cookie:admin.cookie},body:{channel:'forum'}});assert.equal(r.status,200);assert.deepEqual(await founderList(),[],'editing a verified entry sends it back for review');
 r=await call(DB,'/distribution/activities',{method:'POST',headers:{Cookie:owner.cookie},body:{product_id:pid,opportunity_id:id,title:'Again',planned_action:'x',next_action:'y'}});assert.equal(r.status,409);assert.match((await payload(r)).error,/verified distribution opportunity/);
 r=await call(DB,'/admin/distribution/opportunities/'+id,{method:'PATCH',headers:{Cookie:owner.cookie},body:{status:'verified'}});assert.equal(r.status,403,'founders cannot verify');
 DB.close();
});
