import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_BASE } from "./api.js";
import {
  IcCart, IcTrash, IcArrowRight, IcFile, IcExternalLink,
  IcBolt, IcCheckCircle,
} from "./Icons.jsx";
import {
  appendPurchasedManuals,
  clearPurchasedManuals,
  loadPurchasedManuals,
} from "./purchasedStorage.js";

function formatPurchasedAt(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("uk-UA", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function Cart({ email, onPaid, showToast }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "mine" ? "mine" : "cart";

  const setTab = useCallback((next) => {
    if (next === "mine") setSearchParams({ tab: "mine" });
    else setSearchParams({});
  }, [setSearchParams]);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [myManuals, setMyManuals] = useState(() => loadPurchasedManuals(email));

  const pathEmail = encodeURIComponent(email);

  const refreshMyManuals = useCallback(() => {
    setMyManuals(loadPurchasedManuals(email));
  }, [email]);

  useEffect(() => { refreshMyManuals(); }, [email, refreshMyManuals]);

  const load = () => {
    setLoading(true);
    fetch(`${API_BASE}/cart/${pathEmail}`)
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setTotal(d.total ?? 0); })
      .catch(() => showToast("Не вдалося завантажити корзину", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [email]);

  const remove = async (cartId) => {
    setRemovingId(cartId);
    try {
      const r = await fetch(`${API_BASE}/cart/${pathEmail}/${cartId}`, { method: "DELETE" });
      if (!r.ok) { showToast("Не вдалося видалити", "error"); return; }
      load();
    } finally { setRemovingId(null); }
  };

  const buy = async () => {
    setBuying(true);
    try {
      const r = await fetch(`${API_BASE}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 400) {
        showToast(d.error === "insufficient balance"
          ? "Недостатньо коштів — поповніть баланс"
          : d.error || "Помилка", "warn");
        return;
      }
      if (!r.ok) { showToast("Помилка покупки", "error"); return; }
      const purchased = d.purchased || [];
      appendPurchasedManuals(email, purchased, "cart");
      refreshMyManuals();
      onPaid();
      load();
      showToast("Оплата успішна! Мануали збережено в «Мої мануали»", "success");
      setTab("mine");
    } finally { setBuying(false); }
  };

  const handleClearMyManuals = () => {
    if (!window.confirm("Очистити весь список куплених мануалів на цьому пристрої?")) return;
    clearPurchasedManuals(email);
    refreshMyManuals();
    showToast("Список очищено", "info");
  };

  const nMine = myManuals.length;
  const nCart = items.length;

  return (
    <main className="page">
      <div className="page-header">
        <h1>Корзина</h1>
        <p>Оформлення замовлення та доступ до куплених мануалів (зберігається в браузері).</p>
      </div>

      <div className="page-tabs" role="tablist" aria-label="Розділи корзини">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cart"}
          className={`page-tab${tab === "cart" ? " active" : ""}`}
          onClick={() => setTab("cart")}
        >
          <IcCart s={16} />
          Корзина
          {nCart > 0 && <span className="page-tab__count">{nCart}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mine"}
          className={`page-tab${tab === "mine" ? " active" : ""}`}
          onClick={() => setTab("mine")}
        >
          <IcCheckCircle s={16} />
          Мої мануали
          {nMine > 0 && <span className="page-tab__count">{nMine}</span>}
        </button>
      </div>

      {tab === "mine" && (
        <section className="my-manuals" aria-labelledby="my-manuals-heading">
          <div className="my-manuals__toolbar">
            <p id="my-manuals-heading">
              Усі покупки з цього браузера для <strong>{email}</strong>. Дані не синхронізуються між пристроями.
            </p>
            {nMine > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleClearMyManuals}>
                <IcTrash s={14} /> Очистити список
              </button>
            )}
          </div>
          {nMine === 0 ? (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <div className="empty-state__icon"><IcFile s={26} /></div>
              <p className="empty-state__title">Поки що порожньо</p>
              <p className="empty-state__sub">
                Після миттєвої покупки або оплати корзини посилання з’являться тут автоматично.
              </p>
              <Link to="/" className="btn btn-primary">
                <IcArrowRight s={15} /> До каталогу
              </Link>
            </div>
          ) : (
            myManuals.map(row => (
              <div key={row.key} className="my-manual-row">
                <div className="my-manual-row__main">
                  <div className="my-manual-row__title">{row.title}</div>
                  <div className="my-manual-row__meta">
                    <span>× {row.quantity}</span>
                    <span>{formatPurchasedAt(row.at)}</span>
                    <span className="my-manual-row__badge">
                      {row.source === "buy_one" ? "Купити зараз" : "Корзина"}
                    </span>
                  </div>
                </div>
                {row.manual_link ? (
                  <a href={row.manual_link} target="_blank" rel="noreferrer" className="receipt__item-link">
                    Відкрити <IcExternalLink s={12} />
                  </a>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--ink3)", flexShrink: 0 }}>немає посилання</span>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {tab === "cart" && (
        <>
          {loading ? (
            <div className="empty-state">
              <span className="spinner spinner--dark spinner--lg" />
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon"><IcCart s={28} /></div>
              <p className="empty-state__title">Корзина порожня</p>
              <p className="empty-state__sub">Перейдіть до каталогу й оберіть мануали.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <Link to="/" className="btn btn-primary">
                  <IcArrowRight s={15} /> До каталогу
                </Link>
                <button type="button" className="btn btn-outline" onClick={() => setTab("mine")}>
                  <IcBolt s={15} /> Мої мануали
                </button>
              </div>
            </div>
          ) : (
            <div className="cart-layout">
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div className="cart-list">
                  <div className="cart-list__head">
                    {items.length} {items.length === 1 ? "позиція" : "позиції"}
                  </div>
                  {items.map(row => (
                    <div key={row.cart_id} className="cart-item">
                      <div className="cart-item__thumb">
                        {row.photo_url ? <img src={row.photo_url} alt="" /> : <IcFile s={22} />}
                      </div>
                      <div className="cart-item__info">
                        <div className="cart-item__name">{row.title}</div>
                        <div className="cart-item__qty">× {row.quantity}</div>
                      </div>
                      <span className="cart-item__price">${Number(row.line_total).toFixed(2)}</span>
                      <button
                        type="button"
                        className="cart-item__del"
                        onClick={() => remove(row.cart_id)}
                        disabled={removingId === row.cart_id}
                        aria-label={`Видалити ${row.title}`}
                      >
                        {removingId === row.cart_id
                          ? <span className="spinner spinner--dark" style={{ width: 14, height: 14 }} />
                          : <IcTrash s={16} />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="cart-summary">
                <div className="cart-summary__head">Разом до оплати</div>
                <div className="cart-summary__body">
                  <div className="cart-summary__row">
                    <span>Товарів</span>
                    <span>{items.reduce((s, i) => s + i.quantity, 0)} шт.</span>
                  </div>
                  <div className="cart-summary__row">
                    <span>Підсумок</span>
                    <span style={{ fontWeight: 600 }}>${Number(total).toFixed(2)}</span>
                  </div>
                  <div className="cart-summary__total">
                    <span>До оплати</span>
                    <span>${Number(total).toFixed(2)}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-full btn-xl"
                    onClick={buy}
                    disabled={buying || items.length === 0}
                  >
                    {buying
                      ? <><span className="spinner" /> Оплата…</>
                      : <><IcArrowRight s={18} /> Оплатити</>
                    }
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
