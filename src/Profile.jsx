import React, { useState, useCallback, useEffect } from "react";
import { ImportButton } from "./App.jsx";

export default function Profile({ profile, setProfile, onExport, onImport, onReset, db }) {
  const [form, setForm] = useState(profile);

  useEffect(() => setForm(profile), [profile]);

  const onChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }, []);

  const onChangeSettings = useCallback((e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, settings: { ...f.settings, [name]: value } }));
  }, []);

  const onSave = useCallback(() => setProfile(form), [form, setProfile]);
  const onCancel = useCallback(() => setForm(profile), [profile]);

  const onPhoto = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Unsupported file"); return; }
    if (file.size > 1024 * 1024) { alert("Image too large (max 1MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, avatar: reader.result }));
    reader.readAsDataURL(file);
    e.currentTarget.value = "";
  }, []);

  const initials = `${profile.firstName?.[0] || ""}${profile.lastName?.[0] || ""}`.toUpperCase() || "?";

  const storageSize = new Blob([
    localStorage.getItem("cft_db_v2") || "",
    localStorage.getItem("cft_profile_v1") || "",
  ]).size;

  return (
    <div className="space-y-6 pb-24">
      <section className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden text-3xl">
          {form.avatar ? <img src={form.avatar} alt="avatar" className="w-full h-full object-cover" /> : initials}
        </div>
        <div>
          <label className="block text-sm font-medium">Change photo
            <input type="file" accept="image/*" onChange={onPhoto} className="block mt-1" />
          </label>
        </div>
      </section>
      <section className="space-y-2">
        <input name="firstName" value={form.firstName} onChange={onChange} placeholder="First name" className="w-full p-2 border rounded" />
        <input name="lastName" value={form.lastName} onChange={onChange} placeholder="Last name" className="w-full p-2 border rounded" />
        <textarea name="about" value={form.about} onChange={onChange} placeholder="About" className="w-full p-2 border rounded" />
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">General settings</h2>
        <div className="flex flex-col gap-2">
          <label>Language
            <select name="lang" value={form.settings.lang} onChange={onChangeSettings} className="ml-2 p-1 border rounded">
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
          </label>
          <label>Theme
            <select name="theme" value={form.settings.theme} onChange={onChangeSettings} className="ml-2 p-1 border rounded">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
          <label>Default currency
            <input name="currency" value={form.settings.currency} onChange={onChangeSettings} className="ml-2 p-1 border rounded" />
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Data</h2>
        <div className="flex flex-col gap-2">
          <button onClick={() => { if (confirm("Export data?")) onExport(); }} className="px-3 py-2 rounded bg-white border shadow-sm">Export JSON</button>
          <ImportButton onImport={(d) => { if (confirm("Import data?")) onImport(d); }} />
          <button onClick={() => { if (confirm("Reset demo data?")) onReset(); }} className="px-3 py-2 rounded bg-white border shadow-sm">Reset demo</button>
          <div className="text-sm text-gray-500">Wallets: {db.wallets.length}, Tx: {db.txs.length}, Budgets: {db.budgets.length}</div>
          <div className="text-sm text-gray-500">Storage: {storageSize} bytes</div>
        </div>
      </section>

      <section className="space-y-1 text-sm text-gray-600">
        <h2 className="font-medium text-gray-900">About app</h2>
        <div>DB version: {db.version}</div>
        <p>Simple offline finance tracker. All data stays in your browser.</p>
        <a className="text-blue-600 underline" href="https://opensource.org/licenses/MIT" target="_blank">MIT License</a>
      </section>

      <div className="flex gap-2">
        <button onClick={onSave} className="px-4 py-2 rounded bg-gray-900 text-white">Save</button>
        <button onClick={onCancel} className="px-4 py-2 rounded bg-white border">Cancel</button>
      </div>
    </div>
  );
}
