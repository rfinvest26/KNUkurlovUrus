import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = "http://127.0.0.1:5000";
const p = { target, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/login": p,
      "/topup": p,
      "/manuals": p,
      "/cart": p,
      "/buy": p,
      "/buy_one": p,
      "/admin": p,
      "/report": p,
      "/shop_config": p,
      "/crypto": p,
    },
  },
});
