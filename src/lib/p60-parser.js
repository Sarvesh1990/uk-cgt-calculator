/**
 * P60 Parser Utility - AI-Powered using Claude
 * Supports both PDF and Image (PNG/JPG) formats using Claude's vision
 */

import Anthropic from '@anthropic-ai/sdk';

const P60_PROMPT = `Extract data from this UK P60 End of Year Certificate. Return ONLY valid JSON:
{
  "isP60": true/false,
  "grossPay": number or null,
  "taxPaid": number or null,
  "niPaid": number or null,
  "taxYear": "YYYY/YY" or null
}

Rules:
- grossPay = Total pay for year (largest pay figure, "Total for year" or "Pay in this employment")
- taxPaid = Tax deducted/PAYE
- niPaid = Employee's NI contributions
- Return raw numbers without £ or commas
- taxYear format: "2024/25"`;

/**
 * Use Claude AI to extract P60 data from text
 */
export async function parseP60WithAI(text) {
  const result = {
    success: false,
    isP60: false,
    data: { grossPay: '', taxPaid: '', niPaid: '', taxYear: '' },
    confidence: 'low',
    errors: [],
  };

  if (!text || text.trim().length < 50) {
    result.errors.push('Document appears to be empty or too short');
    return result;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[P60] Anthropic API key not configured, falling back to regex parser');
    return parseP60WithRegex(text);
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 256,
      messages: [{ role: 'user', content: `${P60_PROMPT}\n\nP60 Text:\n${text.substring(0, 3500)}` }],
    });

    return processAIResponse(response.content[0]?.text, result);
  } catch (error) {
    console.error('[P60] AI parsing error:', error.message);
    return parseP60WithRegex(text);
  }
}

/**
 * Use Claude Vision to extract P60 data from an image
 */
export async function parseP60FromImage(imageBuffer, mimeType = 'image/png') {
  const result = {
    success: false,
    isP60: false,
    data: { grossPay: '', taxPaid: '', niPaid: '', taxYear: '' },
    confidence: 'low',
    errors: [],
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    result.errors.push('AI parsing not configured. Please use PDF format instead.');
    return result;
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          { type: 'text', text: P60_PROMPT }
        ]
      }],
    });

    return processAIResponse(response.content[0]?.text, result);
  } catch (error) {
    console.error('[P60] AI vision error:', error.message);
    result.errors.push('Failed to process image: ' + error.message);
    return result;
  }
}

/**
 * Process AI response and extract values
 */
function processAIResponse(content, result) {
  try {
    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);

    result.isP60 = parsed.isP60 === true;
    if (!result.isP60) {
      result.errors.push('Document does not appear to be a P60');
      return result;
    }

    if (parsed.grossPay) result.data.grossPay = String(parsed.grossPay);
    if (parsed.taxPaid) result.data.taxPaid = String(parsed.taxPaid);
    if (parsed.niPaid) result.data.niPaid = String(parsed.niPaid);
    if (parsed.taxYear) result.data.taxYear = parsed.taxYear;

    let fieldsFound = 0;
    if (parsed.grossPay) fieldsFound++;
    if (parsed.taxPaid) fieldsFound++;
    if (parsed.niPaid) fieldsFound++;

    result.confidence = fieldsFound >= 3 ? 'high' : fieldsFound >= 2 ? 'medium' : 'low';
    result.success = fieldsFound >= 1;

    if (!parsed.grossPay) result.errors.push('Could not extract Gross Pay');
    if (!parsed.taxPaid) result.errors.push('Could not extract Tax Paid');

    return result;
  } catch (error) {
    result.errors.push('Failed to parse AI response');
    return result;
  }
}

/**
 * Fallback regex-based parser
 */
export function parseP60WithRegex(text) {
  const result = {
    success: false,
    isP60: false,
    data: { grossPay: '', taxPaid: '', niPaid: '', taxYear: '' },
    confidence: 'low',
    errors: [],
  };

  if (!text || text.trim().length < 50) {
    result.errors.push('Document appears to be empty');
    return result;
  }

  const lowerText = text.toLowerCase();
  const indicators = ['p60', 'end of year certificate', 'paye', 'tax year', 'national insurance'];
  result.isP60 = indicators.filter(ind => lowerText.includes(ind)).length >= 2;

  if (!result.isP60) {
    result.errors.push('Document does not appear to be a P60');
    return result;
  }

  const amounts = [];
  const regex = /([\d,]+\.\d{2})/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const value = parseFloat(match[1].replace(/,/g, ''));
    if (value > 0) amounts.push(value);
  }

  amounts.sort((a, b) => b - a);

  if (amounts[0] > 10000) result.data.grossPay = amounts[0].toString();
  if (amounts[1] > 1000) result.data.taxPaid = amounts[1].toString();

  const niMatch = text.match(/Employee's\s+contributions[\s\S]*?([\d,]+\.\d{2})/i);
  if (niMatch) {
    result.data.niPaid = parseFloat(niMatch[1].replace(/,/g, '')).toString();
  } else if (amounts[2] && amounts[2] < 50000) {
    result.data.niPaid = amounts[2].toString();
  }

  const yearMatch = text.match(/5\s*April\s*(\d{4})/i);
  if (yearMatch) {
    const endYear = parseInt(yearMatch[1]);
    result.data.taxYear = `${endYear - 1}/${String(endYear).slice(-2)}`;
  }

  let fieldsFound = 0;
  if (result.data.grossPay) fieldsFound++;
  if (result.data.taxPaid) fieldsFound++;
  if (result.data.niPaid) fieldsFound++;

  result.confidence = fieldsFound >= 3 ? 'high' : fieldsFound >= 2 ? 'medium' : 'low';
  result.success = fieldsFound >= 1;

  if (!result.data.grossPay) result.errors.push('Could not extract Gross Pay');
  if (!result.data.taxPaid) result.errors.push('Could not extract Tax Paid');

  return result;
}

export const parseP60Text = parseP60WithRegex;
