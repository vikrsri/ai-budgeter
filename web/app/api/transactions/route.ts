import {checkOrigin,database,HttpError,ownerId,readTransactions,routeError,runtimeEnv} from "@/lib/server";
import {parseStatement} from "@/lib/import-csv";
export async function GET(){try{const owner=await ownerId();return Response.json({transactions:await readTransactions(owner),aiConfigured:!!runtimeEnv.OPENAI_API_KEY},{headers:{"Cache-Control":"no-store"}});}catch(e){return routeError(e);}}
export async function POST(request:Request){try{
 checkOrigin(request);const owner=await ownerId();
 const raw=await request.text();if(raw.length>2100000)throw new HttpError("The file is too large. Use a CSV under 2 MB.",413);
 let payload;try{payload=JSON.parse(raw);}catch{throw new HttpError("Invalid import request.");}
 if(typeof payload.csv!=="string"||!["amex","discover"].includes(payload.source)||typeof payload.negativePurchases!=="boolean")throw new HttpError("Choose a card and valid CSV file.");
 let rows;try{rows=parseStatement(payload.csv,payload.source,payload.negativePurchases);}catch(e){throw new HttpError(e instanceof Error?e.message:"Invalid CSV.");}
 const db=database(),now=new Date().toISOString();
 const statements=await Promise.all(rows.map(async t=>{
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t.dedupeKey));const id=Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,"0")).join("");
  return db.prepare("INSERT INTO transactions (owner,id,date,merchant,amount,source,category,kind,imported_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO NOTHING").bind(owner,id,t.date,t.merchant,t.amount,t.source,t.category,t.kind,now);
 }));
 // D1 batch is transactional: validation or insert failure cannot leave a partial import.
 const results=await db.batch(statements),added=results.reduce((sum,r)=>sum+(r.meta.changes||0),0);
 return Response.json({added,duplicates:rows.length-added,transactions:await readTransactions(owner)},{headers:{"Cache-Control":"no-store"}});
}catch(e){return routeError(e);}}
