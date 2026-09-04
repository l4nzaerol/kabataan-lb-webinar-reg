import { useEffect, useRef, useState } from 'react'
import {
  isGasConfigured,
  checkCertificateStatus,
  issueCertificate,
  registerParticipant,
} from './api/sheetsApi'
import Certificate, { downloadCertificate } from './components/Certificate'
import './App.css'

const GOOGLE_FORM_URL = import.meta.env.VITE_GOOGLE_FORM_URL || ''
const ZOOM_URL = import.meta.env.VITE_ZOOM_URL || 'https://zoom.us/j/97660103140?pwd=AafhCgNuG6qx4xlFqJapMGBtV9aFi9.1'
const APP_MODE = import.meta.env.VITE_APP_MODE || 'both'
const IS_REGISTER_ONLY = APP_MODE === 'register'
const IS_CERTIFICATE_ONLY = APP_MODE === 'certificate'
const SHOW_BOTH_TABS = APP_MODE === 'both'

const LOADING_COPY = {
  checking: {
    subtitle: 'Checking your registration code and feedback status...',
    note: 'Verifying that you are registered and have submitted the feedback form.',
  },
  processing: {
    subtitle: 'Your feedback was received. Finalizing your e-certificate...',
    note: 'Your Google Form submission is being confirmed. This usually takes a few seconds.',
  },
  preparing: {
    subtitle: 'Preparing your e-certificate...',
    note: 'Loading your certificate with your registered name and URN.',
  },
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const INITIAL_REGISTRATION = {
  fullName: '',
  email: '',
  address: '',
  phone: '',
}

function getCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('code')?.trim() || ''
}

function shouldAutoDownload() {
  return new URLSearchParams(window.location.search).get('download') === '1'
}

function CopyCodeButton({ code }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      type="button"
      className="btn btn-copy"
      onClick={handleCopy}
      aria-label="Copy registration code"
    >
      {copied ? 'Copied!' : 'Copy Code'}
    </button>
  )
}

function getInitialPage() {
  if (IS_REGISTER_ONLY) {
    return 'register'
  }

  if (IS_CERTIFICATE_ONLY) {
    return 'certificate'
  }

  if (getCodeFromUrl()) {
    return 'certificate'
  }

  if (new URLSearchParams(window.location.search).get('tab') === 'certificate') {
    return 'certificate'
  }

  return 'register'
}

function App() {
  const [page, setPage] = useState(getInitialPage)

  return (
    <div className="app-shell">
      {!isGasConfigured() && (
        <div className="config-banner" role="status">
          Google Sheets is not connected yet. Add <code>VITE_GAS_WEB_APP_URL</code> to your{' '}
          <code>.env</code> file. See <code>google-apps-script/SETUP.md</code>.
        </div>
      )}

      {SHOW_BOTH_TABS && (
        <nav className="nav-tabs" aria-label="Webinar pages">
          <button
            type="button"
            className={page === 'register' ? 'nav-tab active' : 'nav-tab'}
            onClick={() => setPage('register')}
          >
            Registration
          </button>
          <button
            type="button"
            className={page === 'certificate' ? 'nav-tab active' : 'nav-tab'}
            onClick={() => setPage('certificate')}
          >
            E-Certificate
          </button>
        </nav>
      )}

      {page === 'register' ? (
        IS_REGISTER_ONLY && getCodeFromUrl() ? (
          <CertificateUnavailablePage />
        ) : (
          <RegistrationPage />
        )
      ) : (
        <CertificatePage />
      )}
    </div>
  )
}

function RegistrationPage() {
  const [form, setForm] = useState(INITIAL_REGISTRATION)
  const [errors, setErrors] = useState({})
  const [registration, setRegistration] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  function validate() {
    const nextErrors = {}

    if (!form.fullName.trim()) {
      nextErrors.fullName = 'Full name is required.'
    }

    if (!form.email.trim()) {
      nextErrors.email = 'Email is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = 'Enter a valid email address.'
    }

    if (!form.address.trim()) {
      nextErrors.address = 'Address is required.'
    }

    if (form.phone.trim() && !/^[\d\s+\-()]+$/.test(form.phone)) {
      nextErrors.phone = 'Enter a valid phone number.'
    }

    return nextErrors
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')

    const nextErrors = validate()
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setSubmitting(true)

    try {
      const result = await registerParticipant(form)

      if (!result.success) {
        setSubmitError(result.message || 'a failed. Please try again.')
        return
      }

      setRegistration({
        ...result,
        address: result.address || form.address,
      })
    } catch (error) {
      setSubmitError(error.message || 'Unable to connect to Google Sheets.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleRegisterAnother() {
    setForm(INITIAL_REGISTRATION)
    setErrors({})
    setRegistration(null)
    setSubmitError('')
  }

  if (registration) {
    return (
      <div className="page">
        <section className="card card--wide success-card">
          <span className="card-accent" aria-hidden="true" />
          <div className="card-inner">
            
            <p className="card-label">Registration Complete</p>
            <h1>Registration Successful</h1>
            <p className="success-message">
              Thank you, <strong>{registration.fullName}</strong>. You are registered for the
              KABATAANG LINGKOD BAYANI WEBINAR.
            </p>

            <div className="registration-number-box">
              <span className="registration-label">Your Registration Code</span>
              <div className="registration-code-row">
                <span className="registration-number">{registration.registrationCode}</span>
                <CopyCodeButton code={registration.registrationCode} />
              </div>
            </div>

            <p className="registration-note">
              Save your registration code. After the webinar, enter it on the feedback form, then
              open the certificate page from the form confirmation message and enter the same code
              to claim your e-certificate.
            </p>

            {ZOOM_URL && (
              <div className="zoom-link-box">
                <p className="registration-note">
                  Join the KABATAANG LINGKOD BAYANI WEBINAR on Zoom using the link below:
                </p>
                <a
                  href={ZOOM_URL}
                  className="btn btn-primary zoom-link-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Join Zoom Webinar
                </a>
              </div>
            )}

            <hr className="card-divider" />

            <div className="summary">
              <h2>Registration Details</h2>
              <dl>
                <div>
                  <dt>Email</dt>
                  <dd>{registration.email}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{registration.address}</dd>
                </div>
                {registration.phone && (
                  <div>
                    <dt>Phone</dt>
                    <dd>{registration.phone}</dd>
                  </div>
                )}
              </dl>
            </div>

            <button type="button" className="btn btn-secondary" onClick={handleRegisterAnother}>
              Register Another Person
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="header">
        <p className="eyebrow"></p>
        <h1 className="site-title">
          BAGONG CABUYAO
          <span>KABATAANG LINGKOD BAYANI WEBINAR</span>
        </h1>
        <p className="subtitle">
      
        </p>
      </header>

      <section className="card card--wide">
        <span className="card-accent" aria-hidden="true" />
        <div className="card-inner">
        
          <h2 className="card-title">Participant Details</h2>
          <p className="card-desc">Fill in your information to register for the <br/>
          KABATAANG LINGKOD BAYANI WEBINAR</p>

          <hr className="card-divider" />

          <form className="registration-form" onSubmit={handleSubmit} noValidate>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="fullName">Full Name *  <br />
              (NAME TO APPEAR ON THE CERTIFICATE) </label>
              
              <input
                id="fullName"
                name="fullName"
                type="text"
                value={form.fullName}
                onChange={handleChange}
                placeholder="Juan Dela Cruz"
                autoComplete="name"
              />
              {errors.fullName && <span className="error">{errors.fullName}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="email">
              EMAIL ADDRESS *
              <span style={{ visibility: "hidden", display: "block" }}>
                (placeholder)
              </span>
            </label>
              
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="email"
              />
              {errors.email && <span className="error">{errors.email}</span>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="address">Address *</label>
            <input
              id="address"
              name="address"
              type="text"
              value={form.address}
              onChange={handleChange}
              placeholder="Street, city, province"
              autoComplete="street-address"
            />
            {errors.address && (
              <span className="error">{errors.address}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone Number</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="09XXXXXXXXX"
              autoComplete="tel"
            />
            {errors.phone && <span className="error">{errors.phone}</span>}
          </div>

          {submitError && <p className="form-error">{submitError}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving Registration...' : 'Complete Registration'}
          </button>
        </form>
        </div>
      </section>
      <div className="logo-container">
        <img src="/cysdo-combined-logo.png" alt="CYSDO" className="footer-logo" />
      </div>
    </div>
  )
}

function CertificateUnavailablePage() {
  return (
    <div className="page">
      <header className="header">
        <p className="eyebrow">After the Webinar</p>
        <h1>E-Certificate</h1>
        <p className="subtitle">
          Certificate claiming opens on a separate site after the webinar. Use the link shown in
          the feedback form confirmation message, enter your registration code, and claim your
          e-certificate. Contact the organizers if you need help.
        </p>
      </header>

      <section className="card">
        <span className="card-accent" aria-hidden="true" />
        <div className="card-inner">
          <p className="card-label">Certificate Pending</p>
          <p className="registration-note">
            Your registration code <strong>{getCodeFromUrl()}</strong> is saved. Use the certificate
            site once feedback has been submitted.
          </p>
        </div>
      </section>
    </div>
  )
}

function getCodeSizeClass(code) {
  const length = String(code || '').length
  if (length > 28) {
    return 'ecert-code-value--long'
  }
  if (length > 22) {
    return 'ecert-code-value--medium'
  }
  return ''
}

function CertificatePage() {
  const codeFromUrl = getCodeFromUrl()
  const [step, setStep] = useState(() => (codeFromUrl ? 'loading' : 'form'))
  const [code, setCode] = useState(() => codeFromUrl)
  const [errors, setErrors] = useState({})
  const [certificateData, setCertificateData] = useState(null)
  const [submitting, setSubmitting] = useState(Boolean(codeFromUrl))
  const [downloading, setDownloading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [feedbackRequired, setFeedbackRequired] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState('checking')
  const [autoDownloadPending, setAutoDownloadPending] = useState(false)
  const autoClaimStarted = useRef(false)

  async function fetchCertificate(registrationCode, options = {}) {
    const { autoDownload = false, retryOnFeedback = true } = options
    setSubmitError('')
    setFeedbackRequired(false)

    const trimmedCode = registrationCode.trim()
    if (!trimmedCode) {
      setErrors({ code: 'Registration code is required.' })
      setStep('form')
      return
    }

    setSubmitting(true)
    setLoadingStatus('checking')
    setStep('loading')

    try {
      let status = await checkCertificateStatus(trimmedCode)

      if (!status.success) {
        setSubmitError(status.message || 'Unable to verify your registration.')
        setStep('form')
        setCode(trimmedCode)
        return
      }

      if (!status.valid) {
        setSubmitError(status.message || 'Registration code not found. Please check and try again.')
        setStep('form')
        setCode(trimmedCode)
        return
      }

      if (!status.ready && status.pendingFeedback && retryOnFeedback) {
        setLoadingStatus('processing')

        for (let attempt = 0; attempt < 3; attempt += 1) {
          await wait(500)
          status = await checkCertificateStatus(trimmedCode)

          if (status.ready || !status.pendingFeedback) {
            break
          }
        }
      }

      if (!status.ready) {
        setFeedbackRequired(Boolean(status.feedbackRequired))
        setSubmitError(
          status.message ||
            'You need to submit the feedback Google Form before claiming your e-certificate.',
        )
        setStep('form')
        setCode(trimmedCode)
        return
      }

      setLoadingStatus('preparing')

      // Prefer the status payload so claiming stays a single read under load.
      // Only call issueCertificate when the status response is incomplete.
      let result = status.certificatePreview
      if (!result && status.fullName && status.registrationCode) {
        result = {
          success: true,
          registrationCode: status.registrationCode,
          fullName: status.fullName,
          message: 'Your e-certificate is ready. You can download it below.',
        }
      } else if (!result) {
        result = await issueCertificate(trimmedCode)
      }

      if (!result.success) {
        setFeedbackRequired(Boolean(result.feedbackRequired))
        setSubmitError(result.message || 'Unable to issue certificate.')
        setStep('form')
        setCode(trimmedCode)
        return
      }

      setCertificateData(result)
      setStep('certificate')
      setAutoDownloadPending(autoDownload)

      const url = new URL(window.location.href)
      url.searchParams.set('code', result.registrationCode)
      if (autoDownload) {
        url.searchParams.set('download', '1')
      } else {
        url.searchParams.delete('download')
      }
      window.history.replaceState({}, '', url)
    } catch (error) {
      setSubmitError(error.message || 'Unable to connect to Google Sheets.')
      setStep('form')
      setCode(trimmedCode)
    } finally {
      setSubmitting(false)
      setLoadingStatus('checking')
    }
  }

  useEffect(() => {
    if (!codeFromUrl || autoClaimStarted.current) {
      return
    }

    autoClaimStarted.current = true
    fetchCertificate(codeFromUrl, { autoDownload: shouldAutoDownload() })
  }, [codeFromUrl])

  useEffect(() => {
    if (!autoDownloadPending || step !== 'certificate' || !certificateData) {
      return
    }

    let cancelled = false

    async function runAutoDownload() {
      setDownloading(true)
      setDownloadError('')

      try {
        await new Promise((resolve) => setTimeout(resolve, 800))
        if (!cancelled) {
          await downloadCertificate()
        }
      } catch (error) {
        if (!cancelled) {
          setDownloadError(error.message || 'Unable to download certificate. Please try again.')
        }
      } finally {
        if (!cancelled) {
          setDownloading(false)
          setAutoDownloadPending(false)
        }
      }
    }

    runAutoDownload()

    return () => {
      cancelled = true
    }
  }, [autoDownloadPending, step, certificateData])

  function handleChange(event) {
    setCode(event.target.value)
    if (errors.code) {
      setErrors({})
    }
  }

  async function handleDownload() {
    setDownloadError('')
    setDownloading(true)

    try {
      await downloadCertificate()
    } catch (error) {
      setDownloadError(error.message || 'Unable to download certificate. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrors({})
    await fetchCertificate(code)
  }

  if (step === 'loading') {
    const loadingCopy = LOADING_COPY[loadingStatus] || LOADING_COPY.checking

    return (
      <div className="page">
        <header className="header">
          <p className="eyebrow"></p>
          <h1>Your E-Certificate</h1>
          <p className="subtitle">{loadingCopy.subtitle}</p>
        </header>

        <section className="card loading-card">
          <span className="card-accent" aria-hidden="true" />
          <div className="card-inner">
            <div className="loading-spinner" aria-hidden="true" />
            <p className="loading-text">{loadingCopy.note}</p>
          </div>
        </section>
      </div>
    )
  }

  if (step === 'certificate' && certificateData) {
    const codeSizeClass = getCodeSizeClass(certificateData.registrationCode)

    return (
      <div className="page page--ecert-ready">
        <header className="header">
          <p className="eyebrow">KABATAANG LINGKOD BAYANI WEBINAR</p>
          <h1>Participants&apos; E-Certificate</h1>
          <p className="subtitle">
            Congratulations, <strong>{certificateData.fullName}</strong>
          </p>
        </header>

        <section className="card card--ecert-ready">
          <span className="card-accent" aria-hidden="true" />
          <div className="card-inner">
            

            <p className="card-label">Certificate Issued</p>
            <h2 className="card-title">Your E-Certificate Is Ready</h2>
            <p className="card-desc">
              Download your official Certificate of Participation from the KABATAANG LINGKOD BAYANI
              Webinar.
            </p>

            <hr className="card-divider" />

            <div className="ecert-code-box">
              <span className="registration-label">Registration Code</span>
              <span className={`ecert-code-value ${codeSizeClass}`.trim()}>
                {certificateData.registrationCode}
              </span>
            </div>

            <p className="card-footnote">
              Your PDF will include your registered name and this unique registration number
              (URN).
            </p>

            <button
              type="button"
              className="btn btn-primary btn--claim-cert"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? 'Generating PDF...' : 'Claim My Certificate'}
            </button>

            {downloadError && <p className="form-error">{downloadError}</p>}

            <hr className="card-divider ecert-card-divider" />

            <div className="ecert-card-logo">
              <img src="/cysdo-combined-logo.png" alt="CYSDO" />
            </div>
          </div>
        </section>

        <Certificate
          fullName={certificateData.fullName}
          registrationCode={certificateData.registrationCode}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="header">
        <p className="eyebrow">KABATAANG LINGKOD BAYANI WEBINAR</p>
        <h1>KABATAANG LINGKOD BAYANI WEBINAR</h1>
          <p className="subtitle">
          Enter your registration code after submitting the feedback Google Form to claim the E-certificate
        </p>
      </header>

      <section className="card card--claim">
        <span className="card-accent" aria-hidden="true" />
        <div className="card-inner">
          <p className="card-label">E-Certificate</p>
          <h2 className="card-title">Claim Your Certificate</h2>
          <p className="card-desc">
            After submitting the feedback form, open the certificate page from the confirmation
            message and enter your registration code below to claim your e-certificate.
          </p>

          <hr className="card-divider" />

          <form className="registration-form" onSubmit={handleSubmit} noValidate>
            <div className="code-input-wrap">
              <label htmlFor="code">Registration Code</label>
              <input
                id="code"
                name="code"
                type="text"
                className="code-input"
                value={code}
                onChange={handleChange}
                placeholder="KLBW-20260707-ABC123"
                autoComplete="off"
                spellCheck={false}
              />
              {errors.code && <span className="error">{errors.code}</span>}
            </div>

            {submitError && <p className="form-error">{submitError}</p>}

            {feedbackRequired && (
              <p className="card-footnote">
                {GOOGLE_FORM_URL ? (
                  <>
                    Submit the feedback form first, then return here:{' '}
                    <a href={GOOGLE_FORM_URL} target="_blank" rel="noopener noreferrer">
                      Open Feedback Form
                    </a>
                  </>
                ) : (
                  <>Submit the feedback Google Form using your registration code first.</>
                )}
              </p>
            )}

            {!feedbackRequired && GOOGLE_FORM_URL && (
              <p className="card-footnote">
                Haven&apos;t submitted feedback yet?{' '}
                <a href={GOOGLE_FORM_URL} target="_blank" rel="noopener noreferrer">
                  Open Feedback Form
                </a>
              </p>
            )}

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Verifying...' : 'Get E-Certificate'}
            </button>
          </form>
        </div>
      </section>
      
      <div className="logo-container">
        <img src="/cysdo-combined-logo.png" alt="CYSDO" className="footer-logo" />
      </div>
    </div>
  )
}

export default App
