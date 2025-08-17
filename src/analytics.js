import { fmtMonthLabel } from './format';

// Tx, Item, BudgetRecord types come from App context

export function buildMonthlySeries(txs, from, to) {
  const start = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
  const end = to ? new Date(to) : new Date();
  const m = new Map();
  for (const t of txs) {
    const d = new Date(t.date);
    if (d < start || d > end) continue;
    const key = t.date.slice(0, 7);
    const obj = m.get(key) || { monthKey: key, label: fmtMonthLabel(key), income: 0, expense: 0 };
    if (t.type === 'income') obj.income += t.amount; else obj.expense += t.amount;
    m.set(key, obj);
  }
  return Array.from(m.values()).sort((a,b)=>a.monthKey.localeCompare(b.monthKey)).map(p=>({
    ...p,
    income: Math.round(p.income),
    expense: Math.round(p.expense)
  }));
}

export function buildExpenseStructure(txs, items, from, to) {
  const start = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
  const end = to ? new Date(to) : new Date();
  const itemMap = new Map(items.map(i=>[i.id, i.name]));
  const m = new Map();
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    const d = new Date(t.date);
    if (d < start || d > end) continue;
    const name = itemMap.get(t.itemId) || 'Unknown';
    m.set(name, (m.get(name) || 0) + t.amount);
  }
  const total = Array.from(m.values()).reduce((s,v)=>s+v,0);
  if (!total) return [];
  return Array.from(m.entries()).map(([item, amount])=>({
    item,
    amount,
    share: Math.round(amount/total*100)
  }));
}

export function buildBudgetReport(txs, items, budgets, period) {
  const itemMap = new Map(items.map(i=>[i.id, i.name]));
  const actualMap = new Map();
  const [y,m] = period.split('-').map(Number);
  const from = new Date(y, m-1, 1);
  const to = new Date(y, m, 0); // end of month
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    const d = new Date(t.date);
    if (d < from || d > to) continue;
    actualMap.set(t.itemId, (actualMap.get(t.itemId)||0)+t.amount);
  }
  const rowsMap = new Map();
  for (const b of budgets) {
    if (b.period !== period) continue;
    rowsMap.set(b.itemId, { itemId:b.itemId, itemName:itemMap.get(b.itemId)||'Unknown', budget:b.amount, actual:0 });
  }
  for (const [itemId, actual] of actualMap) {
    const row = rowsMap.get(itemId) || { itemId, itemName:itemMap.get(itemId)||'Unknown', budget:0, actual:0 };
    row.actual = actual;
    rowsMap.set(itemId, row);
  }
  const rows = Array.from(rowsMap.values()).map(r=>({
    ...r,
    budget: Number(r.budget.toFixed(2)),
    actual: Number((r.actual||0).toFixed(2)),
    difference: Number((r.budget - (r.actual||0)).toFixed(2))
  })).filter(r=>r.budget>0 || r.actual>0);
  const totals = rows.reduce((acc,r)=>{
    acc.budget += r.budget;
    acc.actual += r.actual;
    acc.difference += r.difference;
    return acc;
  },{budget:0,actual:0,difference:0});
  totals.budget = Number(totals.budget.toFixed(2));
  totals.actual = Number(totals.actual.toFixed(2));
  totals.difference = Number(totals.difference.toFixed(2));
  return { rows, totals };
}
