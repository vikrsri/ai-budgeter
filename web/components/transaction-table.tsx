"use client";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {money,shortDate,sourceNames,type Transaction} from "@/lib/transactions";
export function MerchantIcon({name}:{name:string}) {
 const icons:Record<string,[string,string]>={Spotify:["S","spotify"],Netflix:["N","netflix"],"Adobe Creative Cloud":["A","adobe"],Notion:["N","notion"],"Whole Foods Market":["W","wholefoods"],Amazon:["a","amazon"],"Apple Store":["a","notion"]};
 const [letter,cls]=icons[name]||[name.slice(0,1),"generic"];
 return <span className={`merchant-icon ${cls}`}>{letter}</span>;
}
export function TransactionTable({rows}:{rows:Transaction[]}) {
 return <Table><TableHeader><TableRow><TableHead>Merchant</TableHead><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Account</TableHead><TableHead className="amount">Amount</TableHead></TableRow></TableHeader><TableBody>{rows.map(t=><TableRow key={t.id}><TableCell><div className="merchant"><MerchantIcon name={t.merchant}/><span><strong>{t.merchant}</strong>{t.pending&&<small className="pending-label">Pending · excluded from totals</small>}{!t.pending&&t.kind==="payment"&&<small>Card payment · excluded from spending</small>}{!t.pending&&t.kind==="credit"&&<small>Refund or credit</small>}</span></div></TableCell><TableCell className="muted">{shortDate(t.date)}</TableCell><TableCell><span className="category">{t.category}</span></TableCell><TableCell><span className={`card-dot ${t.source}`}/>{t.accountName||sourceNames[t.source]}</TableCell><TableCell className={`amount ${t.amount<0?"positive":""}`}>{t.amount<0?"+":""}{money(Math.abs(t.amount))}</TableCell></TableRow>)}</TableBody></Table>;
}
