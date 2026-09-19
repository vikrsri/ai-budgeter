import {categoryFor,type Source,type Transaction} from "./transactions";
import {PlaidError} from "./plaid-client";
export type PlaidAccount={account_id:string;name:string;official_name:string|null;mask:string|null;type:string;subtype:string|null};
export type PlaidTransaction={transaction_id:string;account_id:string;amount:number;date:string;name:string;merchant_name:string|null;pending:boolean;pending_transaction_id:string|null;iso_currency_code:string|null;personal_finance_category?:{primary:string;detailed:string}|null};
export type SyncPage={added:PlaidTransaction[];modified:PlaidTransaction[];removed:{transaction_id:string}[];next_cursor:string;has_more:boolean;transactions_update_status?:string};
export function issuerSource(institution:string):Source {return /american express|amex/i.test(institution)?"amex":/discover/i.test(institution)?"discover":"other";}
export function normalizePlaid(t:PlaidTransaction,account:PlaidAccount,source:Source):Transaction|null {
 if(account.type!=="credit"||t.iso_currency_code!=="USD")return null;
 const cents=Math.round((Math.abs(t.amount)+Number.EPSILON)*100)*Math.sign(t.amount);
 if(!Number.isSafeInteger(cents)||!/^\d{4}-\d{2}-\d{2}$/.test(t.date))throw Error("Invalid transaction received from Plaid");
 const merchant=t.merchant_name||t.name,detail=t.personal_finance_category?.detailed||"";
 const payment=detail.includes("CREDIT_CARD_PAYMENT")||(!t.merchant_name&&/\bautopay\b|payment received|payment thank you|online payment|automatic payment/i.test(t.name));
 const primary=t.personal_finance_category?.primary||"";
 const categories:Record<string,string>={FOOD_AND_DRINK:"Food & drink",TRANSPORTATION:"Transport",TRAVEL:"Travel",ENTERTAINMENT:"Entertainment",GENERAL_MERCHANDISE:"Shopping",RENT_AND_UTILITIES:"Bills & utilities",MEDICAL:"Health"};
 const category=payment?"Payments":detail.includes("GROCERIES")?"Groceries":categories[primary]||categoryFor(merchant);
 return {id:`plaid:${t.transaction_id}`,date:t.date,merchant,amount:cents,source,category,kind:payment?"payment":cents<0?"credit":"purchase",accountId:account.account_id,accountName:account.name,provider:"plaid",pending:t.pending,currency:"USD"};
}
// Nothing is persisted until every page succeeds; mutation restarts from the original cursor.
export async function collectSync(start:string,getPage:(cursor:string)=>Promise<SyncPage>) {
 for(let attempt=0;attempt<3;attempt++){
  let cursor=start;const upserts=new Map<string,PlaidTransaction>(),removed=new Set<string>();let status="";
  try{
   for(let pageNumber=0;pageNumber<100;pageNumber++){
    const page=await getPage(cursor);
    for(const t of [...page.added,...page.modified]){upserts.set(t.transaction_id,t);removed.delete(t.transaction_id);if(t.pending_transaction_id){upserts.delete(t.pending_transaction_id);removed.add(t.pending_transaction_id);}}
    for(const t of page.removed){upserts.delete(t.transaction_id);removed.add(t.transaction_id);}
    if(page.has_more&&page.next_cursor===cursor)throw Error("Plaid returned a non-advancing cursor");
    cursor=page.next_cursor;status=page.transactions_update_status||status;
    if(!page.has_more)return {cursor,upserts:[...upserts.values()],removed:[...removed],status};
   }
   throw Error("Transaction history exceeds the supported sync size");
  }catch(error){if(error instanceof PlaidError&&error.code==="TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"&&attempt<2)continue;throw error;}
 }
 throw Error("Unable to obtain a consistent transaction update");
}
