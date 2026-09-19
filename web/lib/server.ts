import {env} from "cloudflare:workers";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import type {Transaction} from "./transactions";
export class HttpError extends Error { constructor(message:string,public status=400){super(message);} }
export async function ownerId(){const user=await getChatGPTUser();if(!user)throw new HttpError("Sign in to access your transactions.",401);return user.userId;}
export function database(){if(!env.DB)throw new HttpError("Transaction storage is temporarily unavailable. Your import has not been saved.",503);return env.DB;}
export function checkOrigin(request:Request){const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)throw new HttpError("Cross-site request rejected.",403);}
export async function readTransactions(owner:string):Promise<Transaction[]> {
 const result=await database().prepare("SELECT id,date,merchant,amount,source,category,kind FROM transactions WHERE owner = ? ORDER BY date DESC, id DESC LIMIT 50001").bind(owner).all<Transaction>();
 if(result.results.length>50000)throw new HttpError("This workspace has more than 50,000 transactions. Please contact support before adding more.",422);
 return result.results;
}
export function routeError(error:unknown){const status=error instanceof HttpError?error.status:500;if(status===500)console.error("Ledger storage request failed",error instanceof Error?error.message:"Unknown error");return Response.json({error:error instanceof HttpError?error.message:"Unable to load or save transactions. Please try again."},{status,headers:{"Cache-Control":"no-store"}});}
export const runtimeEnv=env as typeof env & {OPENAI_API_KEY?:string;OPENAI_MODEL?:string};
