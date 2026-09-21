import type {ParsedTransaction} from "./import-csv";

export async function saveImportedTransactions(db:D1Database,owner:string,rows:ParsedTransaction[]) {
 const now=new Date().toISOString();
 const statements=await Promise.all(rows.map(async t=>{
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t.dedupeKey));
  const id=Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,"0")).join("");
  return db.prepare("INSERT INTO transactions (owner,id,date,merchant,amount,source,category,kind,imported_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO NOTHING").bind(owner,id,t.date,t.merchant,t.amount,t.source,t.category,t.kind,now);
 }));
 // Transactions persist the imported card's stable source identity. The first
 // successful import creates its card entry; subsequent imports reuse it.
 const results=await db.batch(statements),added=results.reduce((sum,r)=>sum+(r.meta.changes||0),0);
 return {added,duplicates:rows.length-added,source:rows[0].source};
}
