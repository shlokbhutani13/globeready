import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'local-user' && command === 'build') {
    throw new Error('Local-user mode is for development only. Run "npm run local-user", not a production build.')
  }
  if (mode === 'zero-cost-public') {
    const forbidden = ['VITE_API_URL', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_LOCAL_USER_MODE', 'VITE_DEMO_MODE']
      .filter((name) => env[name] && env[name] !== 'false')
    if (env.VITE_DOCUMENT_UPLOADS_ENABLED === 'true') forbidden.push('VITE_DOCUMENT_UPLOADS_ENABLED')
    if (forbidden.length) throw new Error(`zero-cost-public cannot use ${forbidden.join(', ')}.`)
  }
  return {
    plugins: [react()],
    // Build-time switch for the local emulator wiring. It is false in every build that is not local-user, so the
    // emulator addresses are removed from production bundles rather than only guarded at runtime.
    define: {
      __GLOBEREADY_LOCAL_USER__: JSON.stringify(mode === 'local-user'),
      __GLOBEREADY_ZERO_COST_PUBLIC__: JSON.stringify(mode === 'zero-cost-public'),
      'import.meta.env.VITE_ZERO_COST_PUBLIC': JSON.stringify(mode === 'zero-cost-public'),
    },
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
