import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@blog/types": path.resolve(__dirname, "../packages/types/src/index.ts"),
      "@blog/utils": path.resolve(__dirname, "../packages/utils/src/index.ts"),
    },
  },
})

