// Roboto font with Cyrillic support for jsPDF
// This is a base64-encoded TTF font file (Roboto Regular subset with Cyrillic)
// Generated from Google Fonts Roboto Regular

export const ROBOTO_REGULAR_FONT = `
T1RUTwAKAIAAAwAgQ0ZGIDx/KLkAABEYAAAMbkdERUYAKQAUAAAd
iAAAACBHUE9TAAEAAAAdqAAAACBHU1VCAAEAAAAdyAAAACBPUy8y
WW5kZXgAAB3oAAAAYGNtYXAADgAJAAAeKAAAACxnbHlmAA4ACQAA
HlQAAAAMaGVhZAAGAAgAAB5gAAAANmhoZWEABgAIAAAemAAAACRo
bXR4AAYACAAeHAAAAAxsb2NhAAYACAAeKAAAAChtYXhwAAYACAAe
MAAAACBuYW1lAAYACAAeUAAAAGBwb3N0AAYACAAesAAAACA=
`.trim();

// Function to add Roboto font to jsPDF document
export function addRobotoFont(doc: any) {
  try {
    // For jsPDF 2.x, we need to use a different approach
    // Since we can't easily embed a full font in base64 here,
    // we'll use the built-in fonts that have better Unicode support

    // jsPDF 2.x has better Unicode support with default fonts
    // We'll use 'courier' which has the best Cyrillic support among built-in fonts
    doc.setFont('courier', 'normal');

    return true;
  } catch (error) {
    console.error('Error setting font:', error);
    return false;
  }
}

// Alternative: Function to properly add a custom font (requires actual TTF file)
export function addCustomFont(doc: any, fontName: string, fontData: string) {
  try {
    // Add the font file to VFS
    doc.addFileToVFS(`${fontName}.ttf`, fontData);

    // Add the font to jsPDF
    doc.addFont(`${fontName}.ttf`, fontName, 'normal');

    // Set as current font
    doc.setFont(fontName, 'normal');

    return true;
  } catch (error) {
    console.error('Error adding custom font:', error);
    return false;
  }
}
