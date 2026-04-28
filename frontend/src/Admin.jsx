import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./api.js";
import {
  IcShield, IcPlus, IcTrash, IcDownload,
  IcFile, IcSettings, IcDollar, IcWarning,
} from "./Icons.jsx";

export default function Admin({ showToast }) {
  const [manuals, setManuals] = useState([]);
  const [usdtAddr, setUsdtAddr] = useState("");
  const [savingUsdt, setSavingUsdt] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadManuals = useCallback(() => {
    fetch(`${API_BASE}/admin/manuals`)
      .then(r => r.json())
      .then(d => setManuals(Array.isArray(d) ? d : []))
      .catch(() => setManuals([]));
  }, []);

  useEffect(() => {
    loadManuals();
    fetch(`${API_BASE}/shop_config`)
      .then(r => r.json())
      .then(d => setUsdtAddr(d.usdt_trc20_address || ""))
      .catch(() => {});
  }, [loadManuals]);

  const saveUsdt = async (e) => {
    e.preventDefault(); setSavingUsdt(true);
    try {
      const r = await fetch(`${API_BASE}/admin/shop_config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdt_trc20_address: usdtAddr }),
      });
      if (!r.ok) { showToast("Помилка збереження", "error"); return; }
      showToast("USDT адресу збережено", "success");
    } finally { setSavingUsdt(false); }
  };

  const addManual = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      title: fd.get("title"),
      description: fd.get("description"),
      category: fd.get("category"),
      photo_url: fd.get("photo_url"),
      price: fd.get("price"),
      manual_link: fd.get("manual_link"),
    };
    setAddingManual(true);
    try {
      const r = await fetch(`${API_BASE}/admin/add_manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { showToast(d.error || "Помилка", "error"); return; }
      e.target.reset();
      showToast(`Мануал #${d.id} додано`, "success");
      loadManuals();
    } finally { setAddingManual(false); }
  };

  const deleteManual = async (id) => {
    if (!window.confirm("Видалити мануал?")) return;
    setDeletingId(id);
    try {
      const r = await fetch(`${API_BASE}/admin/delete_manual/${id}`, { method: "DELETE" });
      if (!r.ok) { showToast("Не вдалося видалити", "error"); return; }
      showToast("Видалено", "info");
      loadManuals();
    } finally { setDeletingId(null); }
  };

  return (
    <main className="page admin-page">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, background: "var(--accent-s)", borderRadius: "var(--r)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
            <IcShield s={20} />
          </div>
          <div>
            <h1>Адмін-панель</h1>
            <p>Керування товарами, налаштування та звіти</p>
          </div>
        </div>
      </div>

      {/* ── USDT Address ── */}
      <div className="admin-section">
        <div className="admin-section__head">
          <IcDollar s={17} style={{ color: "var(--accent)" }} />
          USDT TRC20 — адреса для клієнтів
        </div>
        <div className="admin-section__body">
          <p style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 14 }}>
            Відображається в панелі поповнення балансу для ручного переказу.
          </p>
          <form onSubmit={saveUsdt} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
              <label htmlFor="usdt-addr">Адреса гаманця (TRC20)</label>
              <input
                id="usdt-addr"
                className="input"
                value={usdtAddr}
                onChange={e => setUsdtAddr(e.target.value)}
                placeholder="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingUsdt}>
              {savingUsdt ? <><span className="spinner" /> Збереження…</> : <><IcSettings s={15} /> Зберегти</>}
            </button>
          </form>
        </div>
      </div>

      {/* ── Add manual ── */}
      <div className="admin-section">
        <div className="admin-section__head">
          <IcPlus s={17} style={{ color: "var(--green)" }} />
          Додати мануал
        </div>
        <div className="admin-section__body">
          <form onSubmit={addManual}>
            <div className="admin-form-grid">
              <div className="form-group">
                <label>Назва *</label>
                <input className="input" name="title" required placeholder="Назва мануалу" />
              </div>
              <div className="form-group">
                <label>Категорія *</label>
                <input className="input" name="category" required placeholder="Наприклад: Двигун" />
              </div>
              <div className="form-group">
                <label>Ціна ($) *</label>
                <input className="input" name="price" type="number" step="0.01" min="0" required placeholder="9.99" />
              </div>
              <div className="form-group">
                <label>URL обкладинки *</label>
                <input className="input" name="photo_url" required placeholder="https://example.com/photo.jpg" />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Опис</label>
                <input className="input" name="description" placeholder="Короткий опис мануалу" required />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Посилання на файл (видається після покупки) *</label>
                <input className="input" name="manual_link" required placeholder="https://drive.google.com/…" />
                <span className="hint" style={{ fontSize: 12, color: "var(--ink3)" }}>
                  Клієнт отримає це посилання після успішної оплати.
                </span>
              </div>
            </div>
            <button type="submit" className="btn btn-green" disabled={addingManual}>
              {addingManual
                ? <><span className="spinner" /> Збереження…</>
                : <><IcPlus s={16} /> Додати мануал</>
              }
            </button>
          </form>
        </div>
      </div>

      {/* ── Manuals table ── */}
      <div className="admin-section">
        <div className="admin-section__head">
          <IcFile s={17} style={{ color: "var(--blue)" }} />
          Всі мануали
          <span className="badge" style={{ marginLeft: "auto", background: "var(--surf3)", border: "1px solid var(--border)", color: "var(--ink2)", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: "999px" }}>
            {manuals.length}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          {manuals.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 24px" }}>
              <div className="empty-state__icon"><IcFile s={24} /></div>
              <p className="empty-state__sub">Мануалів ще немає — додайте перший!</p>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Назва</th>
                  <th>Категорія</th>
                  <th>Ціна</th>
                  <th>Посилання</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {manuals.map(m => (
                  <tr key={m.id}>
                    <td style={{ color: "var(--ink3)", fontSize: 12 }}>{m.id}</td>
                    <td style={{ fontWeight: 600, maxWidth: 200 }}>{m.title}</td>
                    <td>
                      {m.category && (
                        <span className="badge badge--accent">{m.category}</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 700, color: "var(--accent)" }}>${Number(m.price).toFixed(2)}</td>
                    <td className="cell-link" title={m.manual_link || ""}>{m.manual_link || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteManual(m.id)}
                        disabled={deletingId === m.id}
                      >
                        {deletingId === m.id
                          ? <span className="spinner spinner--dark" style={{ width: 13, height: 13 }} />
                          : <IcTrash s={13} />
                        }
                        Видалити
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Reports ── */}
      <div className="admin-section">
        <div className="admin-section__head">
          <IcDownload s={17} style={{ color: "var(--green)" }} />
          Звіти по замовленнях
        </div>
        <div className="admin-section__body">
          <p style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 14 }}>
            Завантажте повний звіт по всіх замовленнях у зручному форматі.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-green"
              onClick={() => window.open(`${API_BASE}/report/excel`, "_blank")}
            >
              <IcDownload s={15} /> Excel (.xlsx)
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => window.open(`${API_BASE}/report/pdf`, "_blank")}
            >
              <IcDownload s={15} /> PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Warning note ── */}
      <div className="alert alert--info">
        <IcWarning s={16} style={{ flexShrink: 0, marginTop: 1 }} />
        Адмін-панель доступна за URL <strong>/admin</strong>. Захистіть доступ на рівні сервера в production.
      </div>
    </main>
  );
}
