export type Source = "amex" | "discover";
export type Transaction = { id: string; date: string; merchant: string; amount: number; source: Source; category: string; kind: "purchase" | "credit" | "payment"; };
export const sourceNames = { amex: "American Express", discover: "Discover" };
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
export function demoTransactions(): Transaction[] {
 const rows: Transaction[] = [], now = new Date();
 const year = now.getUTCFullYear(), month = now.getUTCMonth();
 const add = (m: number, day: number, merchant: string, amount: number, source: Source) => {
  const date = new Date(Date.UTC(year, month - m, day)).toISOString().slice(0, 10);
  if (date > now.toISOString().slice(0,10)) return;
  rows.push({id:`demo-${rows.length}`, date, merchant, amount, source, category:categoryFor(merchant), kind:amount < 0 ? "credit" : "purchase"});
 };
 for (let m = 0; m < 4; m++) {
  add(m,3,"Spotify",1199,"discover"); add(m,6,"Adobe Creative Cloud",5999,"amex"); add(m,9,"Netflix",1799,"amex"); add(m,15,"Notion",1200,"amex"); add(m,21,"Planet Fitness",2499,"discover"); add(m,25,"AT&T Internet",6500,"discover");
  add(m,1,"Whole Foods Market",8743+m*370,"amex"); add(m,4,"Nike",12800+m*875,"discover"); add(m,7,"Sweetgreen",1845+m*300,"amex"); add(m,8,"Trader Joe’s",6428+m*140,"discover"); add(m,10,"United Airlines",34620+m*5000,"amex"); add(m,12,"Blue Bottle Coffee",725+m*100,"amex"); add(m,13,"Amazon",5699+m*2340,"discover"); add(m,14,"Uber",2460+m*840,"amex"); add(m,16,"Whole Foods Market",11236+m*912,"amex"); add(m,17,"Apple Store",7900+m*4950,"discover"); add(m,18,"Sweetgreen",1675+m*212,"amex"); add(m,19,"Amazon",-2499,"discover"); add(m,22,"Trader Joe’s",7461+m*740,"discover"); add(m,26,"Shell",4835+m*400,"discover"); add(m,28,"West Elm",24600+m*9050,"amex");
 }
 return rows.sort((a,b)=>b.date.localeCompare(a.date));
}
export function monthKey(date = new Date()) { return date.toISOString().slice(0,7); }
export function spending(rows: Transaction[]) { return rows.filter(t=>t.kind !== "payment").reduce((s,t)=>s+t.amount,0); }
export function categoryTotals(rows: Transaction[]) {
 const map = new Map<string, number>(); rows.filter(t=>t.kind!=="payment").forEach(t=>map.set(t.category,(map.get(t.category)||0)+t.amount));
 return [...map].map(([name,value])=>({name,value})).filter(t=>t.value>0).sort((a,b)=>b.value-a.value);
}
