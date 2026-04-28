import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { API_BASE } from "./api.js";
import {
  IcFile, IcHome, IcCart, IcWallet, IcShield,
  IcChevronDown, IcChevronUp, IcCopy, IcRefresh,
  IcCheckCircle, IcWarning, IcDollar,
} from "./Icons.jsx";

export default function Navbar({ email, balance, onRefreshBalance, showToast }) {
  const [usdt, setUsdt] = useState("");
  const [topupAmt, setTopupAmt] = useState("10");
  const [pendingId, setPendingId] = useState(null);
  const [invoiceId, setInvoiceId] = useState(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [method, setMethod] = useState("crypto");
  const [busy, setBusy] = useState("");
  const [cryptoStatus, setCryptoStatus] = useState("");
  const location = useLocation();

  useEffect(() => { setWalletOpen(false); }, [location.pathname]);

  useEffect(() => {
    fetch(`${API_BASE}/shop_config`)
      .then(r => r.json())
      .then(d => setUsdt(d.usdt_trc20_address || ""))
      .catch(() => {});
  }, []);

  const copyUsdt = () => {
    if (!usdt) return;
    navigator.clipboard.writeText(usdt)
      .then(() => showToast("Адресу скопійовано", "success"))
      .catch(() => showToast(usdt, "info"));
  };

  const createInvoice = async () => {
    const amt = parseFloat(String(topupAmt).replace(",", "."));
    if (!(amt > 0)) { showToast("Вкажіть суму", "warn"); return; }
    setBusy("invoice"); setCryptoStatus("");
    try {
      const r = await fetch(`${API_BASE}/crypto/create_invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, amount: amt }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { showToast(d.error || "Помилка Crypto Bot", "error"); return; }
      setPendingId(d.pending_id);
      setInvoiceId(d.invoice_id);
      setCryptoStatus("pending");
      if (d.pay_url) window.open(d.pay_url, "_blank", "noopener,noreferrer");
      else showToast("Інвойс створено, але посилання відсутнє", "warn");
    } finally { setBusy(""); }
  };

  const checkPayment = async () => {
    if (invoiceId == null && pendingId == null) {
      showToast("Спочатку створіть інвойс", "warn"); return;
    }
    setBusy("check");
    try {
      const body = { email };
      if (invoiceId != null) body.invoice_id = invoiceId;
      else body.pending_id = pendingId;
      const r = await fetch(`${API_BASE}/crypto/check_invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { showToast(d.error || "Помилка перевірки", "error"); return; }
      if (d.status === "paid") {
        setCryptoStatus("paid");
        showToast(`Зараховано ${d.credited ?? ""} USDT 🎉`, "success");
        onRefreshBalance();
        return;
      }
      showToast("Платіж ще не підтверджено", "warn");
    } finally { setBusy(""); }
  };

  const lc = ({ isActive }) => `nav__link${isActive ? " active" : ""}`;

  return (
    <nav className="nav">
      {/* ── Top bar ── */}
      <div className="nav__bar">
        {/* Logo */}
        <NavLink to="/" className="nav__logo" style={{ textDecoration: "none" }}>
          <span className="nav__logo-icon"><IcFile s={17} /></span>
          Мануали
        </NavLink>

        <div className="nav__divider" />

        {/* Desktop nav links */}
        <div className="nav__links">
          <NavLink to="/" end className={lc}>
            <IcHome s={15} /> Магазин
          </NavLink>
          <NavLink to="/cart" className={lc}>
            <IcCart s={15} /> Корзина
          </NavLink>
        </div>

        <div className="nav__spacer" />

        {/* Balance */}
        <div className="nav__balance">
          <IcDollar s={14} className="nav__balance-icon" />
          <span>${Number(balance).toFixed(2)}</span>
        </div>

        {/* Top-up toggle */}
        <button
          type="button"
          className={`nav__topup${walletOpen ? " open" : ""}`}
          onClick={() => setWalletOpen(v => !v)}
          aria-expanded={walletOpen}
          aria-controls="wallet-panel"
        >
          <IcWallet s={15} />
          <span className="nav__topup-label">Поповнити</span>
          {walletOpen ? <IcChevronUp s={14} /> : <IcChevronDown s={14} />}
        </button>

        {/* Admin button */}
        <NavLink to="/admin" className={({ isActive }) => `nav__admin-btn${isActive ? " active" : ""}`}>
          <IcShield s={14} />
          <span className="nav__admin-label">Адмін</span>
        </NavLink>
      </div>

      {/* ── Wallet panel ── */}
      {walletOpen && (
        <div id="wallet-panel" className="nav__panel">
          <div className="nav__panel-inner">

            {/* Method tabs */}
            <div className="nav__panel-tabs">
              <button
                type="button"
                className={`nav__tab${method === "crypto" ? " active" : ""}`}
                onClick={() => setMethod("crypto")}
              >
                <IcWallet s={14} /> Crypto Bot
              </button>
              <button
                type="button"
                className={`nav__tab${method === "usdt" ? " active" : ""}`}
                onClick={() => setMethod("usdt")}
              >
                <IcDollar s={14} /> USDT TRC20
              </button>
            </div>

            {/* ── Crypto Bot ── */}
            {method === "crypto" && (
              <div className="nav__panel-body">
                <div className="nav__panel-field">
                  <label htmlFor="topup-amt">Сума (USDT)</label>
                  <input
                    id="topup-amt"
                    className="input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={topupAmt}
                    onChange={e => setTopupAmt(e.target.value)}
                    style={{ width: 130 }}
                  />
                </div>

                <div className="nav__panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={createInvoice}
                    disabled={!!busy}
                  >
                    {busy === "invoice" ? <span className="spinner" /> : <IcWallet s={15} />}
                    Оплатити через Crypto Bot
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={checkPayment}
                    disabled={!!busy || (invoiceId == null && pendingId == null)}
                    title="Перевірити статус"
                  >
                    {busy === "check" ? <span className="spinner spinner--dark" /> : <IcRefresh s={15} />}
                    Перевірити оплату
                  </button>
                </div>

                {cryptoStatus === "pending" && (
                  <div className="nav__status nav__status--pending">
                    <IcWarning s={15} style={{ flexShrink: 0 }} />
                    Оплатіть у Telegram, потім натисніть «Перевірити оплату».
                  </div>
                )}
                {cryptoStatus === "paid" && (
                  <div className="nav__status nav__status--paid">
                    <IcCheckCircle s={15} style={{ flexShrink: 0 }} />
                    Платіж підтверджено, баланс оновлено!
                  </div>
                )}
                <p className="nav__panel-note">
                  Після натискання відкриється Telegram із рахунком від @CryptoBot.
                </p>
              </div>
            )}

            {/* ── USDT TRC20 ── */}
            {method === "usdt" && (
              <div className="nav__panel-body">
                {usdt ? (
                  <>
                    <div style={{ width: "100%" }}>
                      <p style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 10 }}>
                        Надішліть USDT (мережа TRC20) на адресу нижче. Після переказу зверніться до підтримки.
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div className="nav__usdt-address">
                          <span className="nav__usdt-text">{usdt}</span>
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={copyUsdt}>
                          <IcCopy s={14} /> Копіювати
                        </button>
                      </div>
                      <div className="nav__usdt-warn">
                        <IcWarning s={14} style={{ flexShrink: 0, marginTop: 1 }} />
                        Переказуйте тільки USDT в мережі TRC20 (Tron). Інші мережі не підтримуються.
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "var(--ink3)", fontSize: 14 }}>
                    <IcDollar s={28} style={{ margin: "0 auto 8px" }} />
                    <p>USDT-адреса ще не налаштована адміністратором.</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Mobile bottom nav ── */}
      <div className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => `bnav-item${isActive ? " active" : ""}`}>
          <IcHome s={22} /> Магазин
        </NavLink>
        <NavLink to="/cart" className={({ isActive }) => `bnav-item${isActive ? " active" : ""}`}>
          <IcCart s={22} /> Корзина
        </NavLink>
        <button type="button" className={`bnav-item${walletOpen ? " active" : ""}`} onClick={() => setWalletOpen(v => !v)}>
          <IcWallet s={22} /> Гаманець
        </button>
        <NavLink to="/admin" className={({ isActive }) => `bnav-item${isActive ? " active" : ""}`}>
          <IcShield s={22} /> Адмін
        </NavLink>
      </div>
    </nav>
  );
}
