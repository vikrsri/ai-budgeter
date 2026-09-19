import {database,HttpError,runtimeEnv} from "./server";
import {createPlaidClient,PlaidError,plaidStatus} from "./plaid-client";
import {encryptToken,decryptToken} from "./plaid-crypto";
import {collectSync,issuerSource,normalizePlaid,type PlaidAccount,type SyncPage} from "./plaid-data";
import type {LinkedAccount} from "./transactions";
const plaid=createPlaidClient(runtimeEnv);
const binding=(owner:string,id:string)=>JSON.stringify([owner,id]);
const secret=()=>runtimeEnv.PLAID_TOKEN_ENCRYPTION_KEY||"";
export type Item={owner:string;id:string;access_token:string;institution_id:string|null;institution:string;cursor:string;status:string;sync_lock:string|null;last_synced:string|null};
export async function getItem(owner:string,id:string){const item=await database().prepare("SELECT * FROM plaid_items WHERE owner=? AND id=?").bind(owner,id).first<Item>();if(!item)throw new HttpError("Card connection not found.",404);if(item.status==="disconnected")throw new HttpError("This connection was disconnected. Link your card again.",409);return item;}
export async function linkedAccounts(owner:string){return (await database().prepare("SELECT COALESCE(a.id,i.id) AS id,i.id AS itemId,COALESCE(a.source,'other') AS source,COALESCE(a.name,'Awaiting card details') AS name,a.mask,i.institution,i.last_synced AS lastSynced,i.status,i.error_code AS errorCode FROM plaid_items i LEFT JOIN plaid_accounts a ON i.owner=a.owner AND i.id=a.item_id AND a.active=1 WHERE i.owner=? AND i.status<>'disconnected' ORDER BY i.institution,a.name").bind(owner).all<LinkedAccount>()).results;}
export async function createLink(owner:string,origin:string,itemId?:string){
 const status=plaidStatus(runtimeEnv,origin);if(!status.ready)throw new HttpError(status.message,503);
 const db=database(),id=crypto.randomUUID();
 const config:Record<string,unknown>={user:{client_user_id:owner},client_name:"Ledger",country_codes:["US"],language:"en",redirect_uri:runtimeEnv.PLAID_REDIRECT_URI};
 if(itemId){const item=await getItem(owner,itemId);config.access_token=await decryptToken(item.access_token,secret(),binding(owner,itemId));}
 else{config.products=["transactions"];config.transactions={days_requested:730};config.account_filters={credit:{account_subtypes:["credit card"]}};}
 const result=await plaid<{link_token:string;expiration:string}>("/link/token/create",config);
 await db.prepare("INSERT INTO plaid_link_sessions(owner,id,link_token,update_item_id,expires_at,state) VALUES(?,?,?,?,?,?)").bind(owner,id,await encryptToken(result.link_token,secret(),binding(owner,id)),itemId||null,Date.parse(result.expiration),"pending").run();
 return {sessionId:id,linkToken:result.link_token};
}
export async function resumeLink(owner:string,id:string){const session=await database().prepare("SELECT link_token,expires_at,state FROM plaid_link_sessions WHERE owner=? AND id=?").bind(owner,id).first<{link_token:string;expires_at:number;state:string}>();if(!session||session.expires_at<Date.now()||session.state!=="pending")throw new HttpError("This connection session expired. Start Connect a card again.",410);return {sessionId:id,linkToken:await decryptToken(session.link_token,secret(),binding(owner,id))};}
export async function exchangeLink(owner:string,sessionId:string,publicToken:string){
 const db=database();const session=await db.prepare("SELECT * FROM plaid_link_sessions WHERE owner=? AND id=?").bind(owner,sessionId).first<{state:string;item_id:string|null;update_item_id:string|null;expires_at:number}>();
 if(!session||session.expires_at<Date.now())throw new HttpError("This connection session expired. Please connect again.",410);
 if(session.state==="complete"&&session.item_id)return {itemId:session.item_id};
 const lock=await db.prepare("UPDATE plaid_link_sessions SET state='exchanging' WHERE owner=? AND id=? AND state='pending'").bind(owner,sessionId).run();
 if(!lock.meta.changes)throw new HttpError("This connection is already being saved. Wait a moment and refresh your accounts.",409);
 if(session.update_item_id){await db.batch([db.prepare("UPDATE plaid_link_sessions SET state='complete',item_id=?,link_token='' WHERE owner=? AND id=?").bind(session.update_item_id,owner,sessionId),db.prepare("UPDATE plaid_items SET status='connected',error_code=NULL WHERE owner=? AND id=?").bind(owner,session.update_item_id)]);return {itemId:session.update_item_id};}
 if(!publicToken.startsWith("public-production-")){await db.prepare("UPDATE plaid_link_sessions SET state='pending' WHERE owner=? AND id=?").bind(owner,sessionId).run();throw new HttpError("Only a real Plaid Production connection can be saved.");}
 let accessToken:string|undefined;let itemId:string|undefined;let saved=false;
 try{
  const result=await plaid<{access_token:string;item_id:string}>("/item/public_token/exchange",{public_token:publicToken});accessToken=result.access_token;itemId=result.item_id;
  // Persist credentials immediately, before any follow-up institution or transaction calls.
  await db.batch([db.prepare("INSERT INTO plaid_items(owner,id,access_token,created_at) VALUES(?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET access_token=excluded.access_token,status='connected',error_code=NULL").bind(owner,itemId,await encryptToken(accessToken,secret(),binding(owner,itemId)),new Date().toISOString()),db.prepare("UPDATE plaid_link_sessions SET state='complete',item_id=?,link_token='' WHERE owner=? AND id=?").bind(itemId,owner,sessionId)]);saved=true;
  return {itemId};
 }catch(error){if(accessToken&&!saved){try{await plaid("/item/remove",{access_token:accessToken});}catch{/* Never log a token. */}}throw error;}
}
export async function syncItem(owner:string,id:string){
 const db=database(),item=await getItem(owner,id),lock=crypto.randomUUID();
 const acquired=await db.prepare("UPDATE plaid_items SET sync_lock=?,sync_lock_until=? WHERE owner=? AND id=? AND sync_lock_until<? AND status<>'disconnected'").bind(lock,Date.now()+180000,owner,id,Date.now()).run();
 if(!acquired.meta.changes)throw new HttpError("This card is already syncing. Try again shortly.",409);
 const condition="EXISTS (SELECT 1 FROM plaid_items WHERE owner=? AND id=? AND sync_lock=? AND status<>'disconnected')";
 try{
  const token=await decryptToken(item.access_token,secret(),binding(owner,id));
  const info=await plaid<{item:{institution_id:string;institution_name?:string}}>("/item/get",{access_token:token});
  const institution=info.item.institution_name||(await plaid<{institution:{name:string}}>("/institutions/get_by_id",{institution_id:info.item.institution_id,country_codes:["US"]})).institution.name;
  // One active connection per institution avoids duplicate Items and double-counted history.
  const duplicate=await db.prepare("SELECT id FROM plaid_items WHERE owner=? AND institution_id=? AND id<>? AND status<>'disconnected' LIMIT 1").bind(owner,info.item.institution_id,id).first();
  if(duplicate){await plaid("/item/remove",{access_token:token});await db.prepare("UPDATE plaid_items SET status='disconnected',access_token='' WHERE owner=? AND id=?").bind(owner,id).run();throw new HttpError("This institution is already connected. Use its existing Sync or Reconnect button.",409);}
  const {accounts}=await plaid<{accounts:PlaidAccount[]}>("/accounts/get",{access_token:token});
  const credit=accounts.filter(a=>a.type==="credit");if(!credit.length)throw new HttpError("No credit card accounts were shared. Reconnect and select your credit card.",422);
  const data=await collectSync(item.cursor,cursor=>plaid<SyncPage>("/transactions/sync",{access_token:token,cursor,count:500}));
  const accountMap=new Map(credit.map(a=>[a.account_id,a])),source=issuerSource(institution),now=new Date().toISOString();let skippedCurrency=0;
  const changes:D1PreparedStatement[]=[db.prepare(`UPDATE plaid_accounts SET active=0 WHERE owner=? AND item_id=? AND ${condition}`).bind(owner,id,owner,id,lock)];
  for(const a of credit)changes.push(db.prepare(`INSERT INTO plaid_accounts(owner,id,item_id,source,name,mask,active) SELECT ?,?,?,?,?,?,1 WHERE ${condition} ON CONFLICT(owner,id) DO UPDATE SET name=excluded.name,mask=excluded.mask,source=excluded.source,active=1`).bind(owner,a.account_id,id,source,a.official_name||a.name,a.mask,owner,id,lock));
  for(const t of data.upserts){const account=accountMap.get(t.account_id);if(!account)continue;const row=normalizePlaid(t,account,source);if(!row){skippedCurrency++;continue;}changes.push(db.prepare(`INSERT INTO transactions(owner,id,date,merchant,amount,source,category,kind,imported_at,provider,account_id,pending,currency) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${condition} ON CONFLICT(owner,id) DO UPDATE SET date=excluded.date,merchant=excluded.merchant,amount=excluded.amount,category=excluded.category,kind=excluded.kind,pending=excluded.pending,account_id=excluded.account_id,source=excluded.source`).bind(owner,row.id,row.date,row.merchant,row.amount,row.source,row.category,row.kind,now,"plaid",row.accountId,row.pending?1:0,"USD",owner,id,lock));}
  for(const removed of data.removed)changes.push(db.prepare(`DELETE FROM transactions WHERE owner=? AND id=? AND provider='plaid' AND ${condition}`).bind(owner,`plaid:${removed}`,owner,id,lock));
  changes.push(db.prepare("UPDATE plaid_items SET cursor=?,institution_id=?,institution=?,last_synced=?,status='connected',error_code=NULL WHERE owner=? AND id=? AND sync_lock=? AND status<>'disconnected'").bind(data.cursor,info.item.institution_id,institution,now,owner,id,lock));
  // The snapshot and cursor commit atomically. An expired/stolen lock makes every write a no-op.
  const results=await db.batch(changes);if(!results.at(-1)?.meta.changes)throw new HttpError("Another sync replaced this request. Please refresh.",409);
  return {itemId:id,changed:data.upserts.length+data.removed.length,lastSynced:now,waitingForHistory:data.status==="NOT_READY"||!data.status&&!item.last_synced&&!data.upserts.length||data.status==="INITIAL_UPDATE_COMPLETE",skippedCurrency};
 }catch(error){if(error instanceof PlaidError){await db.prepare("UPDATE plaid_items SET error_code=?,status=? WHERE owner=? AND id=? AND sync_lock=?").bind(error.code,error.code==="ITEM_LOGIN_REQUIRED"?"needs_reconnection":"error",owner,id,lock).run();}throw error;}
 finally{await db.prepare("UPDATE plaid_items SET sync_lock=NULL,sync_lock_until=0 WHERE owner=? AND id=? AND sync_lock=?").bind(owner,id,lock).run();}
}
export async function disconnectItem(owner:string,id:string){const db=database(),item=await getItem(owner,id);await plaid("/item/remove",{access_token:await decryptToken(item.access_token,secret(),binding(owner,id))});await db.batch([db.prepare("UPDATE plaid_items SET status='disconnected',access_token='',sync_lock=NULL,sync_lock_until=0 WHERE owner=? AND id=?").bind(owner,id),db.prepare("UPDATE plaid_accounts SET active=0 WHERE owner=? AND item_id=?").bind(owner,id)]);}
