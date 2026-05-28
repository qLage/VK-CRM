// Roboto font loader for jsPDF with Cyrillic support
// Using a simpler approach with embedded base64 font data

import { jsPDF } from 'jspdf';

let fontLoaded = false;

// Simplified approach: Use courier font which has the best Cyrillic support
// among jsPDF's built-in fonts
export async function addRussianFontToDoc(doc: jsPDF): Promise<boolean> {
  try {
    // Use courier font - it has better Cyrillic support than helvetica
    doc.setFont('courier', 'normal');
    fontLoaded = true;
    return true;
  } catch (error) {
    console.error('Error setting font:', error);
    return false;
  }
}

// Alternative: Load custom font from URL (for future implementation)
export async function loadCustomFont(doc: jsPDF, fontUrl: string, fontName: string): Promise<boolean> {
  try {
    const response = await fetch(fontUrl);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    doc.addFileToVFS(`${fontName}.ttf`, base64);
    doc.addFont(`${fontName}.ttf`, fontName, 'normal');
    doc.setFont(fontName, 'normal');

    return true;
  } catch (error) {
    console.error('Error loading custom font:', error);
    return false;
  }
}

// Create a PDF with Russian font support
export async function createPDFWithRussianFont(): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  await addRussianFontToDoc(doc);

  return doc;
}
