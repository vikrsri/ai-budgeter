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
export function monthKey(date = new Date()) { return date.toISOString().slice(0,7); }
export function spending(rows: Transaction[]) { return rows.filter(t=>t.kind !== "payment" && !t.pending).reduce((s,t)=>s+t.amount,0); }
export function categoryTotals(rows: Transaction[]) {
 const map = new Map<string, number>(); rows.filter(t=>t.kind!=="payment" && !t.pending).forEach(t=>map.set(t.category,(map.get(t.category)||0)+t.amount));
 return [...map].map(([name,value])=>({name,value})).filter(t=>t.value>0).sort((a,b)=>b.value-a.value);
}

export type LinkedAccount = {id:string; itemId:string; source:Source; name:string; mask:string|null; institution:string; lastSynced:string|null; status:string; errorCode:string|null};
export type PlaidStatus = {ready:boolean; message:string; missing:string[]};
