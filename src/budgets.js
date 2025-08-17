import React from "react";
const BUDGET_KEY = 'cft_budgets_v1';
const VERSION = 1;

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function loadBudgets() {
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    if (!raw) return { version: VERSION, budgets: [] };
    const db = JSON.parse(raw);
    if (db && db.version === VERSION && Array.isArray(db.budgets)) return db;
  } catch {}
  return { version: VERSION, budgets: [] };
}

function saveBudgets(db) {
  localStorage.setItem(BUDGET_KEY, JSON.stringify(db));
}

export function useBudgets() {
  const [db, setDb] = React.useState(() => loadBudgets());

  React.useEffect(() => { saveBudgets(db); }, [db]);

  const upsertBudget = React.useCallback((rec) => {
    setDb(d => {
      const budgets = d.budgets.filter(b => !(b.itemId === rec.itemId && b.period === rec.period));
      const id = rec.id || uid();
      return { ...d, budgets: [...budgets, { ...rec, id }] };
    });
  }, []);

  const deleteBudget = React.useCallback((id) => {
    setDb(d => ({ ...d, budgets: d.budgets.filter(b => b.id !== id) }));
  }, []);

  const listBudgets = React.useCallback((period) => {
    return db.budgets.filter(b => b.period === period);
  }, [db]);

  return { budgets: db.budgets, upsertBudget, deleteBudget, listBudgets };
}
