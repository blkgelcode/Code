import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = `http://localhost:${process.env.PORT || 5175}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": target,
      "/thumb": target,
      "/preview": target,
      "/exports": target,
      "/ws": { target: target.replace("http", "ws"), ws: true },
    },
  },
});
