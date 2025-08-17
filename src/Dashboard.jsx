import React, { useMemo, useState } from 'react';
import { fmtInt } from './format';

const KPI = ({ title, value, positive }) => (
  <div className={`rounded-2xl border bg-white p-4 shadow-sm ${positive===false?'':'text-gray-900'}`}>
    <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
    <div className={`mt-1 text-2xl font-semibold ${positive ? 'text-emerald-600':'text-gray-900'}`}>{value}</div>
  </div>
);

export default function Dashboard({ items, totals, upsertBudget, actualByTopLevelForMonth, budgetByTopLevelForMonth }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));

  const actualMap = useMemo(() => {
    const arr = actualByTopLevelForMonth(month);
    const m = new Map();
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

