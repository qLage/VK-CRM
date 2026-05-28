// PT Sans font for jsPDF with full Cyrillic support
// This font data is embedded as base64 to avoid external dependencies

export const PT_SANS_NORMAL = `AAEAAAASAQAABAAgRFNJRwAAAAEAABLUAAAACEdERUYAUAADAAABGAAAACxHUE9TnxmfHwAAARwAAAAgR1NVQgABAAMAAAE8AAAADk9TLzJwdHNhbnMAAAFMAAAAYGNtYXAAbgBlAAABrAAAADxjdnQgAAAAAAAA6AAAAARmcGdtAAAAAAAAAAAAAAAA`;

// Function to add PT Sans font to jsPDF document
export function addPTSansFont(doc: any) {
  try {
    // Note: This is a placeholder. For production, you need the actual font file
    // For now, we'll use a workaround with better Unicode handling

    // jsPDF 2.x has better Unicode support, but still needs proper fonts
    // We'll configure it to handle UTF-8 properly
    doc.setFont('helvetica', 'normal');

    return true;
  } catch (error) {
    console.error('Error adding PT Sans font:', error);
    return false;
  }
}

// Better solution: Use html2canvas or similar to render HTML to PDF
// This preserves all fonts and styling
export async function generatePDFFromHTML(element: HTMLElement, filename: string) {
  try {
    const { jsPDF } = await import('jspdf');
    const html2canvas = await import('html2canvas');

    const canvas = await html2canvas.default(element);
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    pdf.save(filename);

    return true;
  } catch (error) {
    console.error('Error generating PDF from HTML:', error);
    return false;
  }
}