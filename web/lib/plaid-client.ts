import {HttpError} from "./errors";
export type PlaidConfig={PLAID_CLIENT_ID?:string;PLAID_SECRET?:string;PLAID_ENV?:string;PLAID_TOKEN_ENCRYPTION_KEY?:string;PLAID_REDIRECT_URI?:string};
export class PlaidError extends HttpError {
 constructor(public code:string){super(code==="ITEM_LOGIN_REQUIRED"?"Your card needs to be reconnected. Select Reconnect to sign in again.":code==="INSTITUTION_NOT_RESPONDING"||code==="INSTITUTION_DOWN"?"Your card provider is temporarily unavailable. Please try again later.":code==="INVALID_CREDENTIALS"?"Plaid rejected the configured credentials. Check the Production client ID and secret.":code==="PRODUCT_NOT_ENABLED"?"Enable Transactions for your Plaid Production account before linking cards.":"Plaid could not complete the request. Please try again or check your Plaid Dashboard.",503);}
}
export function plaidStatus(config:PlaidConfig,origin?:string){
 const missing=["PLAID_CLIENT_ID","PLAID_SECRET","PLAID_TOKEN_ENCRYPTION_KEY","PLAID_REDIRECT_URI"].filter(key=>!config[key as keyof PlaidConfig]?.trim());
 if(missing.length)return {ready:false,missing,message:"Plaid setup is required before you can connect your real cards."};
 if((config.PLAID_ENV||"production")!=="production")return {ready:false,missing:[],message:"Only Plaid Production is allowed. Sandbox would add test transactions."};
 try{const key=Uint8Array.from(atob(config.PLAID_TOKEN_ENCRYPTION_KEY!),c=>c.charCodeAt(0));if(key.length!==32)throw Error();}catch{return {ready:false,missing:["PLAID_TOKEN_ENCRYPTION_KEY"],message:"The Plaid token encryption key must be 32 random bytes encoded as Base64."};}
 try{const url=new URL(config.PLAID_REDIRECT_URI!);if(url.protocol!=="https:"||url.pathname!=="/plaid/oauth"||url.search||url.hash||url.username||url.password)throw Error();if(origin&&url.origin!==origin)return {ready:false,missing:[],message:`Open the app at ${url.origin} to connect a card. Plaid OAuth returns to that address.`};}catch{return {ready:false,missing:["PLAID_REDIRECT_URI"],message:"Configure an HTTPS redirect URL ending in /plaid/oauth and allowlist it in Plaid."};}
 return {ready:true,missing:[],message:"Connect securely with Plaid. Only real Production accounts are supported."};
}
export function createPlaidClient(config:PlaidConfig,fetcher:typeof fetch=fetch){
 return async function plaid<T>(path:string,body:Record<string,unknown>):Promise<T>{
  if((config.PLAID_ENV||"production")!=="production"||!config.PLAID_CLIENT_ID||!config.PLAID_SECRET)throw new HttpError("Configure Plaid Production credentials to connect your real cards.",503);
  let response:Response;
  try{response=await fetcher(`https://production.plaid.com${path}`,{method:"POST",headers:{"Content-Type":"application/json","Plaid-Version":"2020-09-14"},body:JSON.stringify({...body,client_id:config.PLAID_CLIENT_ID,secret:config.PLAID_SECRET}),signal:AbortSignal.timeout(25000)});}catch{throw new HttpError("The connection to Plaid timed out. Please try again.",503);}
  const data=await response.json() as T&{error_code?:string};
  if(!response.ok)throw new PlaidError(data.error_code||"UNKNOWN_ERROR");return data;
 };
}
