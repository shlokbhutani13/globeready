import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode, command }) => {
  if (mode === 'local-user' && command === 'build') {
    throw new Error('Local-user mode is for development only. Run "npm run local-user", not a production build.')
  }
  return {
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase")) {
              return "firebase";
            }
            if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) {
              return "react";
            }
            if (id.includes("node_modules/lucide-react")) {
              return "icons";
            }
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
    },
  }
})
