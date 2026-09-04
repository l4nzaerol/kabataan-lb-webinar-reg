import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function gasProxyPlugin(env) {
  function attachProxy(server) {
    server.middlewares.use('/api/gas', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: false, message: 'Method not allowed.' }))
        return
      }

      const gasUrl = env.VITE_GAS_WEB_APP_URL
      if (!gasUrl || gasUrl.includes('PASTE_YOUR')) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            success: false,
            message:
              'Google Apps Script URL is not configured. Add VITE_GAS_WEB_APP_URL to your .env file.',
          }),
        )
        return
      }

      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', async () => {
        try {
          const body = Buffer.concat(chunks).toString()
          const response = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body,
          })
          const text = await response.text()
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
        } catch (error) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              success: false,
              message: error.message || 'Unable to reach Google Apps Script.',
            }),
          )
        }
      })
    })
  }

  return {
    name: 'gas-proxy',
    configureServer: attachProxy,
    configurePreviewServer: attachProxy,
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), gasProxyPlugin(env)],
  }
})
