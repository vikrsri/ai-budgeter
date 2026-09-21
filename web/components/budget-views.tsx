"use client";
import {useMemo,useState} from "react";
import {ArrowRight,ArrowUpRight,Check,ChevronLeft,ChevronRight,CreditCard,FileSpreadsheet,Loader2,Repeat2,Search,Send,Sparkles,Upload} from "lucide-react";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle} from "@/components/ui/sheet";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {money,shortDate,sourceNames,type Transaction,type Source,type AccountView} from "@/lib/transactions";
import {parseStatement,detectStatementSource,type StatementSource} from "@/lib/import-csv";
import {detectRecurring} from "@/lib/recurring";
import {MerchantIcon,TransactionTable} from "./transaction-table";
export function TransactionsView({rows,onImport}:{rows:Transaction[];onImport:()=>void}) {
 const [query,setQuery]=useState(""),[category,setCategory]=useState("all"),[page,setPage]=useState(0),[sort,setSort]=useState("newest");
 const categories=[...new Set(rows.map(t=>t.category))].sort();
 const filtered=rows.filter(t=>(category==="all"||t.category===category)&&`${t.merchant} ${t.category} ${t.date}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==="amount"?b.amount-a.amount:sort==="oldest"?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
 const pages=Math.max(1,Math.ceil(filtered.length/15)),currentPage=Math.min(page,pages-1);
 return <section className="panel"><div className="transaction-tools"><div className="search-field"><Search size={17}/><Input aria-label="Search transactions" placeholder="Search merchants or transactions…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></div><Select value={category} onValueChange={v=>{setCategory(v);setPage(0);}}><SelectTrigger aria-label="Filter category"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="Sort transactions"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="newest">Newest first</SelectItem><SelectItem value="oldest">Oldest first</SelectItem><SelectItem value="amount">Largest first</SelectItem></SelectContent></Select></div>{filtered.length?<TransactionTable rows={filtered.slice(currentPage*15,currentPage*15+15)}/>:<Empty title="No transactions found" text="Try another search or import a statement for this period." onImport={onImport}/>}<div className="table-pagination"><span>{filtered.length} transactions · payments excluded from spending totals</span><div><button aria-label="Previous page" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={17}/></button><span>{currentPage+1} / {pages}</span><button aria-label="Next page" disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}><ChevronRight size={17}/></button></div></div></section>;
}
function Empty({title,text,onImport}:{title:string;text:string;onImport:()=>void}) {return <div className="empty-state"><FileSpreadsheet size={32}/><h2>{title}</h2><p>{text}</p><button className="primary-button" onClick={onImport}><Upload size={16}/>Import a statement</button></div>;}
export function RecurringView({rows,onImport}:{rows:Transaction[];onImport:()=>void}) {
 const recurring=useMemo(()=>detectRecurring(rows),[rows]);
 const [detailId,setDetailId]=useState<string|null>(null),[query,setQuery]=useState(""),[status,setStatus]=useState("all");
 const detail=recurring.find(r=>r.id===detailId),active=recurring.filter(r=>!r.overdue),monthly=active.reduce((s,r)=>s+r.monthly,0);
 const filtered=recurring.filter(r=>(status==="all"||(status==="current"?!r.overdue:r.overdue))&&`${r.merchant} ${r.cadence} ${r.history[0]?.accountName||sourceNames[r.source]}`.toLowerCase().includes(query.toLowerCase()));
 return <>
  <section className="stats-grid">
   <div className="stat-card"><div className="stat-label">Estimated monthly cost<Repeat2 size={18}/></div><div className="stat-number">{money(monthly)}</div><div className="stat-foot">Current patterns, using the latest charge</div></div>
   <div className="stat-card"><div className="stat-label">All recurring payments</div><div className="stat-number">{recurring.length}</div><div className="stat-foot">{active.length} current · {recurring.length-active.length} past or need review</div></div>
   <div className="stat-card"><div className="stat-label">Estimated yearly cost</div><div className="stat-number">{money(monthly*12)}</div><div className="stat-foot">Assuming current patterns continue</div></div>
  </section>
  <section className="panel">
   <div className="panel-heading"><div><h2>All recurring payments</h2><p>Every detected pattern across your available history, including older payments and changing amounts.</p></div></div>
   <div className="transaction-tools recurring-tools">
    <div className="search-field"><Search size={17}/><Input aria-label="Search recurring payments" placeholder="Search recurring payments…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filter recurring status"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All payments</SelectItem><SelectItem value="current">Current</SelectItem><SelectItem value="past">Past / needs review</SelectItem></SelectContent></Select>
   </div>
   {filtered.length?<Table>
    <TableHeader><TableRow><TableHead>Merchant</TableHead><TableHead>Frequency</TableHead><TableHead>Next expected</TableHead><TableHead>Evidence</TableHead><TableHead className="amount">Last charge</TableHead></TableRow></TableHeader>
    <TableBody>{filtered.map(r=><TableRow key={r.id}>
     <TableCell><button className="merchant merchant-detail" onClick={()=>setDetailId(r.id)}><MerchantIcon name={r.merchant}/><span><strong>{r.merchant}</strong><small>{r.history[0]?.accountName||sourceNames[r.source]}</small></span></button></TableCell>
     <TableCell>{r.cadence}<small className="muted">{r.variableAmount?"Amount varies":""}</small></TableCell>
     <TableCell>{shortDate(r.nextDate)}<small className={r.overdue?"review-note":"muted"}>{r.overdue?"Past / needs review":"Current · estimated"}</small></TableCell>
     <TableCell><span className={`confidence ${r.confidence==="Likely"?"likely":""}`}>{r.confidence}</span><small className="muted">{r.count} matching charges{r.missedCycles?" · gap in history":""}</small></TableCell>
     <TableCell className="amount">{money(r.amount)}<small className="muted">{shortDate(r.lastDate)}</small></TableCell>
    </TableRow>)}</TableBody>
   </Table>:recurring.length?<div className="empty-state"><h2>No matching recurring payments</h2><p>Try another search or choose All payments.</p></div>:<Empty title="No recurring patterns found yet" text="Connect a card or import more history. Two similar charges or at least three regularly timed bills help identify a pattern." onImport={onImport}/>}
   <p className="panel-note">Showing {filtered.length} of {recurring.length} patterns. Recurring analysis always uses all available history, regardless of the dashboard month. These are estimates, not confirmed subscriptions; a new subscription with only one charge may not appear. Select a merchant to review every matching charge.</p>
  </section>
  <Sheet open={!!detail} onOpenChange={open=>!open&&setDetailId(null)}><SheetContent className="detail-sheet recurring-detail"><SheetHeader><SheetTitle>{detail?.merchant}</SheetTitle><SheetDescription>{detail?.cadence} pattern · {detail?.confidence.toLowerCase()} recurring payment</SheetDescription></SheetHeader><div className="sheet-body">
   <p>{detail?.history[0]?.accountName||detail&&sourceNames[detail.source]}</p>
   <p>{detail?.overdue?"Expected date passed:":"Next expected:"} <strong>{detail&&shortDate(detail.nextDate)}</strong>. Timing is estimated from previous charges.</p>
   {detail?.variableAmount&&<p>Amounts vary. The monthly estimate uses the most recent matching charge.</p>}
   {detail?.missedCycles&&<p>There is a gap in the billing history. Review the dates to confirm this payment is still recurring.</p>}
   <h3>All matching transactions ({detail?.count})</h3>{detail?.history.map(t=><div className="history-row" key={t.id}><span>{t.date}</span><strong>{money(t.amount)}</strong></div>)}
  </div></SheetContent></Sheet>
 </>;
}
export function InsightsView({aiConfigured,month,account,accountLabel,provider}:{aiConfigured:boolean;month:string;account:string;accountLabel:string;provider:AccountView}) {
 const [question,setQuestion]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[messages,setMessages]=useState<{question:string;answer:string;engine:string;context:string}[]>([]);
 async function ask(value:string){if(!value.trim()||busy)return;setBusy(true);setError("");try{const response=await fetch("/api/insights",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:value,month,account,provider})});const data=await response.json() as {error?:string;answer:string;engine:string};if(!response.ok)throw Error(data.error);setMessages(m=>[...m,{question:value,answer:data.answer,engine:data.engine,context:`${month==="all"?"All time":month} · ${accountLabel} · ${provider==="cards"?"My cards":provider==="plaid"?"Connected cards":"CSV statements"}`}]);setQuestion("");}catch(e){setError(e instanceof Error?e.message:"Could not get an answer.");}finally{setBusy(false);}}
 return <section className="panel insights-view"><div className="insights-intro"><span className="insight-symbol"><Sparkles size={24}/></span><span className="engine-tag">{aiConfigured?"AI connected":"Instant analysis · AI not connected"}</span><h2>A clearer picture starts<br/>with a good question.</h2><p>{aiConfigured?"Ask about your spending and recurring payments. Your question and a transaction summary are sent to OpenAI when you ask.":"Explore calculated summaries now. Live AI answers will become available once an AI connection is configured."}</p></div><div className="suggestions">{["Where did my money go?","What payments are recurring?","Compare my cards","How has my spending changed?"].map(q=><button key={q} disabled={busy} onClick={()=>ask(q)}><Sparkles size={15}/>{q}<ArrowUpRight size={15}/></button>)}</div><div className="chat-messages" aria-live="polite">{messages.map((m,i)=><div className="chat-exchange" key={i}><div className="user-message">{m.question}</div><div className="assistant-message"><span className="answer-label"><Sparkles size={15}/>{m.engine==="openai"?"Ledger AI":"Instant analysis"}<small>{m.context}</small></span><p>{m.answer}</p></div></div>)}{busy&&<div className="thinking"><Loader2 size={18} className="animate-spin"/>Looking through your spending…</div>}</div>{error&&<p className="form-error" role="alert">{error}</p>}<form className="ask-form" onSubmit={e=>{e.preventDefault();void ask(question);}}><Input aria-label="Ask about your spending" placeholder="Ask about your spending…" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={1000}/><button className="primary-button" aria-label="Send question" disabled={busy||!question.trim()}><Send size={17}/></button></form><p className="insights-footnote">Answers reflect the selected period and account. Recurring analysis uses all available history.</p></section>;
}
export function ImportDialog({open,onOpenChange,onImported}:{open:boolean;onOpenChange:(open:boolean)=>void;onImported:(rows:Transaction[],added:number,duplicates:number,source:Source)=>void}) {
 const [source,setSource]=useState<StatementSource>("auto"),[csv,setCsv]=useState(""),[filename,setFilename]=useState(""),[negative,setNegative]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const parsed=useMemo(()=>{
  let detected:Source|null=null;
  if(!csv)return {rows:[],source:detected,error:""};
  try{detected=detectStatementSource(csv);const rows=parseStatement(csv,source,negative);return {rows,source:rows[0].source,error:""};}
  catch(e){return {rows:[],source:detected,error:e instanceof Error?e.message:"Invalid CSV."};}
 },[csv,source,negative]);
 const apple=parsed.source==="apple";
 async function commit(){setBusy(true);setError("");try{
  const response=await fetch("/api/transactions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source,csv,negativePurchases:negative})});
  const data=await response.json() as {error?:string;transactions:Transaction[];added:number;duplicates:number;source:Source};
  if(!response.ok)throw Error(data.error);
  onImported(data.transactions,data.added,data.duplicates,data.source);setCsv("");setFilename("");setSource("auto");setNegative(false);
 }catch(e){setError(e instanceof Error?e.message:"Import failed. Your file is still here to retry.");}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={value=>{if(!busy)onOpenChange(value);}}><DialogContent className="import-dialog">
  <DialogHeader><DialogTitle>Import your card statement</DialogTitle><DialogDescription>Upload an Apple Card, Amex, or Discover CSV. Apple Card exports are recognized automatically and added as their own card.</DialogDescription></DialogHeader>
  <label className="upload-zone"><FileSpreadsheet size={30}/><strong>{filename||"Choose your CSV statement"}</strong><span>CSV up to 2 MB · 5,000 rows</span><input type="file" accept=".csv,text/csv" aria-label="Choose CSV statement" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setError("");if(file.size>2000000){setError("Please choose a file smaller than 2 MB.");return;}setFilename(file.name);setSource("auto");setNegative(false);setCsv(await file.text());e.target.value="";}}/></label>
  <details><summary>Or paste CSV text</summary><Textarea aria-label="Paste CSV text" placeholder="Paste your CSV statement here" disabled={busy} value={csv} onChange={e=>{setCsv(e.target.value);setFilename("");}} className="csv-textarea"/></details>
  {apple?<div className="import-detected" role="status"><Check size={19}/><div><strong>Apple Card detected</strong><p>Your first import adds Apple Card to My cards. Later imports update the same card and skip matching transactions.</p></div></div>:csv&&<div className="import-options">
   <label>Statement format<Select value={source} onValueChange={v=>setSource(v as StatementSource)} disabled={busy}><SelectTrigger aria-label="Statement format"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto">Detect automatically</SelectItem><SelectItem value="apple">Apple Card</SelectItem><SelectItem value="amex">American Express</SelectItem><SelectItem value="discover">Discover</SelectItem></SelectContent></Select></label>
   <label>Purchase amounts<Select value={negative?"negative":"positive"} onValueChange={v=>setNegative(v==="negative")} disabled={busy}><SelectTrigger aria-label="Purchase amount convention"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="positive">Positive in CSV</SelectItem><SelectItem value="negative">Negative in CSV</SelectItem></SelectContent></Select></label>
  </div>}
  {(parsed.error||error)&&<p className="form-error" role="alert">{error||parsed.error}</p>}
  {parsed.rows.length>0&&<div className="import-preview"><div className="preview-heading"><Check size={16}/>{parsed.rows.length} transactions · {parsed.source&&sourceNames[parsed.source]}</div><div className="preview-scroll"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="amount">Amount</TableHead></TableRow></TableHeader><TableBody>{parsed.rows.slice(0,4).map((t,i)=><TableRow key={i}><TableCell>{shortDate(t.date)}</TableCell><TableCell>{t.merchant}<small className="muted">{t.kind}</small></TableCell><TableCell className="amount">{money(t.amount)}</TableCell></TableRow>)}</TableBody></Table></div><p>Purchases add to spending. Refunds reduce it. Card payments are excluded.</p></div>}
  <p className="import-privacy">Your transactions are saved in your private workspace. Apple Card updates when you import another CSV. Amex and Discover statements stay separate from their connected-card history.</p>
  <button className="primary-button" disabled={busy||!parsed.rows.length} onClick={commit}>{busy?<Loader2 className="animate-spin" size={16}/>:<Upload size={16}/>} {busy?"Saving transactions…":apple?"Import Apple Card":"Import transactions"}</button>
 </DialogContent></Dialog>;
}
