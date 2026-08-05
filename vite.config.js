import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-grantubos.png', 'favicon.ico'],
      manifest: {
        name: 'GranVendas',
        short_name: 'GranVendas',
        description: 'Plataforma de vendas externas da Grantubos',
        theme_color: '#173D5C',
        background_color: '#173D5C',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes('supabase'),
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-api' }
          }
        ]
      }
    })
  ],
  server: { host: true, port: 5173 }
})
