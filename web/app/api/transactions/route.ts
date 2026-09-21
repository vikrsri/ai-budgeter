import {linkedAccounts} from "@/lib/plaid-service";
import {plaidStatus} from "@/lib/plaid-client";
import {checkOrigin,database,HttpError,ownerId,readTransactions,routeError,runtimeEnv} from "@/lib/server";
import {parseStatement} from "@/lib/import-csv";
import {saveImportedTransactions} from "@/lib/import-service";
export async function GET(request:Request){try{const owner=await ownerId();return Response.json({transactions:await readTransactions(owner),aiConfigured:!!runtimeEnv.OPENAI_API_KEY,accounts:await linkedAccounts(owner),plaid:plaidStatus(runtimeEnv,new URL(request.url).origin)},{headers:{"Cache-Control":"no-store"}});}catch(e){return routeError(e);}}
export async function POST(request:Request){try{
 checkOrigin(request);const owner=await ownerId();
 const raw=await request.text();if(raw.length>2100000)throw new HttpError("The file is too large. Use a CSV under 2 MB.",413);
 let payload;try{payload=JSON.parse(raw);}catch{throw new HttpError("Invalid import request.");}
 if(!payload||typeof payload.csv!=="string"||!["auto","amex","discover","apple"].includes(payload.source??"auto")||(payload.negativePurchases!==undefined&&typeof payload.negativePurchases!=="boolean"))throw new HttpError("Choose a valid CSV statement.");
 let rows;try{rows=parseStatement(payload.csv,payload.source??"auto",payload.negativePurchases??false);}catch(e){throw new HttpError(e instanceof Error?e.message:"Invalid CSV.");}
 const result=await saveImportedTransactions(database(),owner,rows);
 return Response.json({...result,transactions:await readTransactions(owner)},{headers:{"Cache-Control":"no-store"}});
}catch(e){return routeError(e);}}
