import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "./api.js";
import { appendPurchasedManuals } from "./purchasedStorage.js";
import {
  IcSearch, IcCart, IcEye, IcBolt, IcX,
  IcFile, IcFilter, IcTag,
} from "./Icons.jsx";

export default function Home({ email, onPurchased, showToast }) {
  const navigate = useNavigate();
  const [manuals, setManuals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState(null);
  const [buyingId, setBuyingId] = useState(null);
  const [cartLoadingId, setCartLoadingId] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/manuals/categories`)
      .then(r => r.json())
      .then(d => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true); setErr("");
    const q = new URLSearchParams();
    if (search.trim())   q.set("search", search.trim());
    if (category)        q.set("category", category);
    if (minPrice.trim()) q.set("min_price", minPrice.trim());
    if (maxPrice.trim()) q.set("max_price", maxPrice.trim());
    const url = `${API_BASE}/manuals${q.toString() ? `?${q}` : ""}`;
    fetch(url)
      .then(r => r.json())
      .then(data => { if (!cancelled) setManuals(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setErr("Не вдалося завантажити товари"); })
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [search, category, minPrice, maxPrice]);

  const addToCart = async (manualId) => {
    setCartLoadingId(manualId);
    try {
      const r = await fetch(`${API_BASE}/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, manual_id: manualId, quantity: 1 }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        showToast(d.error || "Помилка", "error"); return;
      }
      showToast("Додано до корзини", "success");
    } finally { setCartLoadingId(null); }
  };

  const buyNow = async (manualId) => {
    setBuyingId(manualId);
    try {
      const r = await fetch(`${API_BASE}/buy_one`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, manual_id: manualId, quantity: 1 }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 400 && d.error === "insufficient balance") {
        showToast("Недостатньо коштів — поповніть баланс", "warn"); return;
      }
      if (!r.ok) { showToast(d.error || "Помилка покупки", "error"); return; }
      appendPurchasedManuals(email, d.purchased || [], "buy_one");
      setDetail(null);
      onPurchased?.();
      showToast("Куплено! Відкрито «Мої мануали» в корзині", "success");
      navigate("/cart?tab=mine");
    } finally { setBuyingId(null); }
  };

  const clearFilters = () => { setSearch(""); setCategory(""); setMinPrice(""); setMaxPrice(""); };
  const hasFilters = search || category || minPrice || maxPrice;

  return (
    <main className="page">
      <div className="page-header">
        <h1>Каталог мануалів</h1>
        <p>Технічна документація — оберіть, ознайомтесь та придбайте.</p>
      </div>

      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <div className="filter-field filter-field--wide">
          <label htmlFor="flt-search">Пошук</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink3)", pointerEvents: "none", display: "flex" }}>
              <IcSearch s={16} />
            </span>
            <input
              id="flt-search"
              className="input"
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Назва або опис…"
              style={{ paddingLeft: 34 }}
            />
          </div>
        </div>
        <div className="filter-field">
          <label htmlFor="flt-cat">Категорія</label>
          <select id="flt-cat" className="input" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Усі</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="filter-field filter-field--sm">
          <label htmlFor="flt-min">Від ($)</label>
          <input id="flt-min" className="input" type="number" min="0" step="0.01" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="0" />
        </div>
        <div className="filter-field filter-field--sm">
          <label htmlFor="flt-max">До ($)</label>
          <input id="flt-max" className="input" type="number" min="0" step="0.01" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="∞" />
        </div>
        {hasFilters && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ marginTop: "auto" }}>
            <IcX s={13} /> Скинути
          </button>
        )}
      </div>

      {err && (
        <div className="alert alert--error" style={{ marginBottom: 20 }}>
          {err}
        </div>
      )}

      {/* ── Grid ── */}
      {loadingList ? (
        <div className="empty-state">
          <span className="spinner spinner--dark spinner--lg" />
          <span style={{ color: "var(--ink2)", fontSize: 14 }}>Завантаження…</span>
        </div>
      ) : manuals.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon"><IcFilter s={28} /></div>
          <p className="empty-state__title">Нічого не знайдено</p>
          <p className="empty-state__sub">Спробуйте змінити фільтри або очистіть пошук.</p>
          {hasFilters && (
            <button type="button" className="btn btn-outline" onClick={clearFilters}>
              <IcX s={15} /> Скинути фільтри
            </button>
          )}
        </div>
      ) : (
        <div className="product-grid">
          {manuals.map(m => (
            <article key={m.id} className="card">
              <div
                className="card__media"
                onClick={() => setDetail(m)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetail(m); } }}
                aria-label={`Переглянути ${m.title}`}
              >
                {m.photo_url
                  ? <img src={m.photo_url} alt="" loading="lazy" />
                  : <div className="card__media-empty"><IcFile s={36} /></div>
                }
                <div className="card__overlay">
                  <IcEye s={16} /> Переглянути
                </div>
              </div>

              <div className="card__body">
                {m.category && (
                  <span className="card__badge">
                    <IcTag s={9} /> {m.category}
                  </span>
                )}
                <h2 className="card__title">{m.title}</h2>
                {m.description && <p className="card__desc">{m.description}</p>}
                <p className="card__price">${Number(m.price).toFixed(2)}</p>
                <div className="card__actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(m)}>
                    <IcEye s={14} /> Деталі
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => addToCart(m.id)}
                    disabled={cartLoadingId === m.id}
                  >
                    {cartLoadingId === m.id ? <span className="spinner" /> : <IcCart s={14} />}
                    В корзину
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ── Detail modal ── */}
      {detail && (
        <div
          className="modal-backdrop"
          onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}
          role="presentation"
        >
          <div
            className={`modal${!detail.photo_url ? " modal--no-hero" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={detail.title}
          >
            {/* Hero image */}
            {detail.photo_url ? (
              <div className="modal__hero">
                <img src={detail.photo_url} alt="" />
                <button type="button" className="modal__close" onClick={() => setDetail(null)} aria-label="Закрити">
                  <IcX s={16} />
                </button>
              </div>
            ) : (
              <button type="button" className="modal__close" onClick={() => setDetail(null)} aria-label="Закрити">
                <IcX s={16} />
              </button>
            )}

            {/* Scrollable body */}
            <div className="modal__scroll">
              <div className="modal__meta">
                <h2 className="modal__title">{detail.title}</h2>
                <span className="modal__price">${Number(detail.price).toFixed(2)}</span>
              </div>
              {detail.category && (
                <span className="badge badge--accent" style={{ marginBottom: 12, display: "inline-flex" }}>
                  <IcTag s={10} /> {detail.category}
                </span>
              )}
              <div className="modal__hint">
                <IcFile s={14} style={{ flexShrink: 0 }} />
                Посилання на файл надається автоматично після оплати.
              </div>
              {detail.description && (
                <p className="modal__desc">{detail.description}</p>
              )}
            </div>

            {/* Footer actions */}
            <div className="modal__footer">
              <button type="button" className="btn btn-ghost" onClick={() => setDetail(null)}>
                Закрити
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => { addToCart(detail.id); setDetail(null); }}
                disabled={cartLoadingId === detail.id}
              >
                {cartLoadingId === detail.id ? <span className="spinner spinner--dark" /> : <IcCart s={15} />}
                До корзини
              </button>
              <button
                type="button"
                className="btn btn-green"
                onClick={() => buyNow(detail.id)}
                disabled={buyingId === detail.id}
                style={{ flex: 1 }}
              >
                {buyingId === detail.id
                  ? <><span className="spinner" /> Оплата…</>
                  : <><IcBolt s={15} /> Купити зараз</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
