/**
 * Куплені мануали поточного користувача — лише в браузері (localStorage).
 * Ключ прив'язаний до email.
 */
const KEY_PREFIX = "urus_my_manuals_v1:";

export function purchasedStorageKey(email) {
  return KEY_PREFIX + encodeURIComponent(String(email || "").trim());
}

/** @returns {Array<{key:string,manual_id:number,title:string,manual_link:string,quantity:number,source:string,at:string}>} */
export function loadPurchasedManuals(email) {
  if (!email) return [];
  try {
    const raw = localStorage.getItem(purchasedStorageKey(email));
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Додає записи з відповіді API (purchased) на початок списку (нові зверху).
 * @param {string} email
 * @param {Array<{manual_id:number,title?:string,manual_link?:string,quantity?:number}>} purchasedItems
 * @param {"cart"|"buy_one"} source
 */
export function appendPurchasedManuals(email, purchasedItems, source = "cart") {
  if (!email || !Array.isArray(purchasedItems) || purchasedItems.length === 0) {
    return loadPurchasedManuals(email);
  }
  const at = new Date().toISOString();
  const additions = purchasedItems.map((p, idx) => ({
    key: `${at}_${p.manual_id}_${idx}_${Math.random().toString(36).slice(2, 9)}`,
    manual_id: p.manual_id,
    title: p.title ?? `Мануал #${p.manual_id}`,
    manual_link: p.manual_link ?? "",
    quantity: Number(p.quantity) > 0 ? Number(p.quantity) : 1,
    source,
    at,
  }));
  const next = [...additions, ...loadPurchasedManuals(email)];
  try {
    localStorage.setItem(purchasedStorageKey(email), JSON.stringify(next));
  } catch (e) {
    console.error("localStorage write failed", e);
  }
  return next;
}

export function clearPurchasedManuals(email) {
  if (!email) return;
  localStorage.removeItem(purchasedStorageKey(email));
}
