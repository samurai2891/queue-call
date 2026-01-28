import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface PDFExportOptions {
  filename?: string;
  title?: string;
  storeName?: string;
  period?: string;
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

  // Create canvas from element
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
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
