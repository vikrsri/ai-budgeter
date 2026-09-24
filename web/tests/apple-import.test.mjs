import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {parseStatement,detectStatementSource} from '../.test-build/import-csv.mjs';
import {saveImportedTransactions} from '../.test-build/import-service.mjs';
import {accountOptions,importedAccounts,filterAccountTransactions,isAccountSelection,spending} from '../.test-build/transactions.mjs';
import {summarize} from '../.test-build/insights.mjs';
import {detectRecurring,findSubscriptionCandidates} from '../.test-build/recurring.mjs';

const header='Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD),Purchased By';
const csv=lines=>[header,...lines].join('\n');
const purchase=(date='09/01/2026')=>`${date},${date},STREAM SERVICE ONLINE,Stream Service,Entertainment,Purchase,12.99,Card Owner`;

test('Apple Card uploads auto-detect without a selected card, including BOM and additional columns',()=>{
 const text='\uFEFF'+csv([purchase()]).replaceAll('\n','\r\n');
 assert.equal(detectStatementSource(text),'apple');
 const [row]=parseStatement(text);
 assert.equal(row.source,'apple');assert.equal(row.merchant,'Stream Service');assert.equal(row.amount,1299);assert.equal(row.date,'2026-09-01');
 assert.equal(parseStatement(text,'amex',true)[0].source,'apple');assert.equal(parseStatement(text,'amex',true)[0].amount,1299);
 assert.equal(detectStatementSource('Date,Description,Amount\n09/01/2026,Store,10'),null);
});

test('Apple types keep payments and credits separate from purchases',()=>{
 const rows=parseStatement(csv([
  purchase(),
  '09/02/2026,09/03/2026,Refund for order,Store,Shopping,Refund,3.25,Card Owner',
  '09/03/2026,09/03/2026,ACH DEPOSIT INTERNET,,,Payment,200.00,Card Owner',
  '09/04/2026,09/05/2026,PAYMENT SHOP,Payment Shop,Shopping,Purchase,20.00,Card Owner',
  '09/05/2026,09/05/2026,Store return,Store,Shopping,Credit,-2.00,Card Owner',
 ]));
 assert.deepEqual(rows.map(t=>[t.kind,t.amount]),[['purchase',1299],['credit',-325],['payment',-20000],['purchase',2000],['credit',-200]]);
 assert.equal(rows[2].merchant,'ACH DEPOSIT INTERNET');assert.equal(rows[2].category,'Payments');assert.equal(spending(rows),2774);
});

test('Apple repeated imports have stable keys and preserve distinct same-day purchases',()=>{
 const original=csv([purchase(),purchase()]);
 const a=parseStatement(original),b=parseStatement(original);
 assert.deepEqual(a.map(t=>t.dedupeKey),b.map(t=>t.dedupeKey));assert.notEqual(a[0].dedupeKey,a[1].dedupeKey);
 const family=parseStatement(csv([purchase(),purchase().replace('Card Owner','Other Member')]));
 assert.notEqual(family[0].dedupeKey,family[1].dedupeKey);
 assert.throws(()=>parseStatement(csv([purchase(),'09/32/2026,09/32/2026,Invalid,Store,Shopping,Purchase,10.00,Card Owner'])),/Row 3/);
 assert.throws(()=>parseStatement(header),/no transactions/);
});

function fixture(failAt=0){
 const sqlite=new DatabaseSync(':memory:');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(`drizzle/${f}`,'utf8'));
 let calls=0;
 const db={prepare(sql){return{bind(...args){return{async run(){if(++calls===failAt)throw Error('injected save failure');const r=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const read=owner=>sqlite.prepare('SELECT * FROM transactions WHERE owner=? ORDER BY date DESC').all(owner);
 return {sqlite,db,read};
}

test('First Apple import persists one card; repeat and later statements reuse it, isolated by owner',async()=>{
 const {sqlite,db,read}=fixture();
 try{
  assert.deepEqual(await saveImportedTransactions(db,'first',parseStatement(csv([purchase()]))),{added:1,duplicates:0,source:'apple'});
  assert.deepEqual(await saveImportedTransactions(db,'first',parseStatement(csv([purchase()]))),{added:0,duplicates:1,source:'apple'});
  await saveImportedTransactions(db,'first',parseStatement(csv([purchase('10/01/2026')])));
  assert.deepEqual(importedAccounts(read('first')),[{id:'csv:apple',source:'apple',name:'Apple Card',count:2,latestDate:'2026-10-01'}]);
  await saveImportedTransactions(db,'second',parseStatement(csv([purchase()])));
  assert.equal(read('first').length,2);assert.equal(read('second').length,1);assert.equal(read('stranger').length,0);
 }finally{sqlite.close();}
});

test('A failed CSV save rolls back both the transactions and derived card',async()=>{
 const {sqlite,db,read}=fixture(2);
 try{await assert.rejects(()=>saveImportedTransactions(db,'owner',parseStatement(csv([purchase(),purchase('10/01/2026')]))),/injected/);assert.equal(read('owner').length,0);assert.deepEqual(importedAccounts(read('owner')),[]);}finally{sqlite.close();}
});

test('My cards includes Apple imports in spending and insights without combining duplicate Amex CSV history',()=>{
 const apple=parseStatement(csv([purchase()])),amex={id:'plaid1',provider:'plaid',accountId:'gold',source:'amex',merchant:'Store',date:'2026-09-01',amount:1000,kind:'purchase',category:'Shopping'};
 const rows=[...apple,amex,{...amex,id:'csv1',provider:'csv'}],cards=filterAccountTransactions(rows,'cards','all');
 assert.equal(cards.length,2);assert.equal(spending(cards),2299);
 assert.equal(filterAccountTransactions(rows,'cards','csv:apple').length,1);assert.equal(filterAccountTransactions(rows,'cards','csv:amex').length,0);
 assert.equal(isAccountSelection('csv:apple','cards'),true);assert.equal(isAccountSelection('csv:amex','cards'),false);
 assert.deepEqual(accountOptions([],rows,'cards'),[{value:'csv:apple',label:'Apple Card'}]);
 assert.equal(summarize(cards,'2026-09').accounts.find(a=>a.id==='csv:apple').netSpending,1299);
 assert.equal(accountOptions([],[],'cards').length,0);
});

test('Apple subscriptions move from review to a recurring pattern across saved CSV statements',async()=>{
 const {sqlite,db,read}=fixture();
 const statement=date=>csv([purchase(date).replace('Stream Service','Example *subscription')]);
 const cards=()=>filterAccountTransactions(read('owner'),'cards','all');
 try{
  await saveImportedTransactions(db,'owner',parseStatement(statement('08/01/2026')));
  assert.equal(detectRecurring(cards()).length,0);
  const [candidate]=findSubscriptionCandidates(cards());
  assert.equal(candidate.source,'apple');assert.equal(candidate.count,1);assert.equal(candidate.amount,1299);
  assert.equal('monthly' in candidate,false);assert.equal('nextDate' in candidate,false);
  // Uploading the same statement twice must not invent recurring evidence.
  assert.equal((await saveImportedTransactions(db,'owner',parseStatement(statement('08/01/2026')))).duplicates,1);
  assert.equal(findSubscriptionCandidates(cards())[0].count,1);
  await saveImportedTransactions(db,'owner',parseStatement(statement('09/01/2026')));
  const [pattern]=detectRecurring(cards(),'2026-09-15');
  assert.equal(pattern.cadence,'Monthly');assert.equal(pattern.count,2);assert.equal(pattern.nextDate,'2026-10-01');
  assert.equal(findSubscriptionCandidates(cards()).length,0);
  // All history is analyzed even when the dashboard month has no transactions.
  const summary=summarize(filterAccountTransactions(read('owner'),'cards','csv:apple'),'2026-10');
  assert.equal(summary.transactionCount,0);assert.equal(summary.recurring.length,1);assert.equal(summary.subscriptionCandidates.length,0);
  assert.equal(read('another-owner').length,0);
 }finally{sqlite.close();}
});

test('CSV recurring detection works for merchants without a subscription keyword too',()=>{
 const rows=parseStatement(csv([purchase('07/01/2026'),purchase('08/01/2026'),purchase('09/01/2026')]));
 const [pattern]=detectRecurring(filterAccountTransactions(rows,'cards','csv:apple'),'2026-09-15');
 assert.equal(pattern.merchant,'Stream Service');assert.equal(pattern.cadence,'Monthly');assert.equal(pattern.confidence,'Likely');assert.equal(pattern.count,3);
});
