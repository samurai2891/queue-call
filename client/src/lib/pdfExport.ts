import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface PDFExportOptions {
  filename?: string;
  title?: string;
  storeName?: string;
  period?: string;
}

/**
 * Convert OKLCH color to RGB hex
 * html2canvas doesn't support OKLCH, so we need to convert it
 */
function oklchToRgb(oklchStr: string): string | null {
  const match = oklchStr.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)/i);
  if (!match) return null;

  // Parse OKLCH values
  let l = parseFloat(match[1]);
  if (match[1].includes('%')) l = l / 100;
  const c = parseFloat(match[2]);
  const h = parseFloat(match[3]) * Math.PI / 180;
  
  // Convert OKLCH to OKLab
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  
  // Convert OKLab to linear RGB
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;
  
  let r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  
  // Clamp and convert to sRGB
  const toSrgb = (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 255;
    return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1/2.4) - 0.055) * 255);
  };
  
  const rVal = toSrgb(r);
  const gVal = toSrgb(g);
  const bVal = toSrgb(bl);
  
  // Handle alpha
  let alpha = 1;
  if (match[4]) {
    alpha = parseFloat(match[4]);
    if (match[4].includes('%')) alpha = alpha / 100;
  }
  
  if (alpha < 1) {
    return `rgba(${rVal}, ${gVal}, ${bVal}, ${alpha})`;
  }
  
  return `rgb(${rVal}, ${gVal}, ${bVal})`;
}

/**
 * Convert all OKLCH colors in computed styles to RGB
 */
function convertOklchStyles(element: HTMLElement): Map<HTMLElement, Map<string, string>> {
  const originalStyles = new Map<HTMLElement, Map<string, string>>();
  const allElements = [element, ...Array.from(element.querySelectorAll('*'))] as HTMLElement[];
  
  const colorProperties = [
    'color',
    'backgroundColor',
    'borderColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'outlineColor',
    'textDecorationColor',
    'boxShadow',
    'fill',
    'stroke',
  ];
  
  for (const el of allElements) {
    if (!(el instanceof HTMLElement)) continue;
    
    const computed = window.getComputedStyle(el);
    const elementOriginals = new Map<string, string>();
    
    for (const prop of colorProperties) {
      const value = computed.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
      if (value && value.includes('oklch')) {
        const converted = oklchToRgb(value);
        if (converted) {
          elementOriginals.set(prop, el.style.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase()));
          el.style.setProperty(prop.replace(/([A-Z])/g, '-$1').toLowerCase(), converted);
        }
      }
    }
    
    if (elementOriginals.size > 0) {
      originalStyles.set(el, elementOriginals);
    }
  }
  
  return originalStyles;
}

/**
 * Restore original styles after conversion
 */
function restoreStyles(originalStyles: Map<HTMLElement, Map<string, string>>): void {
  originalStyles.forEach((styles, el) => {
    styles.forEach((value, prop) => {
      const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      if (value) {
        el.style.setProperty(cssProp, value);
      } else {
        el.style.removeProperty(cssProp);
      }
    });
  });
}

/**
 * Export a DOM element to PDF
 */
export async function exportToPDF(
  element: HTMLElement,
  options: PDFExportOptions = {}
): Promise<void> {
  const {
    filename = 'dashboard-report',
    title = 'Dashboard Report',
    storeName = '',
    period = '',
  } = options;

  // Convert OKLCH colors to RGB before capturing
  const originalStyles = convertOklchStyles(element);

  try {
    // Create canvas from element
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      // Ignore unsupported color functions
      onclone: (clonedDoc) => {
        // Additional cleanup for cloned document if needed
        const clonedElement = clonedDoc.body;
        const allElements = clonedElement.querySelectorAll('*');
        allElements.forEach((el) => {
          if (el instanceof HTMLElement) {
            const style = el.getAttribute('style');
            if (style && style.includes('oklch')) {
              // Replace any remaining oklch with fallback
              el.setAttribute('style', style.replace(/oklch\([^)]+\)/gi, '#888888'));
            }
          }
        });
      },
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    // Calculate PDF dimensions (A4 landscape for dashboard)
    const pdf = new jsPDF({
      orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Add header
    const headerHeight = 20;
    pdf.setFontSize(16);
    pdf.setTextColor(33, 33, 33);
    pdf.text(title, 14, 12);
    
    if (storeName) {
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(storeName, 14, 18);
    }

    if (period) {
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      const periodX = storeName ? 14 + pdf.getTextWidth(storeName) + 10 : 14;
      pdf.text(`| ${period}`, periodX, 18);
    }

    // Add timestamp
    const now = new Date();
    const timestamp = now.toLocaleString();
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(timestamp, pdfWidth - 14 - pdf.getTextWidth(timestamp), 12);

    // Calculate image dimensions to fit in PDF
    const availableHeight = pdfHeight - headerHeight - 10;
    const availableWidth = pdfWidth - 20;
    
    const ratio = Math.min(
      availableWidth / (imgWidth / 2),
      availableHeight / (imgHeight / 2)
    );
    
    const scaledWidth = (imgWidth / 2) * ratio;
    const scaledHeight = (imgHeight / 2) * ratio;
    
    // Center the image
    const x = (pdfWidth - scaledWidth) / 2;
    const y = headerHeight + 5;

    // Add image to PDF
    pdf.addImage(imgData, 'PNG', x, y, scaledWidth, scaledHeight);

    // Save PDF
    const dateStr = now.toISOString().split('T')[0];
    pdf.save(`${filename}_${dateStr}.pdf`);
  } finally {
    // Restore original styles
    restoreStyles(originalStyles);
  }
}

/**
 * Generate filename for PDF export
 */
export function generatePDFFilename(prefix: string, storeName?: string): string {
  const sanitizedStoreName = storeName
    ? storeName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')
    : '';
  return sanitizedStoreName ? `${prefix}_${sanitizedStoreName}` : prefix;
}
