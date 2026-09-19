"use client";
type LinkSession={sessionId:string;linkToken:string};
type PlaidHandler={open:()=>void;destroy:()=>void};
type PlaidWindow=Window&{Plaid?:{create:(options:{token:string;receivedRedirectUri?:string;onSuccess:(token:string|null)=>void;onExit:(error:{display_message?:string;error_code?:string}|null)=>void})=>PlaidHandler}};
export async function api<T>(url:string,body?:object):Promise<T>{const response=await fetch(url,{method:body===undefined?"GET":"POST",headers:body===undefined?undefined:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json() as T&{error?:string};if(!response.ok)throw Error(data.error||"The request failed. Please try again.");return data;}
let loader:Promise<void>|undefined;
async function loadPlaid(){if((window as PlaidWindow).Plaid)return;loader??=new Promise<void>((resolve,reject)=>{const script=document.createElement("script");script.src="https://cdn.plaid.com/link/v2/stable/link-initialize.js";script.async=true;script.onload=()=>resolve();script.onerror=()=>{script.remove();loader=undefined;reject(Error("Plaid Link could not load. Check your connection and try again."));};document.head.appendChild(script);});await loader;}
export async function startPlaid(options:{itemId?:string;resume?:boolean;onSaved:(itemId:string)=>Promise<void>;onExit:()=>void;onError:(message:string)=>void}){
 let session:LinkSession;
 if(options.resume){const id=sessionStorage.getItem("ledger_plaid_session");if(!id)throw Error("This connection session is no longer available. Return to Ledger and connect again.");session=await api(`/api/plaid/link-token?sessionId=${encodeURIComponent(id)}`);}
 else{session=await api<LinkSession>("/api/plaid/link-token",{itemId:options.itemId});sessionStorage.setItem("ledger_plaid_session",session.sessionId);}
 await loadPlaid();const sdk=(window as PlaidWindow).Plaid;if(!sdk)throw Error("Plaid Link is unavailable.");
 const handler=sdk.create({token:session.linkToken,...(options.resume?{receivedRedirectUri:window.location.href}:{}),onSuccess:async publicToken=>{try{const result=await api<{itemId:string}>("/api/plaid/exchange",{sessionId:session.sessionId,publicToken:publicToken||""});sessionStorage.removeItem("ledger_plaid_session");await options.onSaved(result.itemId);}catch(e){options.onError(e instanceof Error?e.message:"The connection could not be saved.");}finally{handler.destroy();}},onExit:error=>{handler.destroy();if(error)options.onError(error.display_message||"The card could not be connected. Please retry or check your Plaid Dashboard.");options.onExit();}});
 handler.open();
}
