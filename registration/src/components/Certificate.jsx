import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import './Certificate.css'

const TEMPLATE_SRC = '/certificate-template.png'
export const CERTIFICATE_RENDER_WIDTH = 1491

function formatCertificateName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function formatRegistrationCode(code) {
  return String(code || '').trim().toUpperCase()
}

function getNameSizeClass(name) {
  const length = name.length
  if (length > 48) {
    return 'certificate-name--xxlong'
  }
  if (length > 36) {
    return 'certificate-name--xlong'
  }
  if (length > 24) {
    return 'certificate-name--long'
  }
  return ''
}

export default function Certificate({ fullName, registrationCode }) {
  const displayName = formatCertificateName(fullName)
  const displayCode = formatRegistrationCode(registrationCode)
  const nameSizeClass = getNameSizeClass(displayName)

  return (
    <div className="certificate-export-host" aria-hidden="true">
      <div className="certificate certificate--fixed" id="e-certificate">
        <img
          src={TEMPLATE_SRC}
          alt=""
          className="certificate-template"
          crossOrigin="anonymous"
          width={CERTIFICATE_RENDER_WIDTH}
        />
        <div className={`certificate-name ${nameSizeClass}`.trim()}>
          <span className="certificate-name-text">{displayName}</span>
        </div>
        <p className="certificate-urn">URN: {displayCode}</p>
      </div>
    </div>
  )
}

async function waitForCertificateImage(element) {
  const img = element.querySelector('.certificate-template')
  if (!img) {
    return
  }

  if (img.complete && img.naturalWidth > 0) {
    return
  }

  await new Promise((resolve, reject) => {
    img.addEventListener('load', resolve, { once: true })
    img.addEventListener('error', () => reject(new Error('Certificate template failed to load.')), {
      once: true,
    })
  })
}

export async function downloadCertificate() {
  const element = document.getElementById('e-certificate')
  if (!element) {
    throw new Error('Certificate not found.')
  }

  await waitForCertificateImage(element)

  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    width: CERTIFICATE_RENDER_WIDTH,
    windowWidth: CERTIFICATE_RENDER_WIDTH,
    logging: false,
  })

  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 10
  const maxWidth = pageWidth - margin * 2
  const maxHeight = pageHeight - margin * 2

  const imgRatio = canvas.width / canvas.height
  let renderWidth = maxWidth
  let renderHeight = renderWidth / imgRatio

  if (renderHeight > maxHeight) {
    renderHeight = maxHeight
    renderWidth = renderHeight * imgRatio
  }

  const x = (pageWidth - renderWidth) / 2
  const y = (pageHeight - renderHeight) / 2

  pdf.addImage(imgData, 'PNG', x, y, renderWidth, renderHeight)
  pdf.save('Dunong-Webinar-Certificate.pdf')
}
