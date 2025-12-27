import { NextResponse } from 'next/server';
import { parseP60WithAI, parseP60FromImage } from '@/lib/p60-parser';
import { extractText } from 'unpdf';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const isPDF = fileName.endsWith('.pdf');
    const isImage = fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg');

    if (!isPDF && !isImage) {
      return NextResponse.json({ error: 'Please upload a PDF or image file (PNG/JPG).' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 10MB.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    let result;

    if (isPDF) {
      // Extract text from PDF and use AI text parser
      const uint8Array = new Uint8Array(bytes);
      let text;
      try {
        const pdfResult = await extractText(uint8Array);
        text = Array.isArray(pdfResult.text) ? pdfResult.text.join(' ') : String(pdfResult.text);
      } catch (pdfError) {
        console.error('[P60] PDF error:', pdfError.message);
        return NextResponse.json({ error: 'Could not read PDF. File may be corrupted or password-protected.' }, { status: 400 });
      }

      if (!text || text.trim().length === 0) {
        return NextResponse.json({ error: 'Could not extract text. Document may be a scanned image - try uploading as PNG/JPG instead.', isScannedImage: true }, { status: 400 });
      }

      result = await parseP60WithAI(text);
    } else {
      // Use Claude Vision for images
      const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
      result = await parseP60FromImage(bytes, mimeType);
    }

    console.log(`[P60] File: ${file.name}, Success: ${result.success}, Confidence: ${result.confidence}`);

    return NextResponse.json({
      success: result.success,
      isP60: result.isP60,
      data: result.data,
      confidence: result.confidence,
      warnings: result.errors,
    });

  } catch (error) {
    console.error('[P60] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to parse P60' }, { status: 500 });
  }
}
