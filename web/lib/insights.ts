import {categoryTotals,money,spending,type Transaction} from "./transactions";
import {detectRecurring} from "./recurring";
export function summarize(rows:Transaction[],month:string) {
 const selected=rows.filter(t=>month==="all"||t.date.startsWith(month));
 const merchants=new Map<string,number>();selected.filter(t=>t.kind!=="payment"&&!t.pending).forEach(t=>merchants.set(t.merchant,(merchants.get(t.merchant)||0)+t.amount));
 const months=[...new Set(rows.map(t=>t.date.slice(0,7)))].sort();
 return {period:month,currency:"USD",amountUnit:"cents",transactionCount:selected.length,pendingCount:selected.filter(t=>t.pending).length,netSpending:spending(selected),paymentsExcluded:selected.filter(t=>t.kind==="payment").length,refunds:selected.filter(t=>t.kind==="credit"&&!t.pending).reduce((s,t)=>s+Math.abs(t.amount),0),categories:categoryTotals(selected),merchants:[...merchants].map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount).slice(0,100),monthlyTotals:months.map(m=>({month:m,netSpending:spending(rows.filter(t=>t.date.startsWith(m)))})),accounts:["amex","discover","other"].map(source=>({source,netSpending:spending(selected.filter(t=>t.source===source))})),recurring:detectRecurring(rows).map(({history,...r})=>r),coverage:{from:rows.map(t=>t.date).sort()[0]||null,to:rows.map(t=>t.date).sort().at(-1)||null}};
}
export function instantInsight(rows:Transaction[],question:string,month:string):string {
 const summary=summarize(rows,month),q=question.toLowerCase(),period=month==="all"?"all imported history":month;
 if(!rows.length)return "Connect a card or import real transactions from Amex or Discover to see a spending summary.";
 if(/recurr|subscri|every month|monthly bill/.test(q)) {
  const active=summary.recurring.filter(r=>!r.overdue),total=active.reduce((s,r)=>s+r.monthly,0);
  return active.length?`I found ${active.length} possible recurring payments, with an estimated monthly equivalent of ${money(total)}.\n\n${active.map(r=>`${r.merchant}: ${money(r.amount)} · ${r.cadence.toLowerCase()} (${r.count} charges found)`).join("\n")}\n\nThese are patterns in your statement history, not confirmed subscriptions. Open Recurring to review dates and supporting transactions.`:"There is not enough consistent history to identify recurring payments yet. Import at least two billing cycles; three or more gives stronger evidence.";
 }
 if(/amex|discover|card|account/.test(q))return `For ${period}:\n\n${summary.accounts.map(a=>`${a.source==="amex"?"American Express":a.source==="discover"?"Discover":"Other cards"}: ${money(a.netSpending)} net spending`).join("\n")}\n\nRefunds reduce spending; card payments are excluded. This reflects only imported transactions, not card balances.`;
 if(/refund|credit/.test(q))return `Refunds and credits total ${money(summary.refunds)} for ${period}. These reduce the ${money(summary.netSpending)} net spending total. ${summary.paymentsExcluded} card payments were excluded from spending.`;
 if(/compar|trend|last month|change/.test(q))return `Here are the monthly totals in the imported history:\n\n${summary.monthlyTotals.map(m=>`${m.month}: ${money(m.netSpending)}`).join("\n")}\n\nMonths may have incomplete statement coverage, so these are not necessarily like-for-like comparisons.`;
 if(/spend|spent|categor|summar|where|overview|save|cut/.test(q))return `Net spending for ${period} is ${money(summary.netSpending)} across ${summary.transactionCount} transactions.\n\n${summary.categories.slice(0,5).map(c=>`${c.name}: ${money(c.value)}`).join("\n")}\n\n${summary.categories[0]?`${summary.categories[0].name} is the largest category. Review those transactions and recurring payments to decide which expenses fit your priorities.`:"No purchases were found in this period."}\n\nRefunds reduce spending; card payments are excluded.`;
 return "Live AI is not connected yet. Instant analysis can answer questions about spending totals, categories, recurring payments, card comparisons, refunds, and monthly trends. Try “Where did my money go?”";
}
