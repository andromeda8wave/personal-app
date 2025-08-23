import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Dashboard from "./Dashboard";

// =============================================================
// Canvas Finance Tracker — v1.1 (senior refactor: structure + perf)
// =============================================================
// Goals of this refactor:
// 1) Better state shape & single-point persistence with versioned DB
// 2) Derived selectors/memos to avoid recalculation
// 3) Stable handlers (useCallback), debounced search
// 4) Lightweight windowed table for large datasets
// 5) Cleaner component boundaries
// 6) Safer input handling + minimal validation
// 7) Currency-aware formatting per wallet
//
// No external deps. All data stays in localStorage (private). Export/Import JSON supported.

// ------------------------- Constants & Types -------------------------
const DB_KEY = "cft_db_v2"; // bump when schema changes
const APP_CURRENCY = "RUB"; // default when wallet currency missing

/** @typedef {"income"|"expense"} TxType */
/** @typedef {{ id:string, name:string, type:TxType, parentId?:string|null }} Item */
/** @typedef {{ id:string, name:string, currency?:string, initialBalance:number }} Wallet */
/** @typedef {{ id:string, date:string, type:TxType, amount:number, itemId:string, walletId:string, comment?:string }} Transaction */
/** @typedef {{ id:string, itemId:string, month:string, amount:number }} Budget */
/** @typedef {{ version:number, items:Item[], wallets:Wallet[], txs:Transaction[], budgets:Budget[] }} DB */

const VERSION = 2;

// Demo seed (only used on first run)
const seedId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const DEMO_DB /** @type {DB} */ = {
  version: VERSION,
  items: [
    { id: seedId(), name: "Salary", type: "income", parentId: null },
    { id: seedId(), name: "Freelance", type: "income", parentId: null },
    { id: seedId(), name: "Groceries", type: "expense", parentId: null },
    { id: seedId(), name: "Restaurants", type: "expense", parentId: null },
    { id: seedId(), name: "Transport", type: "expense", parentId: null },
  ],
  wallets: [
    { id: seedId(), name: "Cash", currency: "RUB", initialBalance: 2000 },
    { id: seedId(), name: "Tinkoff debit", currency: "RUB", initialBalance: 12000 },
  ],
  txs: [],
  budgets: [],
};

// ------------------------- Utilities -------------------------
const cls = (...a) => a.filter(Boolean).join(" ");
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const TX_COLS = "min-w-[640px] sm:min-w-[720px] grid grid-cols-[5rem_4rem_6rem_10rem_10rem_1fr_6rem] sm:grid-cols-[7rem_5rem_8rem_12rem_12rem_1fr_8rem]";

function tryParseJSON(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    const db = tryParseJSON(raw);
    if (db && typeof db === "object" && db.version === VERSION) return db;
  }

  const rawV1 = localStorage.getItem("cft_db_v1");
  if (rawV1) {
    const old = tryParseJSON(rawV1);
    if (old && typeof old === "object") {
      const migrated = {
        version: VERSION,
        items: (old.items || []).map(i => ({ ...i, parentId: i.parentId ?? null })),
        wallets: old.wallets || [],
        txs: old.txs || [],
        budgets: []
      };
      saveDB(migrated);
      return migrated;
    }
  }

  const oldItems = tryParseJSON(localStorage.getItem("cft_items") || "null") || DEMO_DB.items;
  const oldWallets = tryParseJSON(localStorage.getItem("cft_wallets") || "null") || DEMO_DB.wallets;
  const oldTxs = tryParseJSON(localStorage.getItem("cft_transactions") || "null") || DEMO_DB.txs;
  const migrated = {
    version: VERSION,
    items: oldItems.map(i => ({ ...i, parentId: i.parentId ?? null })),
    wallets: oldWallets,
    txs: oldTxs,
    budgets: []
  };
  saveDB(migrated);
  return migrated;
}

function saveDB(db /** @type {DB} */) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

const PROFILE_KEY = "cft_profile_v1";

function loadProfile() {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (raw) {
    const p = tryParseJSON(raw);
    if (p && typeof p === "object") return p;
  }
  return { firstName: "", lastName: "", about: "", avatar: "" };
}

function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

function formatMoney(amount, currency = APP_CURRENCY) {
  if (amount == null || isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: APP_CURRENCY, maximumFractionDigits: 2 }).format(amount);
  }
}

function formatPercent(value) {
  if (value == null || isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 }).format(value);
}

// Debounce hook
function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), delay); return () => clearTimeout(id); }, [value, delay]);
  return v;
}

// ------------------------- Persistent store -------------------------
function useDB() {
  const [db, setDb] = useState(() => loadDB());

  // Persist on any change (single write, throttled via microtask)
  useEffect(() => { saveDB(db); }, [db]);

  // CRUD helpers (stable refs)
  const addTx = useCallback((t /** @type {Transaction} */) => setDb(d => ({ ...d, txs: [t, ...d.txs] })), []);
  const updTx = useCallback((t /** @type {Transaction} */) => setDb(d => ({ ...d, txs: d.txs.map(x => x.id === t.id ? t : x) })), []);
  const delTx = useCallback((id) => setDb(d => ({ ...d, txs: d.txs.filter(x => x.id !== id) })), []);

  const upsertItem = useCallback((i /** @type {Item} */) => setDb(d => {
    const exists = d.items.some(x => x.id === i.id);
    return { ...d, items: exists ? d.items.map(x => x.id === i.id ? i : x) : [i, ...d.items] };
  }), []);
  const delItem = useCallback((id) => setDb(d => ({ ...d, items: d.items.filter(x => x.id !== id) })), []);

  const upsertWallet = useCallback((w /** @type {Wallet} */) => setDb(d => {
    const exists = d.wallets.some(x => x.id === w.id);
    return { ...d, wallets: exists ? d.wallets.map(x => x.id === w.id ? w : x) : [w, ...d.wallets] };
  }), []);
  const delWallet = useCallback((id) => setDb(d => ({ ...d, wallets: d.wallets.filter(x => x.id !== id) })), []);

  const upsertBudget = useCallback(({ itemId, month, amount }) => setDb(d => {
    const a = Math.max(0, Number(amount) || 0);
    const idx = d.budgets.findIndex(b => b.itemId === itemId && b.month === month);
    if (idx >= 0) {
      const copy = d.budgets.slice();
      copy[idx] = { ...copy[idx], amount: a };
      return { ...d, budgets: copy };
    }
    return { ...d, budgets: [...d.budgets, { id: uid(), itemId, month, amount: a }] };
  }), []);

  const delBudget = useCallback((itemId, month) =>
    setDb(d => ({ ...d, budgets: d.budgets.filter(b => !(b.itemId === itemId && b.month === month)) })),
  []);

  const resetDemo = useCallback(() => setDb(DEMO_DB), []);
  const importDB = useCallback((data) => setDb(() => ({
    version: VERSION,
    items: (data.items || []).map(i => ({ ...i, parentId: i.parentId ?? null })),
    wallets: data.wallets || [],
    txs: data.txs || [],
    budgets: (data.budgets || []).map(b => ({ id: b.id || uid(), itemId: b.itemId, month: b.month, amount: Math.max(0, Number(b.amount) || 0) }))
  })), []);

  return { db, setDb, addTx, updTx, delTx, upsertItem, delItem, upsertWallet, delWallet, upsertBudget, delBudget, resetDemo, importDB };
}

// ------------------------- Derived selectors -------------------------
function useDerived(db /** @type {DB} */) {
  // lookup maps
  const itemMap = useMemo(() => Object.fromEntries(db.items.map(i => [i.id, i])), [db.items]);
  const walletMap = useMemo(() => Object.fromEntries(db.wallets.map(w => [w.id, w])), [db.wallets]);
  const childrenMap = useMemo(() => {
    const m = new Map();
    for (const i of db.items) {
      const p = i.parentId || null;
      if (!m.has(p)) m.set(p, []);
      m.get(p).push(i);
    }
    return m;
  }, [db.items]);

  const isLeaf = useCallback((itemId) => {
    const kids = childrenMap.get(itemId);
    return !kids || kids.length === 0;
  }, [childrenMap]);

  const getRootId = useCallback((itemId) => {
    let cur = itemMap[itemId];
    while (cur && cur.parentId) cur = itemMap[cur.parentId];
    return cur?.id || itemId;
  }, [itemMap]);

  const topLevelItems = useMemo(() => db.items.filter(i => !i.parentId), [db.items]);

  // balances per wallet
  const walletBalances = useMemo(() => {
    const m = new Map(db.wallets.map(w => [w.id, w.initialBalance || 0]));
    for (const t of db.txs) {
      const w = m.get(t.walletId);
      if (w == null) continue;
      m.set(t.walletId, (w || 0) + (t.type === "income" ? t.amount : -t.amount));
    }
    return m;
  }, [db.wallets, db.txs]);

  // totals
  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const t of db.txs) (t.type === "income" ? (inc += t.amount) : (exp += t.amount));
    const net = inc - exp;
    const totalBalance = db.wallets.reduce((s, w) => s + (walletBalances.get(w.id) || 0), 0);
    return { income: inc, expense: exp, net, totalBalance };
  }, [db.txs, db.wallets, walletBalances]);

  // monthly income/expense stats
  const monthly = useMemo(() => {
    const m = new Map();
    for (const t of db.txs) {
      const key = t.date.slice(0, 7);
      const obj = m.get(key) || { month: key, income: 0, expense: 0 };
      obj[t.type] += t.amount;
      m.set(key, obj);
    }
    return Array.from(m.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [db.txs]);

  // expense structure by item
  const expenseByItem = useMemo(() => {
    const m = new Map();
    for (const t of db.txs) if (t.type === "expense") {
      m.set(t.itemId, (m.get(t.itemId) || 0) + t.amount);
    }
    return Array.from(m.entries()).map(([id, value]) => ({ name: itemMap[id]?.name || "Unknown", value }));
  }, [db.txs, itemMap]);

  const actualByTopLevelForMonth = useCallback((month) => {
    const sums = new Map();
    for (const t of db.txs) {
      if (t.date.slice(0,7) !== month) continue;
      const root = getRootId(t.itemId);
      const rootItem = itemMap[root];
      if (!rootItem) continue;
      const prev = sums.get(root) || { amount: 0, type: rootItem.type };
      sums.set(root, { amount: prev.amount + Math.abs(t.amount), type: rootItem.type });
    }
    return Array.from(sums.entries()).map(([itemId, v]) => ({ itemId, ...v }));
  }, [db.txs, itemMap, getRootId]);

  const budgetByTopLevelForMonth = useCallback((month) => {
    const sums = new Map();
    for (const b of db.budgets || []) {
      if (b.month !== month) continue;
      const root = getRootId(b.itemId);
      sums.set(root, (sums.get(root) || 0) + Math.max(0, Number(b.amount) || 0));
    }
    return sums;
  }, [db.budgets, getRootId]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthEntry = monthly.find(m => m.month === currentMonth) || { income: 0, expense: 0 };
  const netThisMonth = monthEntry.income - monthEntry.expense;
  const expenseIncomeRatio = monthEntry.income ? monthEntry.expense / monthEntry.income : 0;

  return {
    itemMap,
    childrenMap,
    isLeaf,
    getRootId,
    topLevelItems,
    walletMap,
    walletBalances,
    totals,
    monthly,
    expenseByItem,
    actualByTopLevelForMonth,
    budgetByTopLevelForMonth,
    netThisMonth,
    expenseIncomeRatio,
  };
}

// ------------------------- App -------------------------
export default function App() {
  const { db, addTx, updTx, delTx, upsertItem, delItem, upsertWallet, delWallet, upsertBudget, delBudget, resetDemo, importDB } = useDB();
  const { itemMap, walletMap, walletBalances, totals, monthly, expenseByItem, actualByTopLevelForMonth, budgetByTopLevelForMonth, isLeaf, netThisMonth, expenseIncomeRatio } = useDerived(db);

  const [profile, setProfile] = useState(() => loadProfile());
  useEffect(() => { saveProfile(profile); }, [profile]);
  const [profileOpen, setProfileOpen] = useState(false);

  const initials = useMemo(() => {
    const f = profile.firstName?.trim()[0];
    const l = profile.lastName?.trim()[0];
    return ((f?f.toUpperCase():"") + (l?l.toUpperCase():"")).trim();
  }, [profile.firstName, profile.lastName]);

  const [tab, setTab] = useState(/** @type {"dashboard"|"transactions"|"items"|"wallets"} */("dashboard"));
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 250);
  const slowSearch = useDeferredValue(debouncedSearch);

  // filter & sort txs efficiently
  const filteredTxs = useMemo(() => {
    const q = slowSearch.trim().toLowerCase();
    const base = db.txs;
    if (!q) return base.slice().sort((a,b)=> b.date.localeCompare(a.date));
    return base.filter(t => {
      const item = itemMap[t.itemId]?.name || "";
      const wallet = walletMap[t.walletId]?.name || "";
      // compose a compact search key (no allocations in loop beyond template)
      return (
        t.date.toLowerCase().includes(q) ||
        t.type.includes(q) ||
        String(t.amount).includes(q) ||
        item.toLowerCase().includes(q) ||
        wallet.toLowerCase().includes(q) ||
        (t.comment||"").toLowerCase().includes(q)
      );
    }).sort((a,b)=> b.date.localeCompare(a.date));
  }, [db.txs, slowSearch, itemMap, walletMap]);

  const onExport = useCallback(() => {
    if (!confirm("Export data to JSON file?")) return;
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `canvas-finance-export-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, [db]);

  const onImport = useCallback((data) => {
    if (confirm("Importing will replace current data. Continue?")) importDB(data);
  }, [importDB]);

  const onHardReset = useCallback(() => {
    if (confirm("This will erase ALL local data. Continue?")) resetDemo();
  }, [resetDemo]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-2 sm:p-4 md:p-8">
      <div className="mx-auto w-full max-w-md md:max-w-6xl">
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Canvas Finance Tracker</h1>
            <p className="text-sm text-gray-500">Transactions · Items · Wallets — local & private</p>
          </div>
          <button onClick={()=>setProfileOpen(true)} className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center text-sm font-medium shadow border self-start sm:self-auto">
            {profile.avatar ? (
              <img src={profile.avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              initials ? initials : (
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-gray-500"><path fill="currentColor" d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/></svg>
              )
            )}
          </button>
        </header>
        {profileOpen && (
          <Modal onClose={()=>setProfileOpen(false)}>
            <ProfileScreen
              profile={profile}
              setProfile={setProfile}
              onExport={onExport}
              onImport={onImport}
              onHardReset={onHardReset}
              version={VERSION}
            />
          </Modal>
        )}
        <nav className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2 md:w-[48rem]">
          {[
            { id: "dashboard", label: "Dashboard" },
            { id: "transactions", label: "Transactions" },
            { id: "items", label: "Items" },
            { id: "wallets", label: "Wallets" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(/** @type any */(t.id))}
              className={cls("px-4 py-2 rounded-2xl text-sm font-medium border shadow-sm", tab === t.id ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50")}
            >{t.label}</button>
          ))}
        </nav>

          {tab === "dashboard" && (
            <Dashboard
              items={db.items}
              txs={db.txs}
              totals={totals}
              monthly={monthly}
              budgets={db.budgets}
              upsertBudget={upsertBudget}
              actualByTopLevelForMonth={actualByTopLevelForMonth}
              budgetByTopLevelForMonth={budgetByTopLevelForMonth}
            />
          )}


        {tab !== "dashboard" && <SummaryRow totals={totals} />}

        {tab === "transactions" && (
          <TransactionsPanel
            txs={filteredTxs}
            items={db.items}
            wallets={db.wallets}
            addTx={addTx}
            updTx={updTx}
            delTx={delTx}
            itemMap={itemMap}
            walletMap={walletMap}
            search={search}
            setSearch={setSearch}
            isLeaf={isLeaf}
          />
        )}

        {tab === "items" && (
          <ItemsPanel items={db.items} upsertItem={upsertItem} delItem={delItem} />
        )}

        {tab === "wallets" && (
          <WalletsPanel wallets={db.wallets} upsertWallet={upsertWallet} delWallet={delWallet} walletBalances={walletBalances} />
        )}

        <footer className="mt-10 text-xs text-gray-400">Data is stored locally in your browser (localStorage). No server involved.</footer>
      </div>
    </div>
  );
}

// ------------------------- Summary -------------------------
const KPI = React.memo(function KPI({ title, value, positive }) {
  return (
    <div className={cls("rounded-2xl border bg-white p-4 shadow-sm", positive?"":"")}>
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className={cls("mt-1 text-2xl font-semibold", positive?"text-emerald-600":"text-gray-900")}>{value}</div>
    </div>
  );
});

function SummaryRow({ totals }) {
  return (
    <div className="grid md:grid-cols-4 gap-3 mb-6">
      <KPI title="Income" value={formatMoney(totals.income)} positive />
      <KPI title="Expenses" value={formatMoney(totals.expense)} />
      <KPI title="Net" value={formatMoney(totals.net)} positive={totals.net>=0} />
      <KPI title="Total balance" value={formatMoney(totals.totalBalance)} positive />
    </div>
  );
}

// function DashboardPanel removed for new Dashboard

// ------------------------- Transactions -------------------------
function TransactionsPanel({ txs, items, wallets, addTx, updTx, delTx, itemMap, walletMap, search, setSearch, isLeaf }) {
  const [editingId, setEditingId] = useState(null); // null | string
  const [isAdding, setIsAdding] = useState(false);

  const openAdd = useCallback(() => { setIsAdding(true); setEditingId(null); }, []);
  const openEdit = useCallback((id) => { setEditingId(id); setIsAdding(false); }, []);
  const closeModal = useCallback(() => { setIsAdding(false); setEditingId(null); }, []);

  const onSave = useCallback((tx /** @type {Transaction} */) => {
    if (editingId) updTx(tx); else addTx(tx);
    closeModal();
  }, [editingId, updTx, addTx, closeModal]);

  const onDelete = useCallback((id) => { if (confirm("Delete this transaction?")) delTx(id); }, [delTx]);

  // Windowed table config
  const rowHeight = 44; // px
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const onScroll = useCallback((e) => setScrollTop(e.currentTarget.scrollTop), []);

  const containerHeight = 420; // fixed viewport; adjust if needed
  const total = txs.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 10);
  const endIndex = Math.min(total, Math.ceil((scrollTop + containerHeight) / rowHeight) + 10);
  const visible = txs.slice(startIndex, endIndex);
  const topPad = startIndex * rowHeight;
  const bottomPad = Math.max(0, (total - endIndex) * rowHeight);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search… (date, item, wallet, comment)" className="w-full rounded-2xl border px-4 py-2 bg-white shadow-sm" />
        </div>
        <button onClick={openAdd} className="px-4 py-2 rounded-2xl bg-gray-900 text-white shadow">+ Add transaction</button>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-x-auto">
        <div
          ref={containerRef}
          onScroll={onScroll}
          style={{ maxHeight: containerHeight, overflowY: "auto" }}
        >
          <div className={cls("sticky top-0 bg-gray-50 text-gray-600", TX_COLS)}>
            <div className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Date</div>
            <div className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Type</div>
            <div className="p-3 text-right text-xs font-semibold uppercase tracking-wide">Amount</div>
            <div className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Item</div>
            <div className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Wallet</div>
            <div className="p-3 text-left text-xs font-semibold uppercase tracking-wide">Comment</div>
            <div className="p-3 text-right text-xs font-semibold uppercase tracking-wide">Actions</div>
          </div>

          {txs.length === 0 && (
            <div className="p-6 text-center text-gray-500">No transactions yet. Add your first one!</div>
          )}

          {txs.length > 0 && (
            <>
              {topPad > 0 && <div style={{ height: topPad }} />}
              {visible.map(t => (
                <TransactionRow
                  key={t.id}
                  t={t}
                  item={itemMap[t.itemId]}
                  wallet={walletMap[t.walletId]}
                  onEdit={openEdit}
                  onDelete={onDelete}
                />
              ))}
              {bottomPad > 0 && <div style={{ height: bottomPad }} />}
            </>
          )}
        </div>
      </div>

      {(isAdding || editingId) && (
        <Modal onClose={closeModal}>
          <TransactionForm
            tx={editingId ? txs.find(x=>x.id===editingId) : undefined}
            onSave={onSave}
            items={items}
            wallets={wallets}
            isLeaf={isLeaf}
          />
        </Modal>
      )}
    </div>
  );
}

const Th = React.memo(function Th({ children, className }) { return <th className={cls("p-3 text-left text-xs font-semibold uppercase tracking-wide", className)}>{children}</th>; });
const Td = React.memo(function Td({ children, className }) { return <td className={cls("p-3 align-top", className)}>{children}</td>; });

const TransactionRow = React.memo(function TransactionRow({ t, item, wallet, onEdit, onDelete }) {
  return (
    <div className={cls("border-t", TX_COLS)}>
      <div className="p-3">{t.date}</div>
      <div className="p-3">
        <span className={cls(
          "px-2 py-1 rounded-full text-xs font-medium",
          t.type === "income" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
        )}>{t.type}</span>
      </div>
      <div className={cls("p-3 text-right", t.type === "income" ? "text-emerald-700" : "text-rose-700")}>{formatMoney(t.amount, wallet?.currency)}</div>
      <div className="p-3">{item?.name || "—"}</div>
      <div className="p-3">{wallet?.name || "—"}</div>
      <div className="p-3 max-w-[14rem] truncate" title={t.comment||""}>{t.comment}</div>
      <div className="p-3 text-right">
        <button onClick={()=>onEdit(t.id)} className="px-2 py-1 text-xs rounded-lg border mr-2 hover:bg-gray-50">Edit</button>
        <button onClick={()=>onDelete(t.id)} className="px-2 py-1 text-xs rounded-lg border hover:bg-gray-50">Delete</button>
      </div>
    </div>
  );
});

function TransactionForm({ tx, onSave, items, wallets, isLeaf }) {
  const [date, setDate] = useState(tx?.date || new Date().toISOString().slice(0,10));
  const [type, setType] = useState(tx?.type || "expense");
  const [amount, setAmount] = useState(tx?.amount?.toString() || "");
  const [itemId, setItemId] = useState(tx?.itemId || "");
  const [walletId, setWalletId] = useState(tx?.walletId || (wallets[0]?.id || ""));
  const [comment, setComment] = useState(tx?.comment || "");

  const filteredItems = useMemo(() => items.filter(i=>i.type===type && isLeaf(i.id)), [items, type, isLeaf]);

  useEffect(()=>{ if (!filteredItems.find(i=>i.id===itemId)) setItemId(""); }, [filteredItems, itemId]);

  const submit = useCallback((e) => {
    e.preventDefault();
    const amt = parseFloat(String(amount).replace(",","."));
    if (!date || !type || !amt || !itemId || !walletId) { alert("Please fill all required fields."); return; }
    onSave({ id: tx?.id || uid(), date, type, amount: Math.abs(amt), itemId, walletId, comment: comment?.trim() || "" });
  }, [date, type, amount, itemId, walletId, comment, onSave, tx?.id]);

  return (
    <form onSubmit={submit} className="w-[92vw] max-w-xl">
      <h3 className="text-lg font-semibold mb-3">{tx?"Edit transaction":"Add transaction"}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">Date
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="rounded-xl border px-3 py-2" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">Type
          <select value={type} onChange={e=>setType(e.target.value)} className="rounded-xl border px-3 py-2">
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Amount
          <input type="number" step="0.01" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} className="rounded-xl border px-3 py-2" placeholder="0.00" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">Wallet
          <select value={walletId} onChange={e=>setWalletId(e.target.value)} className="rounded-xl border px-3 py-2" required>
            <option value="" disabled>Choose wallet…</option>
            {wallets.map(w=> <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Item (category)
          <select value={itemId} onChange={e=>setItemId(e.target.value)} className="rounded-xl border px-3 py-2" required>
            <option value="" disabled>Choose item…</option>
            {filteredItems.map(i=> <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">Comment
          <input value={comment} onChange={e=>setComment(e.target.value)} className="rounded-xl border px-3 py-2" placeholder="Optional note" />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button type="submit" className="px-4 py-2 rounded-2xl bg-gray-900 text-white">Save</button>
        <button type="button" onClick={()=>window.dispatchEvent(new Event("modal-close"))} className="px-4 py-2 rounded-2xl border">Cancel</button>
      </div>
    </form>
  );
}

// ------------------------- Items -------------------------
function ItemsPanel({ items, upsertItem, delItem }) {
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);

  const grouped = useMemo(() => {
    const filtered = items.filter(i => filter === "all" || i.type === filter);
    const map = new Map(); // parentId|null -> Item[]
    for (const i of filtered) {
      const p = i.parentId || null;
      if (!map.has(p)) map.set(p, []);
      map.get(p).push(i);
    }
    const res = [];
    const walk = (parentId, depth) => {
      const arr = map.get(parentId) || [];
      arr.sort((a, b) => a.name.localeCompare(b.name));
      for (const item of arr) {
        res.push({ item, depth });
        walk(item.id, depth + 1);
      }
    };
    walk(null, 0);
    return res;
  }, [items, filter]);

  const onDelete = useCallback((id) => {
    if (items.some(i => i.parentId === id)) {
      alert("This item has sub-items. Reassign or delete its sub-items first.");
      return;
    }
    if (confirm("Delete this item? Transactions using it will show blank name.")) delItem(id);
  }, [items, delItem]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2">
          <TabPill active={filter==="all"} onClick={()=>setFilter("all")} label="All" />
          <TabPill active={filter==="income"} onClick={()=>setFilter("income")} label="Income" />
          <TabPill active={filter==="expense"} onClick={()=>setFilter("expense")} label="Expense" />
        </div>
        <div className="flex-1" />
        <button onClick={()=>setEditing("new")} className="px-4 py-2 rounded-2xl bg-gray-900 text-white shadow">+ Add item</button>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr><td colSpan={3} className="p-6 text-center text-gray-500">No items yet. Add your first one!</td></tr>
            )}
            {grouped.map(({ item: i, depth }) => (
              <tr key={i.id} className="border-t">
                <Td>
                  <div style={{ paddingLeft: depth * 16 }}>{i.name}</div>
                </Td>
                <Td>
                  <span className={cls("px-2 py-1 rounded-full text-xs font-medium", i.type==="income"?"bg-emerald-50 text-emerald-700":"bg-rose-50 text-rose-700")}>{i.type}</span>
                </Td>
                <Td className="text-right">
                  <button onClick={()=>setEditing(i.id)} className="px-2 py-1 text-xs rounded-lg border mr-2 hover:bg-gray-50">Edit</button>
                  <button onClick={()=>onDelete(i.id)} className="px-2 py-1 text-xs rounded-lg border hover:bg-gray-50">Delete</button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal onClose={()=>setEditing(null)}>
          <ItemForm
            item={editing!=="new" ? items.find(x=>x.id===editing) : undefined}
            onSave={(rec)=>{ upsertItem(rec); setEditing(null); }}
            allItems={items}
          />
        </Modal>
      )}
    </div>
  );
}

function ItemForm({ item, onSave, allItems }) {
  const [name, setName] = useState(item?.name || "");
  const [type, setType] = useState(item?.type || "expense");
  const [parentId, setParentId] = useState(item?.parentId || "");

  const candidates = useMemo(() => allItems.filter(i => i.type === type && i.id !== item?.id), [allItems, type, item?.id]);

  const submit = useCallback((e) => {
    e.preventDefault();
    if (!name.trim()) { alert("Enter name"); return; }
    onSave({ id: item?.id || uid(), name: name.trim(), type, parentId: parentId || null });
  }, [name, type, parentId, onSave, item?.id]);

  return (
    <form onSubmit={submit} className="w-[92vw] max-w-md">
      <h3 className="text-lg font-semibold mb-3">{item?"Edit item":"Add item"}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">Name
          <input value={name} onChange={e=>setName(e.target.value)} className="rounded-xl border px-3 py-2" placeholder="e.g. Groceries" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">Type
          <select value={type} onChange={e=>setType(e.target.value)} className="rounded-xl border px-3 py-2">
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">Parent
          <select value={parentId} onChange={e=>setParentId(e.target.value)} className="rounded-xl border px-3 py-2">
            <option value="">(none)</option>
            {candidates.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button type="submit" className="px-4 py-2 rounded-2xl bg-gray-900 text-white">Save</button>
        <button type="button" onClick={()=>window.dispatchEvent(new Event("modal-close"))} className="px-4 py-2 rounded-2xl border">Cancel</button>
      </div>
    </form>
  );
}

// ------------------------- Wallets -------------------------
function WalletsPanel({ wallets, upsertWallet, delWallet, walletBalances }) {
  const [editing, setEditing] = useState(null);

  const onDelete = useCallback((id) => { if (confirm("Delete this wallet? Transactions using it will remain but show blank name.")) delWallet(id); }, [delWallet]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-600">Initial balances are applied once; current balance includes all transactions.</div>
        <button onClick={()=>setEditing("new")} className="px-4 py-2 rounded-2xl bg-gray-900 text-white shadow">+ Add wallet</button>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <Th>Name</Th>
              <Th>Currency</Th>
              <Th className="text-right">Initial</Th>
              <Th className="text-right">Current</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {wallets.length===0 && (
              <tr><td colSpan={5} className="p-6 text-center text-gray-500">No wallets yet. Add your first one!</td></tr>
            )}
            {wallets.map(w => (
              <tr key={w.id} className="border-t">
                <Td>{w.name}</Td>
                <Td>{w.currency || "—"}</Td>
                <Td className="text-right">{formatMoney(w.initialBalance || 0, w.currency)}</Td>
                <Td className="text-right text-emerald-700">{formatMoney(walletBalances.get(w.id)||0, w.currency)}</Td>
                <Td className="text-right">
                  <button onClick={()=>setEditing(w.id)} className="px-2 py-1 text-xs rounded-lg border mr-2 hover:bg-gray-50">Edit</button>
                  <button onClick={()=>onDelete(w.id)} className="px-2 py-1 text-xs rounded-lg border hover:bg-gray-50">Delete</button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal onClose={()=>setEditing(null)}>
          <WalletForm
            wallet={editing!=="new" ? wallets.find(x=>x.id===editing) : undefined}
            onSave={(rec)=>{ upsertWallet(rec); setEditing(null); }}
          />
        </Modal>
      )}
    </div>
  );
}

function WalletForm({ wallet, onSave }) {
  const [name, setName] = useState(wallet?.name || "");
  const [currency, setCurrency] = useState(wallet?.currency || APP_CURRENCY);
  const [initial, setInitial] = useState(wallet?.initialBalance?.toString() || "0");

  const submit = useCallback((e) => {
    e.preventDefault();
    if (!name.trim()) { alert("Enter name"); return; }
    const init = parseFloat(String(initial).replace(",",".")) || 0;
    onSave({ id: wallet?.id || uid(), name: name.trim(), currency: currency?.trim() || undefined, initialBalance: init });
  }, [name, currency, initial, onSave, wallet?.id]);

  return (
    <form onSubmit={submit} className="w-[92vw] max-w-md">
      <h3 className="text-lg font-semibold mb-3">{wallet?"Edit wallet":"Add wallet"}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">Name
          <input value={name} onChange={e=>setName(e.target.value)} className="rounded-xl border px-3 py-2" placeholder="e.g. Tinkoff debit" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">Currency
          <input value={currency} onChange={e=>setCurrency(e.target.value)} className="rounded-xl border px-3 py-2" placeholder={APP_CURRENCY} />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">Initial balance
          <input type="number" step="0.01" inputMode="decimal" value={initial} onChange={e=>setInitial(e.target.value)} className="rounded-xl border px-3 py-2" />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button type="submit" className="px-4 py-2 rounded-2xl bg-gray-900 text-white">Save</button>
        <button type="button" onClick={()=>window.dispatchEvent(new Event("modal-close"))} className="px-4 py-2 rounded-2xl border">Cancel</button>
      </div>
    </form>
  );
}

// ------------------------- Small UI bits -------------------------
const TabPill = React.memo(function TabPill({ active, onClick, label }) {
  return (
    <button onClick={onClick} className={cls("px-3 py-1.5 rounded-full text-sm border shadow-sm", active?"bg-gray-900 text-white":"bg-white hover:bg-gray-50")}>{label}</button>
  );
});

function ProfileScreen({ profile, setProfile, onExport, onImport, onHardReset, version }) {
  const fileRef = useRef(null);
  const changePhoto = useCallback((e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setProfile(p => ({ ...p, avatar: reader.result }));
    };
    reader.readAsDataURL(f);
    e.currentTarget.value = "";
  }, [setProfile]);

  const headerInitials = (profile.firstName?.[0] || "" ) + (profile.lastName?.[0] || "");

  return (
    <div className="w-[92vw] max-w-sm">
      <h3 className="text-lg font-semibold mb-4">Profile</h3>
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          {profile.avatar ? (
            <img src={profile.avatar} alt="avatar" className="w-24 h-24 rounded-full object-cover" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-3xl text-gray-600">
              {headerInitials ? headerInitials.toUpperCase() : (
                <svg viewBox="0 0 24 24" className="w-12 h-12 text-gray-400"><path fill="currentColor" d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/></svg>
              )}
            </div>
          )}
          <button type="button" onClick={()=>fileRef.current?.click()} className="absolute bottom-0 right-0 p-1 bg-white border rounded-full text-xs">✎</button>
          <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={changePhoto} />
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <label className="flex flex-col gap-1 text-sm">First name
          <input value={profile.firstName} onChange={e=>setProfile(p=>({ ...p, firstName: e.target.value }))} className="rounded-xl border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">Last name
          <input value={profile.lastName} onChange={e=>setProfile(p=>({ ...p, lastName: e.target.value }))} className="rounded-xl border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">About me
          <textarea value={profile.about} onChange={e=>setProfile(p=>({ ...p, about: e.target.value }))} className="rounded-xl border px-3 py-2" />
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <button onClick={onExport} className="w-full px-3 py-2 rounded-xl bg-white shadow border text-sm hover:bg-gray-50">Export JSON</button>
        <ImportButton onImport={onImport} className="w-full text-center" />
        <button onClick={onHardReset} className="w-full px-3 py-2 rounded-xl bg-white shadow border text-sm hover:bg-gray-50">Reset demo</button>
      </div>
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>Database version: {version}</p>
        <p>Data is stored locally in this browser.</p>
      </div>
    </div>
  );
}

function Modal({ children, onClose }) {
  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onClose?.(); };
    const onExt = () => onClose?.();
    window.addEventListener("keydown", onEsc);
    window.addEventListener("modal-close", onExt);
    return () => { window.removeEventListener("keydown", onEsc); window.removeEventListener("modal-close", onExt); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 rounded-2xl bg-white p-4 md:p-6 shadow-xl border max-h-[90vh] overflow-auto">
        {children}
      </div>
    </div>
  );
}

function ImportButton({ onImport, className = "" }) {
  const onChange = useCallback((e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = tryParseJSON(String(reader.result||"{}"));
      if (!data || typeof data !== "object") { alert("Invalid JSON"); return; }
      onImport?.(data);
    };
    reader.readAsText(f);
    e.currentTarget.value = "";
  }, [onImport]);
  return (
    <label className={cls("px-3 py-2 rounded-xl bg-white shadow border text-sm hover:bg-gray-50 cursor-pointer", className)}>
      Import JSON
      <input type="file" accept="application/json" onChange={onChange} className="hidden" />
    </label>
  );
}
