# KLB Webinar — Complete Setup & Execution Guide

This guide covers one-time setup for the **KABATAANG LINGKOD BAYANI (KLB)** webinar: how to configure the spreadsheet, Google Form, webinar name in `Code.gs`, and the day-by-day steps to run registration and e-certificates.

**Webinar name in code:** `WEBINAR_NAME = 'KLB'` in [`Code.gs`](./Code.gs). Registration codes look like `KLB-YYYYMMDD-XXXXXX`.

---

## How the system works

```text
BEFORE WEBINAR                         AFTER WEBINAR
─────────────────                      ─────────────────
Registration site (Vercel)           Feedback Google Form
        │                                      │
        ▼                                      ▼
   Apps Script API  ◄──────────────  onFormSubmit trigger
        │                                      │
        ▼                                      ▼
   Registrations sheet  ◄──────────  Updates same row by code
        │
        ▼
   Certificate site (Vercel) ──► PDF with name + registration code
```

### Two Google Sheet tabs

| Tab | What it stores |
|-----|----------------|
| **Registrations** | Main database: registration data, feedback status, rating, comments, certificate link |
| **Form Responses 1** (auto-created) | Raw copy of **every** Google Form answer (timestamp + all questions) |

When someone submits feedback, Apps Script finds their row in **Registrations** using the **Registration Code** and copies rating/comments there. The certificate uses the **Full Name** and **Registration Code** already saved from registration.

> **Important:** The name printed on the certificate comes from **registration**, not from the feedback form. The feedback form still asks for Full Name so you have a record and can verify the participant is using the correct code.

---

## Part A — One-time setup (do this first)

### A1. Google Sheet

1. Create a spreadsheet named **KLB Webinar Registrations**.
2. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_PART_IS_THE_ID/edit
   ```

### A2. Google Apps Script

1. In the spreadsheet: **Extensions → Apps Script**.
2. Paste all code from [`Code.gs`](./Code.gs).
3. Set these values at the top of `Code.gs`:
   ```javascript
   const WEBINAR_NAME = 'KLB';
   const SPREADSHEET_ID = 'your-spreadsheet-id-here';
   const GOOGLE_FORM_ID = 'your-google-form-id-here';
   const CERTIFICATE_PAGE_URL = 'https://your-certificate-site.vercel.app';
   ```
   - **WEBINAR_NAME** — short name of this webinar (`KLB`). Used in API messages and as the prefix of registration codes (`KLB-YYYYMMDD-XXXXXX`).
   - **SPREADSHEET_ID** — the middle part of the Google Sheet URL (not the full link).
   - **GOOGLE_FORM_ID** — the middle part of the Google Form URL (`.../forms/d/THIS_PART/viewform`). `GOOGLE_FORM_URL` is built from this automatically.
   - **CERTIFICATE_PAGE_URL** — use the **certificate** Vercel URL (not the registration URL).
4. **Save**.

The script creates a **Registrations** sheet with these columns:

| Timestamp | Registration Code | Full Name | Email | Address | Phone | Feedback Submitted | Feedback Date | Rating | Comments | Certificate Issued | Certificate Link |

### A3. Deploy Apps Script as Web App

1. **Deploy → New deployment** → type **Web app**.
2. **Execute as:** Me  
3. **Who has access:** Anyone  
4. **Deploy** and authorize.
5. Copy the Web App URL (ends with `/exec`).

After any code change: **Deploy → Manage deployments → Edit → New version → Deploy**.

### A4. Deploy two Vercel sites

Create **two projects** from the same repo, root directory `registration`:

| Project | `VITE_APP_MODE` | When to share |
|---------|-----------------|---------------|
| `klb-register` | `register` | Before & during sign-up period |
| `klb-certificate` | `certificate` | After webinar (also set as `CERTIFICATE_PAGE_URL`) |

Both projects need (in Vercel → Settings → Environment Variables):

```
VITE_GAS_WEB_APP_URL=https://script.google.com/macros/s/YOUR_ID/exec
VITE_GOOGLE_FORM_URL=https://docs.google.com/forms/d/1JRrFNtUlLU9_W64G8TjXSnhTxGzGcOiU8ps0EhWilFc/viewform
```

You can also set `GAS_WEB_APP_URL` instead of `VITE_GAS_WEB_APP_URL` — the `/api/gas` serverless function accepts either. Redeploy after adding env vars.

### A5. Feedback Google Form (see Part B below)

Set up the form, link it to the spreadsheet, install the trigger, and set the confirmation message.

---

## Part B — Feedback Google Form setup

Use the existing **KLB Feedback and Evaluation Form**:

**https://docs.google.com/forms/d/1JRrFNtUlLU9_W64G8TjXSnhTxGzGcOiU8ps0EhWilFc/viewform**

This is the same form linked in the app via `VITE_GOOGLE_FORM_URL`. Link it to your registration spreadsheet so **Form Responses 1** and **Registrations** live in one workbook.

### B1. Form questions (order matters for Apps Script)

The KLB form has **63 columns** in **Form Responses 1** (index 0 = Timestamp). When the form is linked to your spreadsheet, Google automatically saves **every answer** to that tab — you do not need extra code for raw storage.

| Index | Column header |
|-------|----------------|
| 0 | Timestamp |
| 1 | Data Privacy Consent |
| 2 | Full Name |
| **3** | **Registration Code** ← used to match Registrations row |
| 4 | Address |
| 5 | Age |
| 6 | Gender |
| 7–10 | Training content & materials (block A) |
| 11–14 | Trainer effectiveness, participation, schedule (block B) |
| 15–18 | Virtual delivery, engagement, responsiveness (block C) |
| 19 | Training environment |
| 20–23 | Presentation quality (relevance, voice, dynamism, expertise) |
| **24** | **5. Overall satisfaction** ← saved to **Registrations → Rating** |
| 25 | Would you recommend the mentor(s)/trainor(s)? |
| 26 | Benefits gained and problems encountered |
| **27** | **Comment and Suggestions** ← saved to **Registrations → Comments** |
| 28 | Venue and facilities |
| 29–51 | Branching sections (in-person / hybrid / repeat blocks) — blank when not shown |
| 54 | Training delivery method |
| 62 | Overall feedback |

These indices are set in `FORM_COL` in [`Code.gs`](./Code.gs). If you reorder form questions, update `FORM_COL` and redeploy.

If you edit the form, keep **Registration Code** as the **4th answer column** (after Timestamp, Consent, Full Name). Do not insert new questions before it without updating `FORM_COL`.

> **Branching forms:** The form uses sections for different delivery methods (virtual, in-person, etc.). Questions that were not shown to a participant appear as **empty cells** in Form Responses 1 — this is normal. All columns still exist in the sheet.

### B2. Link form to the spreadsheet

1. Open the [KLB feedback form](https://docs.google.com/forms/d/1JRrFNtUlLU9_W64G8TjXSnhTxGzGcOiU8ps0EhWilFc/edit).
2. Open the **Responses** tab.
3. Click the green **Sheets** icon (**Link to Sheets**).
4. Select your **KLB Webinar Registrations** spreadsheet (or create a new one and copy its ID into `SPREADSHEET_ID` in `Code.gs`).
5. Google creates a tab like **Form Responses 1** — every submission is stored there with all answers.

### B3. Form confirmation message

1. **Settings** (gear) → **Presentation**.
2. **Confirmation message** → **Custom**. Example:

```
Thank you for your feedback!

Click the link below to open the e-certificate page, then enter your registration code to claim your certificate.
```

3. **Go to a webpage** (required) — point this directly at your **deployed certificate site** (same value as `CERTIFICATE_PAGE_URL`):

```
https://your-certificate-site.vercel.app
```

Participants open that page and enter their **registration code**, then click **Get E-Certificate**. No certificate emails are sent.

> **Why not auto-fill the code?** When 200+ people submit feedback at once, a shared “latest code” redirect can send someone to the wrong certificate. Manual code entry is reliable under concurrent load.

Optional (legacy): you can still use the Apps Script redirect, which now also opens the certificate page without auto-filling a code:

```
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=redirectCertificate
```

### B4. Install the form submit trigger

1. Open **Apps Script** (same project as `Code.gs`).
2. **Triggers** (clock icon) → **Add trigger**.
3. Set:
   - **Function:** `onFormSubmit`
   - **Deployment:** Head
   - **Event source:** From spreadsheet
   - **Event type:** On form submit
4. Save and authorize (spreadsheet access only — Gmail/email permission is **not** required).

### B5. What happens on each form submit

1. Apps Script reads **Registration Code** and **Full Name** from the form.
2. Finds the matching row in **Registrations** by code.
3. If the form name does not match the registered name, it logs a warning (certificate still uses the registered name).
4. Updates **Registrations**: Feedback Submitted = Yes, Feedback Date, Rating, Comments (single batched write).
5. Sets **Certificate Issued** = Yes and saves the **Certificate Link**.
6. Does **not** send email — participants claim from the confirmation link by entering their registration code.
---

## Part C — Webinar execution timeline

### Before the webinar (1–2 weeks ahead)

| Step | Action |
|------|--------|
| 1 | Finish Part A setup (Sheet, Apps Script, Vercel, Form, trigger) |
| 2 | Test registration on the **register** site — confirm a new row appears in **Registrations** |
| 3 | Copy a test registration code from the sheet |
| 4 | Submit a test feedback form with that code + matching full name |
| 5 | Confirm **Registrations** row updates (Feedback Submitted = Yes, Rating, Comments) |
| 6 | Confirm the form confirmation link opens the certificate page; enter the registration code and claim |
| 7 | Share the **registration** Vercel URL on social media, posters, etc. |

### During the webinar

| Step | Action |
|------|--------|
| 1 | Remind attendees to **save their registration code** |
| 2 | Tell them feedback + certificate instructions will come **after** the session |
| 3 | Optionally show the feedback form URL at the end (or wait until after) |

### After the webinar

| Step | Action |
|------|--------|
| 1 | Share the **feedback Google Form** link (`VITE_GOOGLE_FORM_URL`) |
| 2 | Remind participants: they need their **registration code** and **full name** |
| 3 | Tell them to open the **certificate page link** in the form confirmation message, enter their **registration code**, and claim their e-certificate |
| 4 | Monitor **Registrations** sheet: Feedback Submitted, Certificate Issued columns |
| 5 | Check **Form Responses 1** for all raw feedback answers |

### Optional: close registration

- Leave the register site up, or remove/stop sharing it after the webinar starts.
- The certificate site stays available for claim links.

---

## Part D — Local development

```bash
cd registration
cp .env.example .env
```

```env
VITE_GAS_WEB_APP_URL=https://script.google.com/macros/s/YOUR_ID/exec
VITE_GOOGLE_FORM_URL=https://docs.google.com/forms/d/1JRrFNtUlLU9_W64G8TjXSnhTxGzGcOiU8ps0EhWilFc/viewform
VITE_APP_MODE=both
```

```bash
npm install
npm run dev
```

---

## Part E — Customizing form field order

If your first four questions are in a different order, edit `FORM_COL` in `Code.gs`:

```javascript
const FORM_COL = {
  REGISTRATION_CODE: 1,  // index in e.values (0 = timestamp)
  FULL_NAME: 2,
  RATING: 3,
  COMMENTS: 4,
};
```

Extra questions after #4 do not require code changes.

---

## Part F — Troubleshooting

| Problem | Solution |
|--------|----------|
| Registration not saving | Web App access = **Anyone**; check Spreadsheet ID; redeploy new Apps Script version |
| Form submit not updating Registrations | Confirm **onFormSubmit** trigger exists; questions 1–4 are in correct order |
| "Registration code not found" on form | Code must match **Registrations** sheet exactly (case-insensitive) |
| "Feedback has not been submitted yet" on cert page | Submit the Google Form first with your registration code. If you already did, wait 10–30 seconds and retry — the app now auto-retries. Also confirm `onFormSubmit` trigger exists and form is linked to the same spreadsheet |
| Testing on localhost | Works on any device — feedback is stored in Google Sheets, not localStorage. You still need `VITE_GAS_WEB_APP_URL` pointing to your deployed Apps Script |
| Certificate page must be deployed | Yes — set `CERTIFICATE_PAGE_URL` in Apps Script to your **certificate** Vercel URL (not localhost). Form confirmation redirect uses that URL |
| Wrong name on certificate | Name comes from **registration** — edit **Full Name** in Registrations sheet if needed |
| Name mismatch in Apps Script logs | Participant typed a different name in the form; cert still uses registered name |
| Redirect asks for registration code | Expected — enter the code from registration on the certificate page |
| Rating not saved | Use options starting with `5 -`, `4 -`, etc. |
| Extra form answers missing | All answers live in **Form Responses 1** (63 columns). Confirm the form is **Link to Sheets** on the same spreadsheet as `SPREADSHEET_ID`. Only Rating + Comments sync to **Registrations** |
| CORS errors | URL must end with `/exec`; app uses `Content-Type: text/plain` |

---

## Quick reference — what each field is for

| Field | Where collected | Where stored | Used on certificate? |
|-------|-----------------|--------------|----------------------|
| Registration Code | Registration site + Feedback form | Registrations + Form Responses | **Yes** |
| Full Name | Registration site + Feedback form | Registrations + Form Responses | **Yes** (from registration row) |
| Email | Registration site | Registrations | Contact / records only (not used for certificate delivery) |
| Address | Registration site | Registrations | No |
| Phone | Registration site | Registrations | No |
| Rating | Feedback form | Registrations + Form Responses | No |
| Comments | Feedback form | Registrations + Form Responses | No |
| Other feedback questions | Feedback form | Form Responses only | No |
