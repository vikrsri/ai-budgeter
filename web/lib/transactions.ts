export type Source = "amex" | "discover" | "apple" | "other";
export type Transaction = { id: string; date: string; merchant: string; amount: number; source: Source; category: string; kind: "purchase" | "credit" | "payment"; accountId?: string | null; accountName?: string | null; provider?: "csv" | "plaid"; pending?: boolean; currency?: string; };
export const sourceNames = { amex: "American Express", discover: "Discover", apple: "Apple Card", other: "Other card" };
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
export function statementMerchant(merchant:string,description=merchant) {
 // The bank's explicit Oura descriptor is stronger evidence than an enriched label.
 return /\bOURA[\s-]*RING\b/i.test(description)||/^oura$/i.test(merchant.trim())?"Oura Ring":merchant;
}
// Apply current classification to saved history too; Plaid may never modify an old payment again.
export function normalizeStoredTransaction(transaction:Transaction):Transaction {
 let merchant=statementMerchant(transaction.merchant);
 // Confirmed against the Amex statement: this $6.38 Oura membership was labeled
 // "Wea" by Plaid. Legacy rows lack the bank descriptor, so keep this fallback
 // limited to that exact charge signature; don't rename unrelated Wea purchases.
 if(transaction.provider==="plaid"&&transaction.source==="amex"&&transaction.amount===638&&transaction.kind==="purchase"&&/^wea$/i.test(merchant.trim()))merchant="Oura Ring";
 const corrected=merchant===transaction.merchant?transaction:{...transaction,merchant};
 return corrected.kind==="credit" && isDiscoverDirectPay(corrected.merchant,corrected.source,corrected.amount)
  ? {...corrected,kind:"payment",category:"Payments"}
  : corrected;
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
export type AccountView="cards"|"plaid"|"csv";
export type ImportedAccount={id:string;source:Source;name:string;count:number;latestDate:string};
export function importedAccounts(rows:Transaction[]):ImportedAccount[] {
 const groups=new Map<Source,ImportedAccount>();
 for(const t of rows.filter(t=>(t.provider||"csv")==="csv")) {
  const existing=groups.get(t.source);
  if(existing){existing.count++;if(t.date>existing.latestDate)existing.latestDate=t.date;}
  else groups.set(t.source,{id:`csv:${t.source}`,source:t.source,name:sourceNames[t.source],count:1,latestDate:t.date});
 }
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
export function accountOptions(accounts:LinkedAccount[],rows:Transaction[],provider:AccountView) {
 const linked=accounts.filter(a=>a.status!=="disconnected").map(a=>({value:`plaid:${a.id}`,label:[...new Set([a.institution,a.name].filter(Boolean)),a.mask?`••${a.mask}`:""].filter(Boolean).join(" · ")}));
 const imported=importedAccounts(rows).filter(a=>provider==="csv"||a.source==="apple").map(a=>({value:a.id,label:a.name}));
 return provider==="plaid"?linked:provider==="csv"?imported:[...linked,...imported];
}
export function isAccountSelection(value:unknown,provider:AccountView):value is string {
 if(typeof value!=="string")return false;
 if(value==="all")return true;
 if(provider!=="csv"&&value.startsWith("plaid:")&&value.length>6&&value.length<=256)return true;
 return provider==="cards"?value==="csv:apple":provider==="csv"&&["csv:amex","csv:discover","csv:apple","csv:other"].includes(value);
}
export function filterAccountTransactions(rows:Transaction[],provider:AccountView,account:string) {
 // Apple CSVs are an additional card. Other CSV statements stay separate from
 // linked cards to avoid counting overlapping Amex/Discover history twice.
 return rows.filter(t=>(provider==="cards"?(t.provider==="plaid"||((t.provider||"csv")==="csv"&&t.source==="apple")):(t.provider||"csv")===provider)&&(account==="all"||transactionAccountKey(t)===account));
}
