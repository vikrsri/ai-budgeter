import test from 'node:test';
import assert from 'node:assert/strict';
import {detectRecurring} from '../.test-build/recurring.mjs';
import {monthKey} from '../.test-build/transactions.mjs';
import {instantInsight} from '../.test-build/insights.mjs';
const charge=(date,amount=1000,extra={})=>({id:`${date}:${amount}`,date,amount,merchant:'Service',source:'amex',accountId:'one',category:'Software',kind:'purchase',...extra});

test('Current month uses the local calendar near a UTC month boundary',()=>{
 const previous=process.env.TZ;
 try{process.env.TZ='America/Chicago';assert.equal(monthKey(new Date('2026-09-01T02:00:00Z')),'2026-08');assert.equal(monthKey(new Date('2026-09-01T06:00:00Z')),'2026-09');}
 finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('A missing billing cycle retains the complete monthly pattern',()=>{
 const r=detectRecurring(['2026-01-10','2026-02-10','2026-04-10','2026-05-10'].map(d=>charge(d)),'2026-05-20');
 assert.equal(r.length,1);assert.equal(r[0].cadence,'Monthly');assert.equal(r[0].count,4);assert.equal(r[0].nextDate,'2026-06-10');assert.equal(r[0].missedCycles,true);assert.equal(r[0].confidence,'Possible');
});
test('Memberships mixed with unrelated merchant purchases retain only matching evidence',()=>{
 const fees=['2026-01-12','2026-02-12','2026-03-12'].map(d=>charge(d,999));
 const r=detectRecurring([...fees,charge('2026-01-06',3256),charge('2026-02-23',1805),charge('2026-03-02',6500)],'2026-03-20');
 assert.equal(r.length,1);assert.equal(r[0].cadence,'Monthly');assert.equal(r[0].count,3);assert.deepEqual(r[0].history.map(t=>t.amount),[999,999,999]);
});
test('Two subscriptions at one merchant stay separate and are never double counted',()=>{
 const rows=['01','02','03'].flatMap(m=>[charge(`2026-${m}-01`,1000),charge(`2026-${m}-15`,2000)]);
 const r=detectRecurring(rows,'2026-03-20');assert.equal(r.length,2);assert.ok(r.every(x=>x.cadence==='Monthly'));assert.deepEqual(r.map(x=>x.amount).sort((a,b)=>a-b),[1000,2000]);assert.equal(new Set(r.flatMap(x=>x.history.map(t=>t.id))).size,6);
});
test('Regular variable bills remain visible, with cautious estimates',()=>{
 const r=detectRecurring([charge('2026-01-06',4500),charge('2026-02-06',8500),charge('2026-03-06',6000),charge('2026-04-06',11000)],'2026-04-20');
 assert.equal(r.length,1);assert.equal(r[0].count,4);assert.equal(r[0].variableAmount,true);assert.equal(r[0].confidence,'Possible');assert.equal(r[0].monthly,11000);
});
test('Historical subscriptions survive later unrelated charges at that merchant',()=>{
 const r=detectRecurring([charge('2025-01-10'),charge('2025-02-10'),charge('2025-03-10'),charge('2026-02-03',9500),charge('2026-07-25',3700)],'2026-09-20');
 assert.equal(r.length,1);assert.equal(r[0].count,3);assert.equal(r[0].overdue,true);assert.equal(r[0].lastDate,'2025-03-10');assert.equal(r[0].nextDate,'2025-04-10');
});
test('Annual payments and separate accounts are kept distinct',()=>{
 const rows=[charge('2024-10-01',9500),charge('2025-10-01',9500),charge('2026-01-05',1000,{accountId:'two'}),charge('2026-02-05',1000,{accountId:'two'})];
 const r=detectRecurring(rows,'2026-02-20');assert.equal(r.length,2);assert.equal(r.find(x=>x.cadence==='Yearly').monthly,792);assert.ok(r.every(x=>new Set(x.history.map(t=>t.accountId)).size===1));
});
test('Irregular purchases, pending charges, payments, and isolated charges are not subscriptions',()=>{
 const rows=[charge('2026-01-02'),charge('2026-01-03'),charge('2026-01-05'),charge('2026-01-09'),charge('2026-01-10'),charge('2026-01-12'),charge('2026-02-10',1000,{pending:true}),charge('2026-03-10',1000,{kind:'payment'})];
 assert.equal(detectRecurring(rows).length,0);assert.equal(detectRecurring([charge('2026-01-01')]).length,0);
});
test('Instant recurring insights also include past patterns regardless of the spending month',()=>{
 const answer=instantInsight([charge('2025-01-10'),charge('2025-02-10'),charge('2025-03-10')],'Show all recurring payments','2026-09');
 assert.match(answer,/Service/);assert.match(answer,/past \/ needs review/);assert.match(answer,/across all available history/);
});
test('Similar-price purchases at busy merchants do not imply recurring bills',()=>{
 const rows=[charge('2026-01-01',2900),charge('2026-01-08',3100),charge('2026-01-15',2950),charge('2026-01-02',8000),charge('2026-01-03',7500),charge('2026-01-10',6500),charge('2026-01-22',4600),charge('2026-02-02',6100)];
 assert.equal(detectRecurring(rows).length,0);
 assert.equal(detectRecurring([charge('2026-01-01',4000),charge('2026-02-01',4700)]).length,0);
});
