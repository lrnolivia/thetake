import {authenticate} from './auth.mjs';
import {validate} from '../public/inventory/model.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export function createWorker(auth=authenticate){return {async fetch(request,env){const url=new URL(request.url),test=url.pathname==='/inventory-test'||url.pathname.startsWith('/inventory-test/'),live=url.pathname==='/inventory'||url.pathname.startsWith('/inventory/');if(!test&&!live)return env.ASSETS.fetch(request);const mode=test?'test':'live',prefix=test?'/inventory-test':'/inventory';try{
 if(!['GET','HEAD','PUT'].includes(request.method))return json({error:'Method not allowed'},405);
 const actor=await auth(request,env,mode),db=test?env.INVENTORY_TEST_DB:env.INVENTORY_DB;if(!db)return json({error:'Inventory storage is not ready'},503);
 const path=url.pathname.slice(prefix.length);
 if(path==='/api/session')return json({email:actor.email,role:actor.role,mode});
 if(path==='/api/diagnostics'){if(!test)return json({error:'Not found'},404);await db.prepare('SELECT 1 AS ok').first();return json({service:'inventory',database:'ready',mode,version:env.APP_VERSION||'development'});}
 if(path==='/api/state'){
  if(request.method==='GET'){const row=await db.prepare('SELECT version,state_json,updated_at FROM inventory_state WHERE owner_id=?').bind(actor.id).first();return json({version:row?.version||0,state:row?JSON.parse(row.state_json):null,updatedAt:row?.updated_at||null});}
  if(request.method!=='PUT')return json({error:'Method not allowed'},405);
  if(request.headers.get('Origin')!==url.origin||url.origin!==env.APP_ORIGIN)return json({error:'Invalid request origin'},403);
  if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'Use JSON'},415);
  const body=await request.text();if(body.length>2*1024*1024)return json({error:'Inventory backup is too large'},413);let input;try{input=JSON.parse(body)}catch{return json({error:'Invalid JSON'},400)};
  if(!Number.isSafeInteger(input.version)||input.version<0||typeof input.requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId))return json({error:'Invalid save version'},400);
  let state;try{state=validate(input.state)}catch{return json({error:'Invalid inventory data'},400)}const encoded=JSON.stringify(state);
  // Same request may be retried after a dropped response without a second write.
  const receipt=await db.prepare('SELECT version FROM inventory_state WHERE owner_id=? AND request_id=?').bind(actor.id,input.requestId).first();if(receipt)return json({version:receipt.version});
  const result=await db.prepare(`INSERT INTO inventory_state(owner_id,version,state_json,request_id) SELECT ?,1,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM inventory_state WHERE owner_id=?)
   ON CONFLICT(owner_id) DO UPDATE SET version=inventory_state.version+1,state_json=excluded.state_json,request_id=excluded.request_id,updated_at=CURRENT_TIMESTAMP WHERE inventory_state.version=?
   RETURNING version`).bind(actor.id,encoded,input.requestId,input.version,actor.id,input.version).first();
  if(!result)return json({error:'Another device saved a newer count. Keep a backup of your unsaved changes, then reload the latest version.',code:'conflict'},409);
  return json({version:result.version});
 }
 if(path.startsWith('/api/'))return json({error:'Not found'},404);
 if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
 if(!path)return Response.redirect(url.origin+prefix+'/',302);
 // Both protected spaces use the same static app. APIs remain in their original prefix.
 const assetUrl=new URL(request.url);assetUrl.pathname='/inventory'+path;const response=await env.ASSETS.fetch(new Request(assetUrl,request));const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');return new Response(response.body,{status:response.status,headers});
 }catch(error){return json({error:error.status?error.message:error instanceof SyntaxError?'Invalid data':'Inventory request could not be completed'},error.status||(error instanceof SyntaxError?400:500))}}}}
export default createWorker();
