"use client";
import {ArrowDown,ArrowUp,ArrowUpDown} from "lucide-react";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {money,shortDate,sourceNames,type Transaction} from "@/lib/transactions";
import {nextTransactionSort,transactionColumns,transactionSortOptions,type TransactionSort,type TransactionSortColumn} from "@/lib/transaction-sort";
export function MerchantIcon({name}:{name:string}) {
 const icons:Record<string,[string,string]>={Spotify:["S","spotify"],Netflix:["N","netflix"],"Adobe Creative Cloud":["A","adobe"],Notion:["N","notion"],"Whole Foods Market":["W","wholefoods"],Amazon:["a","amazon"],"Apple Store":["a","notion"]};
 const [letter,cls]=icons[name]||[name.slice(0,1),"generic"];
 return <span className={`merchant-icon ${cls}`}>{letter}</span>;
}
export function TransactionTable({rows,sort,onSort}:{rows:Transaction[];sort?:TransactionSort;onSort?:(column:TransactionSortColumn)=>void}) {
 const sortable=!!sort&&!!onSort;
 return <div className="transaction-list"><Table className={`transaction-table${sortable?" sortable":""}`}><TableHeader><TableRow>{transactionColumns.map(({key,label})=>{
  const active=sortable&&sort.column===key,next=sort&&nextTransactionSort(sort,key);
  const nextLabel=transactionSortOptions.find(option=>option.value===`${next?.column}:${next?.direction}`)?.label;
  const Icon=active?(sort.direction==="asc"?ArrowUp:ArrowDown):ArrowUpDown;
  return <TableHead key={key} scope="col" className={key==="amount"?"amount":undefined} aria-sort={active?(sort.direction==="asc"?"ascending":"descending"):undefined}>
   {sortable?<button type="button" className="column-sort" data-active={active} aria-label={`Sort ${nextLabel}`} title={`Sort ${nextLabel}${key==="amount"?" (refunds and payments are negative)":""}`} onClick={()=>onSort(key)}>{label}<Icon size={14} aria-hidden="true"/></button>:label}
  </TableHead>;
 })}</TableRow></TableHeader><TableBody>{rows.map(t=><TableRow key={t.id}><TableCell><div className="merchant"><MerchantIcon name={t.merchant}/><span><strong>{t.merchant}</strong>{t.pending&&<small className="pending-label">Pending · excluded from totals</small>}{!t.pending&&t.kind==="payment"&&<small>Card payment · excluded from spending</small>}{!t.pending&&t.kind==="credit"&&<small>Refund or credit</small>}</span></div></TableCell><TableCell className="muted">{shortDate(t.date)}</TableCell><TableCell><span className="category">{t.category}</span></TableCell><TableCell><span className={`card-dot ${t.source}`}/>{t.accountName||sourceNames[t.source]}</TableCell><TableCell className={`amount ${t.amount<0?"positive":""}`}>{t.amount<0?"+":""}{money(Math.abs(t.amount))}</TableCell></TableRow>)}</TableBody></Table></div>;
}
