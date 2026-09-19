import { categoryFor, type Source, type Transaction } from "./transactions";
export type ParsedTransaction = Omit<Transaction,"id"> & { dedupeKey: string };
// RFC 4180 quoted fields, escaped quotes, BOM, CRLF, and embedded newlines.
export function csvRows(text:string): string[][] {
 const rows:string[][]=[]; let row:string[]=[],field="",quoted=false,closed=false;
 text=text.replace(/^\uFEFF/,"");
 for(let i=0;i<text.length;i++) {
  const c=text[i];
  if(quoted) { if(c==='"') { if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;} }else field+=c; }
  else if(c==='"'&&!field&&!closed) quoted=true;
  else if(c===','||c==='\n'||c==='\r') {row.push(field);field="";closed=false;if(c!==','){if(row.some(v=>v.trim()))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}}
  else {if(closed&&c.trim())throw Error("Unexpected text after a quoted CSV field.");if(!closed)field+=c;}
 }
 if(quoted)throw Error("An unfinished quoted field was found in the CSV.");
 row.push(field);if(row.some(v=>v.trim()))rows.push(row);
 return rows;
}
export function parseDate(value:string):string {
 const s=value.trim(); let y:number,m:number,d:number;
 let match=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
 if(match){[,y,m,d]=match.map(Number);}else{match=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!match)throw Error(`Unsupported date “${s}”. Use MM/DD/YYYY or YYYY-MM-DD.`);m=Number(match[1]);d=Number(match[2]);y=Number(match[3]);}
 const date=new Date(Date.UTC(y,m-1,d));
 if(y<1900||y>2200||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw Error(`Invalid date “${s}”.`);
 return date.toISOString().slice(0,10);
}
export function parseAmount(value:string):number {
 let s=value.trim().replace(/^\$/,"").replace(/,/g,"");
 if(/^\(.*\)$/.test(s))s="-"+s.slice(1,-1).replace(/^\$/,"");
 if(!/^[+-]?\d+(\.\d{1,2})?$/.test(s))throw Error(`Invalid USD amount “${value}”.`);
 const cents=Math.round(Number(s)*100);if(!Number.isSafeInteger(cents)||Math.abs(cents)>1000000000)throw Error("Amount is outside the supported range.");return cents;
}
export function parseStatement(text:string,source:Source,negativePurchases=false):ParsedTransaction[] {
 if(source!=="amex"&&source!=="discover")throw Error("Choose Amex or Discover.");
 if(text.length>2000000)throw Error("Please use a CSV smaller than 2 MB.");
 const rows=csvRows(text),norm=(s:string)=>s.trim().toLowerCase().replace(/[_\s]+/g," ");
 const headerIndex=rows.findIndex(row=>row.some(c=>["date","trans. date","transaction date","posted date","post date"].includes(norm(c)))&&row.some(c=>["amount","amount (usd)"].includes(norm(c))));
 if(headerIndex<0)throw Error("Could not find Date, Description, and Amount columns. Export transactions as CSV from your card account.");
 const headers=rows[headerIndex].map(norm),find=(names:string[])=>names.map(n=>headers.indexOf(n)).find(i=>i>=0)??-1;
 const dateCol=find(["date","trans. date","transaction date","posted date","post date"]),amountCol=find(["amount","amount (usd)"]),descCol=find(["description","merchant","payee","transaction description"]),catCol=find(["category"]),refCol=find(["reference","reference number","transaction id"]);
 if(descCol<0)throw Error("The CSV needs a Description or Merchant column.");
 const seen=new Map<string,number>(); const data=rows.slice(headerIndex+1);
 if(!data.length)throw Error("This statement has no transactions.");
 if(data.length>5000)throw Error("Import up to 5,000 transactions at a time.");
 return data.map((row,index)=>{
  try {
   const merchant=(row[descCol]||"").trim().replace(/\s+/g," ");if(!merchant||merchant.length>500)throw Error("Missing or overly long merchant description.");
   const date=parseDate(row[dateCol]||""),amount=parseAmount(row[amountCol]||"")*(negativePurchases?-1:1);
   const payment=/\b(payment|autopay)\b|thank you/i.test(merchant),kind=payment?"payment":amount<0?"credit":"purchase";
   const category=payment?"Payments":(row[catCol]?.trim().slice(0,80)||categoryFor(merchant));
   const reference=refCol>=0?row[refCol]?.trim():"";
   const base=JSON.stringify([source,date,merchant.toLowerCase(),amount]);
   const count=(seen.get(base)||0)+1;seen.set(base,count);
   return {date,merchant,amount,source,category,kind,dedupeKey:reference?JSON.stringify([source,"reference",reference]):JSON.stringify([base,count])};
  }catch(e){throw Error(`Row ${headerIndex+index+2}: ${e instanceof Error?e.message:"Invalid transaction."}`);}
 });
}
