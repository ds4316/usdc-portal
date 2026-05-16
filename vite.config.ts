import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Exclude global polyfills that conflict with wallet providers (window.ethereum)
      globals: {
        global: false,
      },
      // Only include the Node.js polyfills actually needed
      include: ['buffer', 'process'],
    }),
  ],
})
