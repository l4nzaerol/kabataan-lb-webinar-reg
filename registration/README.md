# Dunong Webinar Registration

React app for webinar registration, feedback verification, and e-certificate download — connected to Google Sheets via Google Apps Script.

## Quick start

```bash
cd registration
npm install
cp .env.example .env
npm run dev
```

Add your Google Apps Script Web App URL to `.env`:

```
VITE_GAS_WEB_APP_URL=https://script.google.com/macros/s/YOUR_ID/exec
```

## Google Sheets setup

Full step-by-step instructions: [`../google-apps-script/SETUP.md`](../google-apps-script/SETUP.md)

## Flow

1. **Registration** — User registers before the webinar; a unique code is saved in Google Sheets.
2. **Feedback** — After the webinar, user enters their code and submits feedback.
3. **Verification** — Google Apps Script validates the code against the sheet.
4. **E-certificate** — Verified users can download a certificate (Print → Save as PDF).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
