export type Source = "amex" | "discover" | "other";
export type Transaction = { id: string; date: string; merchant: string; amount: number; source: Source; category: string; kind: "purchase" | "credit" | "payment"; accountId?: string | null; accountName?: string | null; provider?: "csv" | "plaid"; pending?: boolean; currency?: string; };
export const sourceNames = { amex: "American Express", discover: "Discover", other: "Other card" };
export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export const shortDate = (date: string) => new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {month:"short", day:"numeric", timeZone:"UTC"});
export function categoryFor(merchant: string) {
 const text = merchant.toLowerCase();
 if (/payment|autopay|thank you/.test(text)) return "Payments";
 if (/whole foods|trader joe|grocery|kroger|aldi/.test(text)) return "Groceries";
 if (/coffee|starbucks|restaurant|sweetgreen|chipotle|doordash|pizza/.test(text)) return "Food & drink";
 if (/uber|lyft|shell|transit|parking|gas/.test(text)) return "Transport";
 if (/netflix|spotify|hulu|cinema/.test(text)) return "Entertainment";
 if (/adobe|notion|openai|icloud|software/.test(text)) return "Software";
 if (/fitness|gym|yoga/.test(text)) return "Health";
 if (/electric|internet|comcast|verizon|at&t/.test(text)) return "Bills & utilities";
 if (/airline|hotel|airbnb|united|delta/.test(text)) return "Travel";
 return "Shopping";
}
export function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`; }
export function isDiscoverDirectPay(description:string,source:Source,amount:number) {
 return source==="discover" && amount<0 && /^DIRECTPAY FULL BALANCE(?:\s|$)/i.test(description.trim());
}
// Apply current classification to saved history too; Plaid may never modify an old payment again.
export function normalizeStoredTransaction(transaction:Transaction):Transaction {
 return transaction.kind==="credit" && isDiscoverDirectPay(transaction.merchant,transaction.source,transaction.amount)
  ? {...transaction,kind:"payment",category:"Payments"}
  : transaction;
}
export function spendingBreakdown(rows:Transaction[]) {
 let purchases=0,credits=0,payments=0,pendingPurchases=0,pendingCount=0,paymentCount=0;
 for(const t of rows) {
  if(t.pending){pendingCount++;if(t.kind!=="payment"&&t.amount>0)pendingPurchases+=t.amount;continue;}
  if(t.kind==="payment"){payments+=Math.abs(t.amount);paymentCount++;continue;}
  if(t.amount>0)purchases+=t.amount;else credits-=t.amount;
 }
 return {purchases,credits,net:purchases-credits,payments,paymentCount,pendingPurchases,pendingCount};
}
export function spending(rows: Transaction[]) { return spendingBreakdown(rows).net; }
export function categoryTotals(rows: Transaction[],basis:"net"|"purchases"="net") {
 const map = new Map<string, number>(); rows.filter(t=>t.kind!=="payment" && !t.pending && (basis==="net"||t.amount>0)).forEach(t=>map.set(t.category,(map.get(t.category)||0)+t.amount));
 // Net categories retain negative credits so their sum reconciles with net spending.
 return [...map].map(([name,value])=>({name,value})).filter(t=>t.value!==0).sort((a,b)=>b.value-a.value);
}

export type LinkedAccount = {id:string; itemId:string; source:Source; name:string; mask:string|null; institution:string; lastSynced:string|null; status:string; errorCode:string|null};
export type PlaidStatus = {ready:boolean; message:string; missing:string[]};

export function transactionAccountKey(transaction:Transaction) {
 return transaction.provider==="plaid"?`plaid:${transaction.accountId||""}`:`csv:${transaction.source}`;
}
export function accountOptions(accounts:LinkedAccount[],rows:Transaction[],provider:"plaid"|"csv") {
 if(provider==="plaid")return accounts.filter(a=>a.status!=="disconnected").map(a=>({
  value:`plaid:${a.id}`,
  label:[...new Set([a.institution,a.name].filter(Boolean)),a.mask?`••${a.mask}`:""].filter(Boolean).join(" · "),
 }));
 return [...new Set(rows.filter(t=>(t.provider||"csv")==="csv").map(t=>t.source))]
  .map(source=>({value:`csv:${source}`,label:sourceNames[source]})).sort((a,b)=>a.label.localeCompare(b.label));
}
export function isAccountSelection(value:unknown,provider:"plaid"|"csv"):value is string {
 return typeof value==="string"&&(value==="all"||(provider==="csv"?["csv:amex","csv:discover","csv:other"].includes(value):value.startsWith("plaid:")&&value.length>6&&value.length<=256));
}
export function filterAccountTransactions(rows:Transaction[],provider:"plaid"|"csv",account:string) {
 return rows.filter(t=>(t.provider||"csv")===provider&&(account==="all"||transactionAccountKey(t)===account));
}
