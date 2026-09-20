import {env} from "cloudflare:workers";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import {normalizeStoredTransaction,type Transaction} from "./transactions";
import {HttpError} from "./errors";
export {HttpError} from "./errors";
export async function ownerId(){const user=await getChatGPTUser();if(!user)throw new HttpError("Sign in to access your transactions.",401);return user.userId;}
export function database(){if(!env.DB)throw new HttpError("Transaction storage is temporarily unavailable. Your import has not been saved.",503);return env.DB;}
export function checkOrigin(request:Request){const origin=request.headers.get("origin");if(request.headers.get("sec-fetch-site")==="cross-site"||(origin&&origin!==new URL(request.url).origin))throw new HttpError("Cross-site request rejected.",403);}
export async function readTransactions(owner:string):Promise<Transaction[]> {
 const result=await database().prepare("SELECT t.id,t.date,t.merchant,t.amount,t.source,t.category,t.kind,t.provider,t.pending,t.currency,t.account_id AS accountId,CASE WHEN a.mask IS NOT NULL THEN a.name || ' · ' || a.mask ELSE a.name END AS accountName FROM transactions t LEFT JOIN plaid_accounts a ON a.owner=t.owner AND a.id=t.account_id WHERE t.owner = ? ORDER BY t.date DESC,t.id DESC LIMIT 50001").bind(owner).all<Transaction>();
 if(result.results.length>50000)throw new HttpError("This workspace has more than 50,000 transactions. Please contact support before adding more.",422);
 return result.results.map(t=>normalizeStoredTransaction({...t,pending:!!t.pending}));
}
export function routeError(error:unknown){const status=error instanceof HttpError?error.status:500;if(status===500)console.error("Ledger storage request failed",error instanceof Error?error.message:"Unknown error");return Response.json({error:error instanceof HttpError?error.message:"Unable to load or save transactions. Please try again."},{status,headers:{"Cache-Control":"no-store"}});}
export const runtimeEnv=env as typeof env & {OPENAI_API_KEY?:string;OPENAI_MODEL?:string;PLAID_CLIENT_ID?:string;PLAID_SECRET?:string;PLAID_ENV?:string;PLAID_TOKEN_ENCRYPTION_KEY?:string;PLAID_REDIRECT_URI?:string};
