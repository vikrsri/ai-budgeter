import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStatement,csvRows,parseAmount,parseDate} from '../.test-build/import-csv.mjs';
import {detectRecurring,advanceDate} from '../.test-build/recurring.mjs';
import {spending,spendingBreakdown,categoryTotals,normalizeStoredTransaction,accountOptions,filterAccountTransactions,isAccountSelection} from '../.test-build/transactions.mjs';
import {summarize} from '../.test-build/insights.mjs';
const row=(date,amount=1299,source='amex',merchant='Netflix')=>({id:date+source,date,amount,source,merchant,category:'Entertainment',kind:'purchase'});
test('Amex amounts become cents; refunds and payments stay separate',()=>{const r=parseStatement('Date,Description,Amount\n09/01/2026,NETFLIX,12.99\n09/02/2026,REFUND,-5.25\n09/03/2026,AUTOPAY PAYMENT,-200.00','amex');assert.deepEqual(r.map(x=>[x.amount,x.kind]),[[1299,'purchase'],[-525,'credit'],[-20000,'payment']]);assert.equal(spending(r),774);});
test('Discover dates, quoted amounts, BOM, and extra columns',()=>{const r=parseStatement('\uFEFFTrans. Date,Post Date,Description,Amount,Category\r\n09/01/2026,09/02/2026,"STORE, INC","1,234.56",Shopping','discover');assert.equal(r[0].amount,123456);assert.equal(r[0].merchant,'STORE, INC');assert.equal(r[0].date,'2026-09-01');});
test('Quoted multiline fields and escaped quotes',()=>{assert.deepEqual(csvRows('a,b\n"hello\nworld","say ""yes"""'),[['a','b'],['hello\nworld','say "yes"']]);});
test('Malformed quote and invalid date reject whole import',()=>{assert.throws(()=>csvRows('a,"oops'));assert.throws(()=>parseDate('02/30/2026'));assert.throws(()=>parseDate('13/01/2026'));assert.throws(()=>parseStatement('Date,Description,Amount\n09/01/2026,Valid,10\n09/32/2026,Invalid,10','amex'),/Row 3/);});
test('Ambiguous numeric dates and unsupported precision are rejected',()=>{assert.throws(()=>parseDate('01/01/26'));assert.throws(()=>parseAmount('12.999'));assert.throws(()=>parseAmount(''));assert.equal(parseAmount('(12.50)'),-1250);assert.equal(parseAmount('0.29'),29);});
test('Negative purchase convention reverses refunds too',()=>{const r=parseStatement('Date,Description,Amount\n2026-09-01,Store,-12.50\n2026-09-02,Refund,5.00','discover',true);assert.deepEqual(r.map(x=>x.amount),[1250,-500]);});
test('Repeated imports have stable keys; identical purchases in one statement survive',()=>{const csv='Date,Description,Amount\n2026-09-01,Store,5.00\n2026-09-01,Store,5.00';const a=parseStatement(csv,'amex'),b=parseStatement(csv,'amex');assert.deepEqual(a.map(x=>x.dedupeKey),b.map(x=>x.dedupeKey));assert.notEqual(a[0].dedupeKey,a[1].dedupeKey);});
test('Bank reference differentiates distinct charges',()=>{const r=parseStatement('Date,Description,Amount,Reference\n2026-09-01,Store,5.00,abc\n2026-09-01,Store,5.00,def','amex');assert.notEqual(r[0].dedupeKey,r[1].dedupeKey);});
test('Monthly cadence handles variable month lengths',()=>{const r=detectRecurring([row('2026-01-31'),row('2026-02-28'),row('2026-03-31')],'2026-04-01');assert.equal(r.length,1);assert.equal(r[0].nextDate,'2026-04-30');assert.equal(r[0].confidence,'Likely');});
test('Two charges are only possible; one is insufficient',()=>{assert.equal(detectRecurring([row('2026-01-10')]).length,0);assert.equal(detectRecurring([row('2026-01-10'),row('2026-02-10')])[0].confidence,'Possible');});
test('Refunds, payments, amount variation, and irregular purchases are excluded',()=>{assert.equal(detectRecurring([row('2026-01-10'),row('2026-02-10',2000)]).length,0);assert.equal(detectRecurring([row('2026-01-10'),row('2026-01-12')]).length,0);assert.equal(detectRecurring([{...row('2026-01-10'),kind:'payment'},{...row('2026-02-10'),kind:'payment'}]).length,0);});
test('Different cards do not combine into a recurring pattern',()=>{assert.equal(detectRecurring([row('2026-01-10'),row('2026-02-10',1299,'discover')]).length,0);});
test('Overdue patterns are marked instead of silently advanced',()=>{const r=detectRecurring([row('2026-01-10'),row('2026-02-10')],'2026-09-19')[0];assert.equal(r.nextDate,'2026-03-10');assert.equal(r.overdue,true);});
test('Weekly normalization and leap dates',()=>{const r=detectRecurring([row('2026-09-01'),row('2026-09-08'),row('2026-09-15')],'2026-09-19')[0];assert.equal(r.cadence,'Weekly');assert.equal(r.monthly,Math.round(1299*52/12));assert.equal(advanceDate('2024-02-29',12,0),'2025-02-28');});
test('Discover DirectPay is a card payment in CSV and previously saved history',()=>{
 const description='DIRECTPAY FULL BALANCE SEE DETAILS OF YOUR NEXT DIRECTPAY BELOW';
 const parsed=parseStatement(`Date,Description,Amount\n2026-09-01,${description},-50.00`,'discover')[0];
 assert.equal(parsed.kind,'payment');assert.equal(parsed.category,'Payments');
 const legacy={...row('2026-09-01',-5000,'discover',description),kind:'credit',category:'Shopping'};
 const corrected=normalizeStoredTransaction(legacy);
 assert.equal(corrected.kind,'payment');assert.equal(corrected.category,'Payments');assert.equal(spending([corrected]),0);
 assert.equal(legacy.kind,'credit');assert.equal(corrected.amount,-5000);
 for(const other of [{...legacy,amount:5000},{...legacy,source:'amex'},{...legacy,merchant:'AplPay Coffee refund'},{...legacy,merchant:'DIRECTPAY FULL BALANCESTORE'}])assert.equal(normalizeStoredTransaction(other),other);
});
test('Gross chart, credits, net spending, and exclusions reconcile independently',()=>{
 const rows=[row('2026-09-01',10000),{...row('2026-09-02',-2000),kind:'credit',category:'Shopping'},{...row('2026-09-03',-5000),kind:'payment',category:'Payments'},{...row('2026-09-04',3000),pending:true},{...row('2026-09-05',-1000),kind:'credit',pending:true}];
 const summary=spendingBreakdown(rows);
 assert.deepEqual(summary,{purchases:10000,credits:2000,net:8000,payments:5000,paymentCount:1,pendingPurchases:3000,pendingCount:2});
 assert.equal(categoryTotals(rows,'purchases').reduce((sum,c)=>sum+c.value,0),summary.purchases);
 assert.deepEqual(categoryTotals(rows),[{name:'Entertainment',value:10000},{name:'Shopping',value:-2000}]);
 assert.equal(categoryTotals(rows).reduce((sum,c)=>sum+c.value,0),spending(rows));
 const insight=summarize(rows,'2026-09');assert.equal(insight.netSpending,8000);assert.equal(insight.postedPurchases,10000);assert.equal(insight.refunds,2000);assert.equal(insight.categories.reduce((sum,c)=>sum+c.value,0),8000);
});
test('Credit-only and empty periods never manufacture positive chart slices',()=>{
 const rows=[{...row('2026-09-01',-2000),kind:'credit'}];
 assert.deepEqual(categoryTotals(rows,'purchases'),[]);assert.equal(spending(rows),-2000);assert.equal(categoryTotals(rows)[0].value,-2000);
 assert.equal(spending([]),0);assert.deepEqual(categoryTotals([]),[]);
});
test('Account options reflect enrolled cards, including cards without transactions',()=>{
 const accounts=[{id:'gold',institution:'American Express',name:'Gold Card',mask:'1001',status:'connected'},{id:'platinum',institution:'American Express',name:'Platinum Card',mask:'2002',status:'needs_reconnection'},{id:'removed',institution:'Discover',name:'Card',status:'disconnected'}];
 const options=accountOptions(accounts,[],'plaid');
 assert.deepEqual(options.map(x=>x.value),['plaid:gold','plaid:platinum']);
 assert.match(options[0].label,/Gold Card.*1001/);assert.match(options[1].label,/Platinum Card.*2002/);
 assert.deepEqual(accountOptions([],[],'plaid'),[]);
 assert.deepEqual(accountOptions(accounts,[row('2026-09-01'),{...row('2026-09-02',500,'discover'),provider:'plaid'}],'csv'),[{value:'csv:amex',label:'American Express'}]);
});
test('Selecting one card isolates its spending, recurring history and AI totals',()=>{
 const rows=['2026-08-01','2026-09-01'].flatMap(date=>[
  {...row(date,1000),id:date+'gold',provider:'plaid',accountId:'gold',accountName:'Gold · 1001'},
  {...row(date,3000),id:date+'platinum',provider:'plaid',accountId:'platinum',accountName:'Platinum · 2002'},
  {...row(date,7000),provider:'csv'},
 ]);
 const selected=filterAccountTransactions(rows,'plaid','plaid:gold');
 assert.equal(selected.length,2);assert.equal(spending(selected),2000);assert.equal(detectRecurring(selected).length,1);
 assert.deepEqual(summarize(selected,'2026-09').accounts,[{id:'plaid:gold',label:'Gold · 1001',netSpending:1000}]);
 const all=filterAccountTransactions(rows,'plaid','all');assert.equal(all.length,4);assert.equal(summarize(all,'2026-09').accounts.length,2);
 assert.equal(filterAccountTransactions(rows,'plaid','plaid:unknown').length,0);
 assert.equal(filterAccountTransactions(rows,'csv','plaid:gold').length,0);
 assert.equal(filterAccountTransactions(rows,'csv','csv:amex').length,2);
 assert.equal(isAccountSelection('plaid:gold','plaid'),true);assert.equal(isAccountSelection('csv:amex','plaid'),false);assert.equal(isAccountSelection('plaid:','plaid'),false);
});
test('Confirmed Oura membership names are corrected throughout saved history without changing amounts',()=>{
 const legacy={...row('2026-09-09',638,'amex','Wea'),provider:'plaid',accountId:'card'};
 const corrected=normalizeStoredTransaction(legacy);
 assert.equal(corrected.merchant,'Oura Ring');assert.equal(corrected.amount,638);assert.equal(legacy.merchant,'Wea');
 assert.deepEqual(normalizeStoredTransaction(corrected),corrected);
 const history=['2026-07-09','2026-08-09','2026-09-09'].map(date=>normalizeStoredTransaction({...legacy,id:date,date}));
 assert.equal(detectRecurring(history)[0].merchant,'Oura Ring');assert.equal(summarize(history,'2026-09').merchants[0].name,'Oura Ring');
 assert.equal(normalizeStoredTransaction({...legacy,provider:'csv',merchant:'OURARING INC SAN FRANCISCO CA'}).merchant,'Oura Ring');
 for(const other of [{...legacy,amount:26954},{...legacy,source:'discover'},{...legacy,provider:'csv'},{...legacy,kind:'credit',amount:-638},{...legacy,merchant:'Wea Store'}])assert.equal(normalizeStoredTransaction(other),other);
});
