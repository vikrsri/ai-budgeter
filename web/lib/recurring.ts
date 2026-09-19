import type {Transaction,Source} from "./transactions";
export type Recurring={id:string;merchant:string;source:Source;amount:number;monthly:number;cadence:string;confidence:"Likely"|"Possible";count:number;lastDate:string;nextDate:string;overdue:boolean;history:Transaction[]};
const dayMs=86400000;
const utc=(s:string)=>new Date(s+"T12:00:00Z");
const median=(xs:number[])=>{const a=[...xs].sort((a,b)=>a-b);return a.length%2?a[Math.floor(a.length/2)]:(a[a.length/2-1]+a[a.length/2])/2;};
export function advanceDate(date:string,months:number,days:number) {
 const d=utc(date);if(months){const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}else d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
export function detectRecurring(rows:Transaction[],today=new Date().toISOString().slice(0,10)):Recurring[] {
 const groups=new Map<string,Transaction[]>();
 for(const row of rows.filter(t=>t.kind==="purchase"&&t.amount>0)) {
  const key=row.source+":"+row.merchant.toLowerCase().replace(/\s+#?\d{4,}$/g,"").replace(/\s+/g," ").trim();groups.set(key,[...(groups.get(key)||[]),row]);
 }
 const result:Recurring[]=[];
 for(const [id,history] of groups) {
  history.sort((a,b)=>a.date.localeCompare(b.date));if(history.length<2)continue;
  // A recent run is enough; unrelated older purchases do not poison it.
  const sample=history.slice(-6),intervals=sample.slice(1).map((t,i)=>(+utc(t.date)-+utc(sample[i].date))/dayMs);
  const patterns=[{name:"Weekly",days:7,tolerance:2,months:0,factor:52/12},{name:"Every 2 weeks",days:14,tolerance:2,months:0,factor:26/12},{name:"Monthly",days:30.44,tolerance:5,months:1,factor:1},{name:"Quarterly",days:91.31,tolerance:8,months:3,factor:1/3},{name:"Yearly",days:365.25,tolerance:15,months:12,factor:1/12}];
  const pattern=patterns.find(p=>intervals.every(n=>Math.abs(n-p.days)<=p.tolerance));if(!pattern)continue;
  const amount=median(sample.map(t=>t.amount));
  if(sample.some(t=>Math.abs(t.amount-amount)/amount>.20))continue;
  const latest=sample[sample.length-1],nextDate=advanceDate(latest.date,pattern.months,pattern.days);
  result.push({id,merchant:latest.merchant,source:latest.source,amount:latest.amount,monthly:Math.round(latest.amount*pattern.factor),cadence:pattern.name,confidence:sample.length>=3?"Likely":"Possible",count:history.length,lastDate:latest.date,nextDate,overdue:+utc(today)-+utc(nextDate)>7*dayMs,history:[...history].reverse()});
 }
 return result.sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
}
