import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid
} from 'recharts';
import { buildMonthlySeries, buildExpenseStructure, buildBudgetReport } from './analytics';
import { fmtInt, fmtCurrency2 } from './format';
import { useBudgets } from './budgets';

const COLORS = ['#10B981','#F43F5E','#3B82F6','#F59E0B','#6366F1','#14B8A6','#8B5CF6','#F97316'];
const colorFor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
};

const KPI = ({ title, value, positive }) => (
  <div className={`rounded-2xl border bg-white p-4 shadow-sm ${positive===false?'':'text-gray-900'}`}>
    <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
    <div className={`mt-1 text-2xl font-semibold ${positive ? 'text-emerald-600':'text-gray-900'}`}>{value}</div>
  </div>
);

export default function Dashboard({ txs, items, totals }) {
  const monthly = useMemo(() => buildMonthlySeries(txs), [txs]);
  const expenseStructure = useMemo(() => buildExpenseStructure(txs, items), [txs, items]);

  const { budgets, upsertBudget, deleteBudget } = useBudgets();
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));
  const budgetData = useMemo(() => buildBudgetReport(txs, items, budgets, month), [txs, items, budgets, month]);
  const budgetIdMap = useMemo(() => {
    const m = new Map();
    budgets.forEach(b => { if (b.period===month) m.set(b.itemId, b.id); });
    return m;
  }, [budgets, month]);
  const expenseItems = useMemo(() => items.filter(i=>i.type==='expense'), [items]);
  const unusedItems = expenseItems.filter(i => !budgetData.rows.find(r=>r.itemId===i.id));
  const [newItem, setNewItem] = useState(unusedItems[0]?.id || '');
  const [newAmount, setNewAmount] = useState('');

  const addBudget = () => {
    const amount = parseFloat(newAmount);
    if (!newItem || isNaN(amount)) return;
    upsertBudget({ itemId:newItem, period:month, amount });
    setNewAmount('');
  };

  const onBudgetChange = (itemId, val) => {
    const amount = parseFloat(val);
    if (isNaN(amount) || amount < 0) return;
    const id = budgetIdMap.get(itemId);
    upsertBudget({ id, itemId, period:month, amount });
  };

  return (
    <div className="space-y-6 mb-6">
      <div className="grid md:grid-cols-4 gap-3">
        <KPI title="Income" value={fmtInt(totals.income)} positive />
        <KPI title="Expenses" value={fmtInt(totals.expense)} />
        <KPI title="Net" value={fmtInt(totals.net)} positive={totals.net>=0} />
        <KPI title="Total Balance" value={fmtInt(totals.totalBalance)} positive />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-[340px]" aria-label="Monthly Income vs Expenses">
          {monthly.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">No data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v)=>fmtInt(v)} />
                <Tooltip formatter={(v)=>fmtInt(v)} />
                <Legend />
                <Line type="monotone" dataKey="income" name="Income" stroke="#10B981" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="expense" name="Expense" stroke="#F43F5E" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="h-[340px]" aria-label="Expense Structure">
          {expenseStructure.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">No data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenseStructure} dataKey="share" nameKey="item" label={({item,share})=>`${item} — ${share}%`}>
                  {expenseStructure.map(e => <Cell key={e.item} fill={colorFor(e.item)} />)}
                </Pie>
                <Tooltip formatter={(v, name, props)=>fmtInt(props.payload.amount)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Budgets</h3>
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="border rounded-xl px-2 py-1" />
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Category</th>
                <th className="py-1 text-right">Budget</th>
                <th className="py-1 text-right">Actual</th>
                <th className="py-1 text-right">Difference</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {budgetData.rows.map(r => (
                <tr key={r.itemId} className="border-b last:border-b-0">
                  <td className="py-1">{r.itemName}</td>
                  <td className="py-1 text-right"><input type="number" step="0.01" value={r.budget} onChange={e=>onBudgetChange(r.itemId,e.target.value)} className="w-24 border rounded px-1 text-right"/></td>
                  <td className="py-1 text-right">{fmtCurrency2(r.actual)}</td>
                  <td className={`py-1 text-right ${r.difference>=0?'text-emerald-600':'text-rose-600'}`}>{fmtCurrency2(r.difference)}</td>
                  <td className="py-1 text-right"><button onClick={()=>deleteBudget(budgetIdMap.get(r.itemId))} className="text-xs text-rose-600">Del</button></td>
                </tr>
              ))}
              <tr>
                <td className="py-1">
                  <select value={newItem} onChange={e=>setNewItem(e.target.value)} className="border rounded px-1">
                    {unusedItems.map(i=>(<option key={i.id} value={i.id}>{i.name}</option>))}
                  </select>
                </td>
                <td className="py-1 text-right"><input type="number" step="0.01" value={newAmount} onChange={e=>setNewAmount(e.target.value)} className="w-24 border rounded px-1 text-right"/></td>
                <td className="py-1 text-right">—</td>
                <td className="py-1 text-right">—</td>
                <td className="py-1 text-right"><button onClick={addBudget} className="text-xs text-emerald-600">Add</button></td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="font-semibold border-t">
                <td className="py-1">Totals</td>
                <td className="py-1 text-right">{fmtCurrency2(budgetData.totals.budget)}</td>
                <td className="py-1 text-right">{fmtCurrency2(budgetData.totals.actual)}</td>
                <td className={`py-1 text-right ${budgetData.totals.difference>=0?'text-emerald-600':'text-rose-600'}`}>{fmtCurrency2(budgetData.totals.difference)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
