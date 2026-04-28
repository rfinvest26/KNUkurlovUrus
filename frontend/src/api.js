// Порожній рядок = відносні URL (без :порт). У dev Vite проксує на Flask — див. vite.config.js
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";
