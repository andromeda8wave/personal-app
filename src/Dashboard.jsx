import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid
} from 'recharts';
import { fmtInt, fmtMonthLabel } from './format';
import { buildExpenseStructure } from './analytics';

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

export default function Dashboard({ items, txs, totals, monthly, upsertBudget, actualByTopLevelForMonth, budgetByTopLevelForMonth }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));

  const monthlySeries = useMemo(() => monthly.map(m => ({
    label: fmtMonthLabel(m.month),
    income: Math.round(m.income),
    expense: Math.round(m.expense),
  })), [monthly]);

  const expenseStructure = useMemo(() => buildExpenseStructure(txs, items), [txs, items]);

  const actualMap = useMemo(() => {
    const m = new Map();
    const arr = actualByTopLevelForMonth(month);
    arr.forEach(r => m.set(r.itemId, Math.round(r.amount)));
    return m;
  }, [actualByTopLevelForMonth, month]);

  const budgetMap = useMemo(() => budgetByTopLevelForMonth(month), [budgetByTopLevelForMonth, month]);

  const incomeTop = useMemo(() => items.filter(i => !i.parentId && i.type === 'income'), [items]);
  const expenseTop = useMemo(() => items.filter(i => !i.parentId && i.type === 'expense'), [items]);

  const renderRows = (list) => list.map(item => {
    const plan = Math.round(budgetMap.get(item.id) || 0);
    const actual = Math.round(actualMap.get(item.id) || 0);
    const diff = plan - actual;
    return (
      <tr key={item.id} className="border-t">
        <td className="p-2">{item.name}</td>
        <td className="p-2 text-right">
          <input
            type="number"
            min="0"
            step="1"
            value={plan}
            onChange={e => upsertBudget({ itemId: item.id, month, amount: Number(e.target.value) || 0 })}
            className="w-20 border rounded px-1 text-right"
          />
        </td>
        <td className="p-2 text-right">{actual}</td>
        <td className={`p-2 text-right ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{diff}</td>
      </tr>
    );
  });

  return (
    <div className="space-y-6 mb-6">
      <div className="grid md:grid-cols-4 gap-3">
        <KPI title="Income" value={fmtInt(totals.income)} positive />
        <KPI title="Expenses" value={fmtInt(totals.expense)} />
        <KPI title="Net" value={fmtInt(totals.net)} positive={totals.net>=0} />
        <KPI title="Total Balance" value={fmtInt(totals.totalBalance)} positive />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="h-[400px] rounded-2xl border bg-white p-4 shadow-sm md:col-span-2" aria-label="Monthly Income vs Expenses">
          {monthlySeries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">No data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySeries} margin={{ top: 60, right: 20, left: 40, bottom: 60 }}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval={0} angle={-45} textAnchor="end" height={80} tickMargin={16} />
                <YAxis tickFormatter={v=>fmtInt(v)} />
                <Tooltip formatter={v=>fmtInt(v)} />
                <Legend verticalAlign="top" height={36} />
                <Area type="natural" dataKey="income" stroke="none" fill="url(#incomeFill)" />
                <Area type="natural" dataKey="expense" stroke="none" fill="url(#expenseFill)" />
                <Line type="natural" dataKey="income" name="Income" stroke="#10B981" dot={false} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <Line type="natural" dataKey="expense" name="Expense" stroke="#F43F5E" dot={false} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="h-[400px] rounded-2xl border bg-white p-4 shadow-sm md:col-span-1" aria-label="Expense Structure">
          {expenseStructure.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">No data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ bottom: 40 }}>
                <Pie
                  data={expenseStructure}
                  dataKey="share"
                  nameKey="item"
                  innerRadius="60%"
                  outerRadius="80%"
                  paddingAngle={2}
                  labelLine
                  label={({ name, value }) => `${name}: ${value}% (2025)`}
                >
                  {expenseStructure.map(e => (
                    <Cell key={e.item} fill={colorFor(e.item)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name, props) => fmtInt(props.payload.amount)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Budget</h3>
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="border rounded-xl px-2 py-1" />
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="p-2">Item</th>
                <th className="p-2 text-right">Plan</th>
                <th className="p-2 text-right">Actual</th>
                <th className="p-2 text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {incomeTop.length>0 && (
                <>
                  <tr className="border-t"><td colSpan={4} className="p-2 font-semibold">Income</td></tr>
                  {renderRows(incomeTop)}
                </>
              )}
              {expenseTop.length>0 && (
                <>
                  <tr className="border-t"><td colSpan={4} className="p-2 font-semibold">Expenses</td></tr>
                  {renderRows(expenseTop)}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

