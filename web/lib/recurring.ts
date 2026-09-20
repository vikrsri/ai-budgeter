import type {Transaction,Source} from "./transactions";

export type Recurring={id:string;merchant:string;source:Source;amount:number;monthly:number;cadence:string;confidence:"Likely"|"Possible";count:number;lastDate:string;nextDate:string;overdue:boolean;variableAmount:boolean;missedCycles:boolean;history:Transaction[]};
const dayMs=86400000;
const utc=(s:string)=>new Date(s+"T12:00:00Z");
const median=(xs:number[])=>{const a=[...xs].sort((a,b)=>a-b);return a.length%2?a[Math.floor(a.length/2)]:(a[a.length/2-1]+a[a.length/2])/2;};
const patterns=[
 {name:"Weekly",days:7,tolerance:2,months:0,factor:52/12},
 {name:"Every 2 weeks",days:14,tolerance:2,months:0,factor:26/12},
 {name:"Monthly",days:30.44,tolerance:5,months:1,factor:1},
 {name:"Every 2 months",days:60.88,tolerance:6,months:2,factor:1/2},
 {name:"Quarterly",days:91.31,tolerance:8,months:3,factor:1/3},
 {name:"Every 6 months",days:182.63,tolerance:12,months:6,factor:1/6},
 {name:"Yearly",days:365.25,tolerance:15,months:12,factor:1/12},
];
type Pattern=typeof patterns[number];

export function advanceDate(date:string,months:number,days:number) {
 const d=utc(date);if(months){const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}else d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}

function intervalCycles(previous:Transaction,current:Transaction,pattern:Pattern) {
 const gap=(+utc(current.date)-+utc(previous.date))/dayMs;
 if(gap<=0)return 0;
 // Allow one missing cycle, but require consecutive cycles elsewhere in the series.
 for(const cycles of [1,2]) {
  const expected=advanceDate(previous.date,pattern.months*cycles,pattern.months?0:pattern.days*cycles);
  if(Math.abs((+utc(current.date)-+utc(expected))/dayMs)<=pattern.tolerance)return cycles;
 }
 return 0;
}

export function detectRecurring(rows:Transaction[],today=new Date().toISOString().slice(0,10)):Recurring[] {
 const groups=new Map<string,Transaction[]>();
 for(const row of rows.filter(t=>t.kind==="purchase"&&!t.pending&&t.amount>0)) {
  const key=(row.accountId||`${row.provider||"csv"}:${row.source}`)+":"+row.merchant.toLowerCase().replace(/\s+#?\d{4,}$/g,"").replace(/\s+/g," ").trim();
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key)!.push(row);
 }
 const result:Recurring[]=[];
 for(const [groupId,history] of groups) {
  history.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  if(history.length<2)continue;
  // Exact-price streams separate memberships from unrelated purchases at the same merchant.
  // The full stream also recognizes price changes and regularly timed variable bills.
  const byAmount=new Map<number,Transaction[]>();
  for(const t of history){if(!byAmount.has(t.amount))byAmount.set(t.amount,[]);byAmount.get(t.amount)!.push(t);}
  const priceBands:Transaction[][]=[];
  for(const t of [...history].sort((a,b)=>a.amount-b.amount)) {
   const band=priceBands.at(-1);
   if(band&&t.amount<=band[0].amount*1.2)band.push(t);else priceBands.push([t]);
  }
  const streams=[history,...byAmount.values(),...priceBands].filter(stream=>stream.length>=2).map(stream=>[...stream].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)));
  const candidates:Recurring[]=[],seen=new Set<string>();
  for(const stream of streams)for(const pattern of patterns) {
   let run:Transaction[]=[],cycles:number[]=[];
   function finish() {
    if(run.length<2)return;
    const direct=cycles.filter(n=>n===1).length,missedCycles=cycles.some(n=>n>1);
    if(!direct||direct<cycles.length/2||(missedCycles&&run.length<3))return;
    const typical=median(run.map(t=>t.amount)),variableAmount=run.some(t=>Math.abs(t.amount-typical)/typical>.2);
    if(variableAmount&&(run.length<3||run.length/history.length<.6))return;
    // Nearby prices at a busy store can align by chance. A mixed-price pattern
    // needs to explain most of its merchant's history; exact fees can stand alone.
    if(new Set(run.map(t=>t.amount)).size>1&&run.length/history.length<.6)return;
    if(run.length===2&&Math.abs(run[0].amount-run[1].amount)/typical>.03)return;
    // Two matching charges inside a busy merchant's history aren't enough evidence.
    if(run.length===2&&history.length>2&&pattern.months!==12)return;
    const signature=pattern.name+":"+run.map(t=>t.id).join("|");if(seen.has(signature))return;seen.add(signature);
    const latest=run[run.length-1],nextDate=advanceDate(latest.date,pattern.months,pattern.months?0:pattern.days);
    candidates.push({id:`${groupId}:${pattern.name}:${run[0].id}`,merchant:latest.merchant,source:latest.source,amount:latest.amount,monthly:Math.round(latest.amount*pattern.factor),cadence:pattern.name,confidence:run.length>=3&&!missedCycles&&!variableAmount?"Likely":"Possible",count:run.length,lastDate:latest.date,nextDate,overdue:+utc(today)-+utc(nextDate)>Math.max(7,pattern.tolerance)*dayMs,variableAmount,missedCycles,history:[...run].reverse()});
   }
   for(const t of stream) {
    const n=run.length?intervalCycles(run[run.length-1],t,pattern):0;
    if(run.length&&!n){finish();run=[];cycles=[];}
    if(run.length)cycles.push(n);run.push(t);
   }
   finish();
  }
  // Keep distinct subscriptions, but never count one charge in two patterns.
  const used=new Set<string>();
  candidates.sort((a,b)=>Number(b.confidence==="Likely")-Number(a.confidence==="Likely")||b.count-a.count||Number(a.missedCycles)-Number(b.missedCycles)||b.lastDate.localeCompare(a.lastDate));
  for(const candidate of candidates) {
   if(candidate.history.some(t=>used.has(t.id)))continue;
   candidate.history.forEach(t=>used.add(t.id));result.push(candidate);
  }
 }
 return result.sort((a,b)=>Number(a.overdue)-Number(b.overdue)||a.nextDate.localeCompare(b.nextDate)||a.merchant.localeCompare(b.merchant));
}
