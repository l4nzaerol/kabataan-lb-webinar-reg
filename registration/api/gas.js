const GAS_URL = process.env.VITE_GAS_WEB_APP_URL || process.env.GAS_WEB_APP_URL

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed.' })
  }

  if (!GAS_URL || GAS_URL.includes('PASTE_YOUR')) {
    return res.status(500).json({
      success: false,
      message:
        'Google Apps Script URL is not configured. In Vercel, go to Project Settings → Environment Variables, add VITE_GAS_WEB_APP_URL with your Apps Script /exec URL, then redeploy.',
    })
  }

  const body =
    typeof req.body === 'string'
      ? req.body
      : req.body && Object.keys(req.body).length > 0
        ? JSON.stringify(req.body)
        : ''

  if (!body) {
    return res.status(400).json({ success: false, message: 'Request body is required.' })
  }

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
    })

    const text = await response.text()
    res.setHeader('Content-Type', 'application/json')
    return res.status(200).send(text)
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: error.message || 'Unable to reach Google Apps Script.',
    })
  }
}
