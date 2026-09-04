// Display name used in API messages and registration codes (KLB-YYYYMMDD-XXXXXX).
const WEBINAR_NAME = 'KLB';

// Spreadsheet linked to the KLB Feedback Google Form (Responses → Link to Sheets).
// From: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
const SPREADSHEET_ID = '1L-uVPGSym1OysehKaCg9vO1u-QpCl0RXj5kJu812aSs';
const SHEET_NAME = 'Registrations';

// KLB Feedback and Evaluation Form
// From: https://docs.google.com/forms/d/GOOGLE_FORM_ID/viewform
const GOOGLE_FORM_ID = '1JRrFNtUlLU9_W64G8TjXSnhTxGzGcOiU8ps0EhWilFc';
const GOOGLE_FORM_URL =
  'https://docs.google.com/forms/d/' + GOOGLE_FORM_ID + '/viewform';

// E-certificate page URL shown in Google Form confirmation (no trailing slash).
// Example: https://your-site.vercel.app
const CERTIFICATE_PAGE_URL = 'PASTE_YOUR_DEPLOYED_APP_URL_HERE';

// Form Responses column indices (0 = Timestamp). Matches KLB feedback form headers.
// Full form has 63 columns (0–62). Google Forms writes every answer to Form Responses 1
// when the form is linked to the spreadsheet; indices below are for Apps Script lookups.
const FORM_COL = {
  CONSENT: 1,
  FULL_NAME: 2,
  REGISTRATION_CODE: 3,
  ADDRESS: 4,
  AGE: 5,
  GENDER: 6,
  // Block A — general training (cols 7–10)
  CONTENT_RELEVANCE_A: 7,
  MATERIALS_ENGAGING_A: 8,
  TRAINER_EFFECTIVE_A: 9,
  TRAINER_EXPERTISE_A: 10,
  // Block B — trainer & schedule (cols 11–14)
  TRAINER_EFFECTIVE_B: 11,
  TRAINER_EXPERTISE_B: 12,
  TRAINER_PARTICIPATION: 13,
  SCHEDULE_PACE: 14,
  // Block C — virtual delivery (cols 15–18)
  VIRTUAL_DELIVERY: 15,
  VIRTUAL_ENGAGEMENT: 16,
  RESPONSIVENESS: 17,
  HANDLING_ISSUES: 18,
  // Block D — environment & presentation (cols 19–24)
  TRAINING_ENVIRONMENT: 19,
  PRESENTATION_RELEVANCE: 20,
  VOICE_QUALITY: 21,
  DYNAMISM: 22,
  PRESENTER_EXPERTISE: 23,
  OVERALL_SATISFACTION: 24,
  RECOMMEND_MENTOR: 25,
  BENEFITS_PROBLEMS: 26,
  COMMENTS: 27,
  VENUE_FACILITIES: 28,
  // Branching sections repeat similar questions (cols 29–51) — only the answered
  // branch has values; others stay blank in Form Responses 1.
  TRAINING_DELIVERY_METHOD: 54,
  OVERALL_FEEDBACK: 62,
  // Aliases used when saving to Registrations sheet
  RATING: 24,
};

const FORM_RESPONSE_COLUMN_COUNT = 63;

// Performance tuning for webinar traffic spikes (200–250 concurrent users).
const CACHE_TTL_SEC = 45;
const WRITE_LOCK_TIMEOUT_MS = 12000;
const WRITE_LOCK_ATTEMPTS = 5;

const HEADERS = [
  'Timestamp',
  'Registration Code',
  'Full Name',
  'Email',
  'Address',
  'Phone',
  'Feedback Submitted',
  'Feedback Date',
  'Rating',
  'Comments',
  'Certificate Issued',
  'Certificate Link',
];

const COL = {
  TIMESTAMP: 1,
  CODE: 2,
  FULL_NAME: 3,
  EMAIL: 4,
  ADDRESS: 5,
  PHONE: 6,
  FEEDBACK_SUBMITTED: 7,
  FEEDBACK_DATE: 8,
  RATING: 9,
  COMMENTS: 10,
  CERTIFICATE_ISSUED: 11,
  CERTIFICATE_LINK: 12,
};

function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : '';

  if (action === 'verify') {
    return jsonResponse(verifyRegistrationCode_(e.parameter.code || ''));
  }

  if (action === 'redirectCertificate') {
    // Prefer an explicit code when present. Otherwise send everyone to the
    // certificate page so they can enter their own registration code.
    // (Avoids shared "latest code" races when many people submit at once.)
    const code = e.parameter.code || '';
    if (code) {
      return redirectToCertificate_(code);
    }
    return redirectToCertificatePage_();
  }

  if (action === 'latestCertCode') {
    return jsonResponse({
      success: false,
      code: '',
      message:
        'Open the certificate page and enter your registration code to claim your e-certificate.',
    });
  }

  return jsonResponse({
    success: true,
    message: WEBINAR_NAME + ' Webinar API is running.',
  });
}

function doPost(e) {
  let data;

  try {
    data = JSON.parse(e.postData.contents);
  } catch (parseError) {
    return jsonResponse({
      success: false,
      message: 'Invalid request body.',
    });
  }

  const action = data.action;

  try {
    let result;

    switch (action) {
      case 'register':
        result = withWriteLock_(function () {
          return registerParticipant_(data);
        });
        break;
      case 'verify':
        result = verifyRegistrationCode_(data.code);
        break;
      case 'submitFeedback':
        result = withWriteLock_(function () {
          return submitFeedback_(data);
        });
        break;
      case 'issueCertificate':
        // Lock only when a sheet write is required (fast path is read-only).
        result = issueCertificate_(data.code);
        break;
      case 'checkCertificateStatus':
        result = checkCertificateStatus_(data.code);
        break;
      default:
        result = { success: false, message: 'Unknown action.' };
    }

    return jsonResponse(result);
  } catch (error) {
    if (error.message === 'BUSY') {
      return jsonResponse({
        success: false,
        retryable: true,
        message:
          'The server is busy handling many requests. Please wait a moment — your request will retry automatically.',
      });
    }

    return jsonResponse({
      success: false,
      message: error.message || 'Server error.',
    });
  }
}

function withWriteLock_(callback) {
  const lock = LockService.getScriptLock();

  for (let attempt = 0; attempt < WRITE_LOCK_ATTEMPTS; attempt++) {
    if (lock.tryLock(WRITE_LOCK_TIMEOUT_MS)) {
      try {
        return callback();
      } finally {
        lock.releaseLock();
      }
    }

    if (attempt < WRITE_LOCK_ATTEMPTS - 1) {
      Utilities.sleep(250 + attempt * 350);
    }
  }

  throw new Error('BUSY');
}

function invalidateRegistrationCache_() {
  const cache = CacheService.getScriptCache();
  cache.remove('regData');
  cache.remove('regCodes');
}

function getRegistrationRows_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('regData');

  if (cached) {
    return JSON.parse(cached);
  }

  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  cache.put('regData', JSON.stringify(values), CACHE_TTL_SEC);

  return values;
}

function getKnownRegistrationCodes_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('regCodes');

  if (cached) {
    return JSON.parse(cached);
  }

  const rows = getRegistrationRows_();
  const codes = {};

  for (let i = 0; i < rows.length; i++) {
    const code = String(rows[i][COL.CODE - 1] || '')
      .trim()
      .toUpperCase();

    if (code) {
      codes[code] = true;
    }
  }

  cache.put('regCodes', JSON.stringify(codes), CACHE_TTL_SEC);

  return codes;
}

function registerParticipant_(data) {
  const fullName = String(data.fullName || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const address = String(data.address || data.organization || '').trim();
  const phone = String(data.phone || '').trim();

  if (!fullName || !email || !address) {
    return { success: false, message: 'Full name, email, and address are required.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: 'Invalid email address.' };
  }

  const sheet = getSheet_();
  const registrationCode = generateUniqueCode_();

  sheet.appendRow([
    new Date(),
    registrationCode,
    fullName,
    email,
    address,
    phone,
    'No',
    '',
    '',
    '',
    'No',
    '',
  ]);

  invalidateRegistrationCache_();

  return {
    success: true,
    registrationCode: registrationCode,
    fullName: fullName,
    email: email,
    address: address,
    phone: phone,
  };
}

function verifyRegistrationCode_(code) {
  const registrationCode = String(code || '').trim().toUpperCase();

  if (!registrationCode) {
    return { success: false, valid: false, message: 'Registration code is required.' };
  }

  const row = findRowByCode_(registrationCode);

  if (!row) {
    return {
      success: true,
      valid: false,
      message: 'Registration code not found. Please check and try again.',
    };
  }

  return {
    success: true,
    valid: true,
    registrationCode: row.values[COL.CODE - 1],
    fullName: row.values[COL.FULL_NAME - 1],
    email: row.values[COL.EMAIL - 1],
    address: row.values[COL.ADDRESS - 1],
    feedbackSubmitted: String(row.values[COL.FEEDBACK_SUBMITTED - 1]).toLowerCase() === 'yes',
    certificateIssued: String(row.values[COL.CERTIFICATE_ISSUED - 1]).toLowerCase() === 'yes',
  };
}

function buildCertificateUrl_(registrationCode, autoDownload) {
  if (!CERTIFICATE_PAGE_URL || CERTIFICATE_PAGE_URL.indexOf('PASTE_YOUR') !== -1) {
    return '';
  }

  const base = CERTIFICATE_PAGE_URL.replace(/\/$/, '');

  if (!registrationCode) {
    return base;
  }

  const url = base + '/?code=' + encodeURIComponent(registrationCode);

  if (autoDownload) {
    return url + '&download=1';
  }

  return url;
}

function redirectToCertificatePage_() {
  const certUrl = buildCertificateUrl_('', false);

  if (!certUrl) {
    return HtmlService.createHtmlOutput(
      '<p>Certificate page URL is not configured in Apps Script.</p>'
    );
  }

  const safeUrl = certUrl.replace(/"/g, '&quot;');

  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head>' +
      '<meta charset="utf-8">' +
      '<meta http-equiv="refresh" content="0;url=' +
      safeUrl +
      '">' +
      '<title>Claim your e-certificate</title>' +
      '</head><body>' +
      '<p>Opening the e-certificate page...</p>' +
      '<p>Enter your registration code on the next page to claim your certificate.</p>' +
      '<p>If you are not redirected, <a href="' +
      safeUrl +
      '">click here</a>.</p>' +
      '<script>window.location.replace("' +
      safeUrl +
      '");</script>' +
      '</body></html>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function redirectToCertificate_(code) {
  const registrationCode = String(code || '').trim().toUpperCase();
  const certUrl = buildCertificateUrl_(registrationCode, false);

  if (!certUrl) {
    return HtmlService.createHtmlOutput(
      '<p>Certificate page URL is not configured in Apps Script.</p>'
    );
  }

  const safeUrl = certUrl.replace(/"/g, '&quot;');

  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head>' +
      '<meta charset="utf-8">' +
      '<meta http-equiv="refresh" content="0;url=' +
      safeUrl +
      '">' +
      '<title>Redirecting to your e-certificate</title>' +
      '</head><body>' +
      '<p>Redirecting to your e-certificate...</p>' +
      '<p>If you are not redirected, <a href="' +
      safeUrl +
      '">click here</a>.</p>' +
      '<script>window.location.replace("' +
      safeUrl +
      '");</script>' +
      '</body></html>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function buildCertificatePreview_(row) {
  const registrationCode = String(row.values[COL.CODE - 1] || '')
    .trim()
    .toUpperCase();
  const fullName = String(row.values[COL.FULL_NAME - 1] || '').trim();

  return {
    success: true,
    registrationCode: registrationCode,
    fullName: fullName,
    certificateUrl: buildCertificateUrl_(registrationCode, false),
    message: 'Your e-certificate is ready. You can download it below.',
  };
}

function checkCertificateStatus_(code) {
  const registrationCode = String(code || '').trim().toUpperCase();

  if (!registrationCode) {
    return { success: false, valid: false, message: 'Registration code is required.' };
  }

  // Prefer cache for high concurrent claim traffic; fall back to a live read
  // when the cache still shows feedback as pending.
  let row = findRowByCode_(registrationCode);

  if (!row) {
    row = findRowByCode_(registrationCode, { live: true });
  }

  if (!row) {
    return {
      success: true,
      valid: false,
      message: 'Registration code not found. Please check and try again.',
    };
  }

  const fullName = String(row.values[COL.FULL_NAME - 1] || '').trim();
  const codeValue = String(row.values[COL.CODE - 1] || '').trim().toUpperCase();
  let feedbackSubmitted =
    String(row.values[COL.FEEDBACK_SUBMITTED - 1]).toLowerCase() === 'yes';

  if (!feedbackSubmitted) {
    const liveRow = findRowByCode_(registrationCode, { live: true });
    if (liveRow) {
      row = liveRow;
      feedbackSubmitted =
        String(row.values[COL.FEEDBACK_SUBMITTED - 1]).toLowerCase() === 'yes';
    }
  }

  if (feedbackSubmitted) {
    const preview = buildCertificatePreview_(row);
    return {
      success: true,
      valid: true,
      ready: true,
      feedbackSubmitted: true,
      pendingFeedback: false,
      registrationCode: codeValue,
      fullName: fullName,
      certificatePreview: preview,
    };
  }

  const formRow = findFormResponseRow_(registrationCode);

  if (!formRow) {
    return {
      success: true,
      valid: true,
      ready: false,
      feedbackSubmitted: false,
      feedbackRequired: true,
      pendingFeedback: false,
      registrationCode: codeValue,
      fullName: fullName,
      message:
        'You need to submit the feedback Google Form before claiming your e-certificate.',
    };
  }

  try {
    const synced = withWriteLock_(function () {
      return syncFeedbackFromFormResponses_(registrationCode);
    });

    if (synced) {
      const refreshed = findRowByCode_(registrationCode, { live: true }) || row;
      const preview = buildCertificatePreview_(refreshed);
      return {
        success: true,
        valid: true,
        ready: true,
        feedbackSubmitted: true,
        pendingFeedback: false,
        registrationCode: codeValue,
        fullName: fullName,
        certificatePreview: preview,
      };
    }
  } catch (error) {
    if (error.message === 'BUSY') {
      return {
        success: true,
        valid: true,
        ready: false,
        feedbackSubmitted: false,
        feedbackRequired: true,
        pendingFeedback: true,
        retryable: true,
        registrationCode: codeValue,
        fullName: fullName,
        message:
          'Your feedback was received and is still being processed. Please wait a moment and try again.',
      };
    }
    throw error;
  }

  return {
    success: true,
    valid: true,
    ready: false,
    feedbackSubmitted: false,
    feedbackRequired: true,
    pendingFeedback: true,
    registrationCode: codeValue,
    fullName: fullName,
    message:
      'Your feedback was received and is still being processed. Please wait a moment and try again.',
  };
}

function issueCertificate_(code) {
  const registrationCode = String(code || '').trim().toUpperCase();

  if (!registrationCode) {
    return { success: false, message: 'Registration code is required.' };
  }

  let row = findRowByCode_(registrationCode) || findRowByCode_(registrationCode, { live: true });

  if (!row) {
    return {
      success: false,
      message: 'Registration code not found. Only registered participants can receive a certificate.',
    };
  }

  let feedbackSubmitted =
    String(row.values[COL.FEEDBACK_SUBMITTED - 1]).toLowerCase() === 'yes';
  let alreadyIssued =
    String(row.values[COL.CERTIFICATE_ISSUED - 1]).toLowerCase() === 'yes';

  // Fast path: already eligible — return cert data without blocking on a write.
  if (feedbackSubmitted) {
    if (!alreadyIssued) {
      try {
        withWriteLock_(function () {
          const lockedRow = findRowByCode_(registrationCode, { live: true });
          if (
            lockedRow &&
            String(lockedRow.values[COL.CERTIFICATE_ISSUED - 1]).toLowerCase() !== 'yes'
          ) {
            getSheet_()
              .getRange(lockedRow.rowNumber, COL.CERTIFICATE_ISSUED)
              .setValue('Yes');
            invalidateRegistrationCache_();
          }
        });
      } catch (error) {
        // Under heavy claim traffic, still serve the certificate even if the
        // "Certificate Issued" flag write has to wait for a later request.
        if (error.message !== 'BUSY') {
          throw error;
        }
      }
    }

    return {
      success: true,
      registrationCode: String(row.values[COL.CODE - 1] || '')
        .trim()
        .toUpperCase(),
      fullName: String(row.values[COL.FULL_NAME - 1] || '').trim(),
      certificateUrl: buildCertificateUrl_(row.values[COL.CODE - 1], false),
      message: alreadyIssued
        ? 'Your e-certificate is ready. You can download it again below.'
        : 'Your e-certificate is ready. You can download it below.',
    };
  }

  // Slow path: sync feedback from Form Responses, then issue.
  return withWriteLock_(function () {
    row = findRowByCode_(registrationCode, { live: true });

    if (!row) {
      return {
        success: false,
        message:
          'Registration code not found. Only registered participants can receive a certificate.',
      };
    }

    feedbackSubmitted =
      String(row.values[COL.FEEDBACK_SUBMITTED - 1]).toLowerCase() === 'yes';

    if (!feedbackSubmitted && syncFeedbackFromFormResponses_(registrationCode)) {
      row = findRowByCode_(registrationCode, { live: true });
      feedbackSubmitted =
        row && String(row.values[COL.FEEDBACK_SUBMITTED - 1]).toLowerCase() === 'yes';
    }

    if (!feedbackSubmitted) {
      return {
        success: false,
        feedbackRequired: true,
        pendingFeedback: hasFormResponseForCode_(registrationCode),
        message:
          'You need to submit the feedback Google Form before claiming your e-certificate.',
      };
    }

    alreadyIssued =
      String(row.values[COL.CERTIFICATE_ISSUED - 1]).toLowerCase() === 'yes';

    if (!alreadyIssued) {
      getSheet_().getRange(row.rowNumber, COL.CERTIFICATE_ISSUED).setValue('Yes');
      invalidateRegistrationCache_();
    }

    return {
      success: true,
      registrationCode: String(row.values[COL.CODE - 1] || '')
        .trim()
        .toUpperCase(),
      fullName: String(row.values[COL.FULL_NAME - 1] || '').trim(),
      certificateUrl: buildCertificateUrl_(row.values[COL.CODE - 1], false),
      message: alreadyIssued
        ? 'Your e-certificate is ready. You can download it again below.'
        : 'Your e-certificate is ready. You can download it below.',
    };
  });
}

/**
 * Installable trigger: Run when a Google Form response is submitted.
 * In Apps Script: Triggers → Add trigger → onFormSubmit → From spreadsheet → On form submit.
 *
 * No emails are sent. Participants claim certificates from the confirmation link
 * by entering their registration code on the certificate page.
 *
 * KLB form column order (after Timestamp):
 * Consent, Full Name, Registration Code, Address, Age, Gender, rating blocks,
 * Overall satisfaction (col 24), Recommend mentor (25), Benefits (26),
 * Comment and Suggestions (27), branching sections (29–51),
 * Training delivery method (54), Overall feedback (62).
 * Google Forms stores every answer in Form Responses 1; see FORM_COL for indices.
 */
function onFormSubmit(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(8000);

    const responses = e.values;
    const registrationCode = String(responses[FORM_COL.REGISTRATION_CODE] || '')
      .trim()
      .toUpperCase();
    const formFullName = String(responses[FORM_COL.FULL_NAME] || '').trim();

    if (responses.length < FORM_RESPONSE_COLUMN_COUNT) {
      Logger.log(
        'Form submit: expected at least ' +
          FORM_RESPONSE_COLUMN_COUNT +
          ' columns, got ' +
          responses.length +
          '. Check that the form is linked to this spreadsheet.'
      );
    }

    if (!registrationCode) {
      Logger.log('Form submit skipped: missing registration code.');
      return;
    }

    const row = findRowByCode_(registrationCode, { live: true });

    if (!row) {
      Logger.log('Form submit: registration code not found — ' + registrationCode);
      return;
    }

    const registeredName = String(row.values[COL.FULL_NAME - 1]).trim();
    if (formFullName && normalizeName_(formFullName) !== normalizeName_(registeredName)) {
      Logger.log(
        'Name mismatch for ' +
          registrationCode +
          ': form="' +
          formFullName +
          '" registered="' +
          registeredName +
          '"'
      );
    }

    const alreadySubmitted =
      String(row.values[COL.FEEDBACK_SUBMITTED - 1]).toLowerCase() === 'yes';

    if (!alreadySubmitted) {
      applyFeedbackToRegistration_(registrationCode, responses);
    } else {
      const certUrl = buildCertificateUrl_(registrationCode, false);
      if (certUrl) {
        getSheet_().getRange(row.rowNumber, COL.CERTIFICATE_LINK).setValue(certUrl);
      }
    }
  } catch (error) {
    Logger.log('onFormSubmit error: ' + error.message);
  } finally {
    lock.releaseLock();
  }
}

function normalizeName_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseRating_(value) {
  const text = String(value || '').trim();
  const leadingNumber = text.match(/^(\d)/);

  if (leadingNumber) {
    const rating = Number(leadingNumber[1]);
    if (rating >= 1 && rating <= 5) {
      return rating;
    }
  }

  return '';
}

function extractCommentsFromFormRow_(formRow) {
  const suggestions = String(formRow[FORM_COL.COMMENTS] || '').trim();
  const benefits = String(formRow[FORM_COL.BENEFITS_PROBLEMS] || '').trim();
  const overallFeedback = String(formRow[FORM_COL.OVERALL_FEEDBACK] || '').trim();

  const parts = [];

  if (benefits) {
    parts.push('Benefits/Problems: ' + benefits);
  }

  if (suggestions) {
    parts.push('Suggestions: ' + suggestions);
  }

  if (!suggestions && !benefits && overallFeedback) {
    parts.push(overallFeedback);
  }

  return parts.join('\n\n');
}

function getFormResponseColumnCount_(formSheet) {
  if (!formSheet) {
    return FORM_RESPONSE_COLUMN_COUNT;
  }

  return Math.max(formSheet.getLastColumn(), FORM_RESPONSE_COLUMN_COUNT);
}

function submitFeedback_(data) {
  const registrationCode = String(data.code || '').trim().toUpperCase();
  const rating = Number(data.rating);
  const comments = String(data.comments || '').trim();

  if (!registrationCode) {
    return { success: false, message: 'Registration code is required.' };
  }

  if (!rating || rating < 1 || rating > 5) {
    return { success: false, message: 'Please select a rating from 1 to 5.' };
  }

  if (!comments) {
    return { success: false, message: 'Please enter your feedback comments.' };
  }

  const row = findRowByCode_(registrationCode, { live: true });

  if (!row) {
    return {
      success: false,
      message: 'Registration code not found. Only registered participants can submit feedback.',
    };
  }

  const alreadySubmitted =
    String(row.values[COL.FEEDBACK_SUBMITTED - 1]).toLowerCase() === 'yes';

  if (!alreadySubmitted) {
    const sheet = getSheet_();
    const certUrl = buildCertificateUrl_(registrationCode, false);
    sheet
      .getRange(row.rowNumber, COL.FEEDBACK_SUBMITTED, 1, 6)
      .setValues([['Yes', new Date(), rating, comments, 'Yes', certUrl || '']]);
    invalidateRegistrationCache_();
  }

  return {
    success: true,
    registrationCode: row.values[COL.CODE - 1],
    fullName: row.values[COL.FULL_NAME - 1],
    email: row.values[COL.EMAIL - 1],
    address: row.values[COL.ADDRESS - 1],
    message: alreadySubmitted
      ? 'Feedback was already submitted. You can download your certificate again.'
      : 'Thank you for your feedback. Your e-certificate is ready.',
  };
}

function getFormResponsesSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = spreadsheet.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName();
    if (name.indexOf('Form Responses') === 0) {
      return sheets[i];
    }
  }

  return null;
}

function hasFormResponseForCode_(registrationCode) {
  return Boolean(findFormResponseRow_(registrationCode));
}

function findFormResponseRow_(registrationCode) {
  const formSheet = getFormResponsesSheet_();
  if (!formSheet) {
    return null;
  }

  const lastRow = formSheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const codeCol = FORM_COL.REGISTRATION_CODE + 1;
  const numRows = lastRow - 1;
  const codes = formSheet.getRange(2, codeCol, numRows, 1).getValues();

  for (let i = codes.length - 1; i >= 0; i--) {
    const code = String(codes[i][0] || '')
      .trim()
      .toUpperCase();

    if (code === registrationCode) {
      const rowNumber = i + 2;
      const numCols = getFormResponseColumnCount_(formSheet);
      return formSheet.getRange(rowNumber, 1, 1, numCols).getValues()[0];
    }
  }

  return null;
}

function applyFeedbackToRegistration_(registrationCode, formRow) {
  const row = findRowByCode_(registrationCode, { live: true });

  if (!row) {
    return false;
  }

  const alreadySubmitted =
    String(row.values[COL.FEEDBACK_SUBMITTED - 1]).toLowerCase() === 'yes';

  if (alreadySubmitted) {
    return true;
  }

  const rating = parseRating_(formRow[FORM_COL.RATING]);
  const comments = extractCommentsFromFormRow_(formRow);
  const certUrl = buildCertificateUrl_(registrationCode, false);
  const sheet = getSheet_();

  // Single batched write keeps the form-submit lock short under traffic spikes.
  sheet
    .getRange(row.rowNumber, COL.FEEDBACK_SUBMITTED, 1, 6)
    .setValues([['Yes', new Date(), rating || '', comments || '', 'Yes', certUrl || '']]);

  invalidateRegistrationCache_();

  return true;
}

function syncFeedbackFromFormResponses_(registrationCode) {
  const formRow = findFormResponseRow_(registrationCode);

  if (!formRow) {
    return false;
  }

  return applyFeedbackToRegistration_(registrationCode, formRow);
}

function findRowByCode_(registrationCode, options) {
  const live = options && options.live;
  const values = live ? getLiveRegistrationRows_() : getRegistrationRows_();

  for (let i = 0; i < values.length; i++) {
    const rowCode = String(values[i][COL.CODE - 1] || '')
      .trim()
      .toUpperCase();

    if (rowCode === registrationCode) {
      return {
        rowNumber: i + 2,
        values: values[i],
      };
    }
  }

  // Cache miss after a recent write — try one live read before giving up.
  if (!live) {
    return findRowByCode_(registrationCode, { live: true });
  }

  return null;
}

function getLiveRegistrationRows_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

function generateUniqueCode_() {
  const datePart = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const known = getKnownRegistrationCodes_();

  for (let attempt = 0; attempt < 20; attempt++) {
    const randomPart = Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
    const code = WEBINAR_NAME + '-' + datePart + '-' + randomPart;

    if (!known[code]) {
      known[code] = true;
      return code;
    }
  }

  throw new Error('Unable to generate a unique registration code.');
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < HEADERS.length) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }

  const addressHeader = String(sheet.getRange(1, COL.ADDRESS).getValue()).trim();
  if (addressHeader === 'Organization') {
    sheet.getRange(1, COL.ADDRESS).setValue('Address');
  }

  return sheet;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
