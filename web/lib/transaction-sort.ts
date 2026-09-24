import {sourceNames,type Transaction} from "./transactions";

export type TransactionSortColumn="merchant"|"date"|"category"|"account"|"amount";
export type TransactionSort={column:TransactionSortColumn;direction:"asc"|"desc"};
export const defaultTransactionSort:TransactionSort={column:"date",direction:"desc"};
export const transactionColumns:{key:TransactionSortColumn;label:string}[]=[
 {key:"merchant",label:"Merchant"},
 {key:"date",label:"Date"},
 {key:"category",label:"Category"},
 {key:"account",label:"Account"},
 {key:"amount",label:"Amount"},
];

export const transactionSortOptions=transactionColumns.flatMap(({key,label})=>
 (["asc","desc"] as const).map(direction=>({
  value:`${key}:${direction}`,
  label:`${label}: ${key==="date"?(direction==="asc"?"oldest first":"newest first"):key==="amount"?(direction==="asc"?"low to high":"high to low"):(direction==="asc"?"A to Z":"Z to A")}`,
  sort:{column:key,direction},
 }))
);

export function nextTransactionSort(current:TransactionSort,column:TransactionSortColumn):TransactionSort {
 return {column,direction:current.column===column?(current.direction==="asc"?"desc":"asc"):(column==="date"||column==="amount"?"desc":"asc")};
}

const collator=new Intl.Collator("en",{sensitivity:"base",numeric:true});
export function sortTransactions(rows:Transaction[],sort:TransactionSort):Transaction[] {
 return [...rows].sort((a,b)=>{
  let comparison:number;
  if(sort.column==="amount")comparison=a.amount-b.amount;
  else if(sort.column==="date")comparison=a.date.localeCompare(b.date);
  else if(sort.column==="account")comparison=collator.compare(a.accountName||sourceNames[a.source],b.accountName||sourceNames[b.source]);
  else comparison=collator.compare(a[sort.column],b[sort.column]);
  // Stable ties keep rows from jumping between pages after a refresh or sync.
  return (sort.direction==="asc"?comparison:-comparison)||b.date.localeCompare(a.date)||collator.compare(a.merchant,b.merchant)||a.id.localeCompare(b.id);
 });
}
