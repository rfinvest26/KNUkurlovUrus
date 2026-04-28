import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { API_BASE } from "./api.js";
import Navbar from "./Navbar.jsx";
import Home from "./Home.jsx";
import Cart from "./Cart.jsx";
import Admin from "./Admin.jsx";
import { IcFile, IcWarning, IcUser } from "./Icons.jsx";

/* ─── Toast ─────────────────────────────────── */
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const show = useCallback((msg, type = "info") => {
    const id = ++nextId.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3400);
  }, []);
  return { toasts, show };
}

function ToastStack({ toasts }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}

/* ─── Login ─────────────────────────────────── */
function LoginScreen({ onLogin }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const em = input.trim();
    if (!em) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      localStorage.setItem("email", d.email);
      onLogin(d);
    } catch {
      setErr("Не вдалося підключитися до сервера. Перевірте, чи запущений бекенд.");
    } finally { setBusy(false); }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__hero">
          <div className="login-card__logo">
            <div className="login-card__logo-icon">
              <IcFile s={22} />
            </div>
            Мануали
          </div>
          <p className="login-card__sub">Технічна документація для вашого авто</p>
        </div>
        <div className="login-card__body">
          <p className="login-card__title">Вхід до облікового запису</p>
          {err && (
            <div className="alert alert--error" style={{ marginBottom: 16 }}>
              <IcWarning s={16} style={{ flexShrink: 0, marginTop: 1 }} />
              {err}
            </div>
          )}
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="form-group">
              <label htmlFor="login-email">Email адреса</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink3)", pointerEvents: "none", display: "flex" }}>
                  <IcUser s={16} />
                </span>
                <input
                  id="login-email"
                  className="input"
                  type="email"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="your@email.com"
                  style={{ paddingLeft: 36 }}
                  autoFocus
                  required
                />
              </div>
              <span className="hint" style={{ fontSize: 12, color: "var(--ink3)" }}>
                Новий email → автоматична реєстрація
              </span>
            </div>
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>
              {busy ? <><span className="spinner" /> Вхід…</> : "Увійти"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ─── App ────────────────────────────────────── */
export default function App() {
  const [email, setEmail] = useState(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toasts, show: showToast } = useToast();

  const refreshUser = useCallback(async (em) => {
    const r = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: em }),
    });
    if (!r.ok) throw new Error();
    const d = await r.json();
    setEmail(d.email);
    setBalance(d.balance);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("email");
    if (!saved) { setLoading(false); return; }
    refreshUser(saved)
      .catch(() => { localStorage.removeItem("email"); })
      .finally(() => setLoading(false));
  }, [refreshUser]);

  if (loading) {
    return (
      <div className="app loading-screen">
        <span className="spinner spinner--dark spinner--lg" />
        <span>Завантаження…</span>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="app">
        <LoginScreen onLogin={d => { setEmail(d.email); setBalance(d.balance); }} />
        <ToastStack toasts={toasts} />
      </div>
    );
  }

  const onRefreshBalance = () => refreshUser(email).catch(() => {});

  return (
    <BrowserRouter>
      <div className="app">
        <Navbar email={email} balance={balance} onRefreshBalance={onRefreshBalance} showToast={showToast} />
        <Routes>
          <Route path="/" element={<Home email={email} onPurchased={onRefreshBalance} showToast={showToast} />} />
          <Route path="/cart" element={<Cart email={email} onPaid={onRefreshBalance} showToast={showToast} />} />
          <Route path="/admin" element={<Admin showToast={showToast} />} />
        </Routes>
        <ToastStack toasts={toasts} />
      </div>
    </BrowserRouter>
  );
}
