# PDF Upload Support - Analysis & Recommendation

## Executive Summary

**YES, you should support PDF uploads using Claude AI Vision API** - following the same pattern you already use for P60 parsing. This will be reliable, cost-effective, and handle any broker format.

---

## Current Implementation Analysis

### What You Have Now

1. **CSV/XLSX Parsing**: Works well because:
   - Data is already structured in clear rows/columns
   - Easy to map headers to your data structure
   - Each broker has predictable column names

2. **Required Transaction Data Structure**:
   ```javascript
   {
     date: "2024-01-15",
     type: "BUY" | "SELL",
     symbol: "AAPL",
     quantity: 100,
     pricePerUnit: 150.00,
     totalAmount: 15000.00,
     fees: 10.00,
     currency: "USD",
     exchangeRate: 1.27,
     broker: "Charles Schwab"
   }
   ```

3. **Existing AI Pattern**: You already use Claude AI for P60 parsing:
   - Extract text from PDF using `unpdf`
   - Send to Claude Haiku with structured prompt
   - Parse JSON response
   - Fallback to regex if API not configured

---

## Why PDF Parsing is Challenging

### Problems with Traditional PDF Parsing

1. **Text Extraction Loses Structure**:
   - PDFs convert to unstructured text
   - Table boundaries, columns, and alignment are lost
   - Hard to distinguish headers from data rows

2. **Broker-Specific Layouts**:
   - Trading 212: Different format than Schwab
   - Interactive Brokers: Multi-column, complex tables
   - Each broker needs custom parsing logic

3. **Scanned PDFs**:
   - Many older statements are scanned images
   - Text extraction returns empty/garbage
   - Requires OCR

### Why Your "Column Mapping" Idea Has Limitations

Your suggestion: *"Use Claude AI to understand PDF columns and map to our data structure (low cost), then parse it normally without using AI once columns are mapped."*

**Problem**: Even with column mappings, you still need to:
- Extract the actual table data from PDF (hard problem)
- Handle multi-page statements
- Deal with subtotals, headers repeating on each page
- Parse different date formats, number formats
- Handle edge cases (split transactions, corporate actions)

The column mapping doesn't solve the core challenge of extracting structured data from PDFs.

---

## Recommended Solution: Claude AI Vision API

### Why Vision API is Best

1. **Sees the PDF like a human**: Understands table structure visually
2. **Works with scanned PDFs**: Built-in OCR capabilities
3. **Handles any broker format**: No need for format-specific logic
4. **You already have the pattern**: P60 parser is proof this works
5. **Extremely cheap**: ~$0.005 per PDF (half a penny)

### Cost Analysis

Using **Claude 3 Haiku** (cheapest model):
- Input: $0.25 per million tokens
- Output: $1.25 per million tokens

**Typical Broker Statement** (5 pages, 100-200 transactions):
- Image tokens: 5 pages × ~1,568 tokens/image = **7,840 tokens**
- Prompt: ~500 tokens
- **Total input: 8,340 tokens = $0.002**
- Output: ~2,000 tokens (JSON) = **$0.0025**
- **TOTAL COST: ~$0.005 per PDF** ✅

Even at scale (1,000 PDFs per day), that's only $5/day.

### Alternative: Claude 3.5 Sonnet (Better Accuracy)
- Input: $3.00 per million tokens
- Same PDF: ~$0.025 per statement (2.5 cents)
- Still very affordable for better extraction quality

---

## Implementation Plan

### Phase 1: Basic PDF Support

1. **Update File Upload Component** (`CGTStep.js`):
   ```javascript
   // Accept .pdf files
   filter(f => f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.pdf'))
   ```

2. **Create Broker PDF Parser** (`src/lib/broker-pdf-parser.js`):
   - Similar to `p60-parser.js`
   - Convert PDF pages to images (use `pdf-lib` or `unpdf`)
   - Send to Claude Vision API
   - Parse structured JSON response

3. **Update Calculate API** (`src/app/api/calculate/route.js`):
   - Detect PDF files
   - Use broker-pdf-parser instead of csv-parser
   - Merge transactions with existing CSV/XLSX data

### Phase 2: Broker-Specific Prompts

Create tailored prompts for each broker to improve accuracy:

```javascript
const BROKER_PROMPTS = {
  schwab: `Extract stock transactions from this Charles Schwab statement.
  Look for: Date, Action (Buy/Sell/RSU), Symbol, Quantity, Price, Fees, Amount.
  Return JSON array...`,
  
  trading212: `Extract transactions from Trading 212 statement.
  Columns: Action, Time, Ticker, Name, No. of shares, Price/share, Total, Currency...`,
  
  // etc.
};
```

### Phase 3: Validation & Confidence Scoring

- Check extracted data for completeness
- Flag suspicious transactions (e.g., missing prices, invalid dates)
- Show user confidence score: High/Medium/Low
- Allow manual review/correction

---

## Sample Implementation

### 1. Broker PDF Parser (`src/lib/broker-pdf-parser.js`)

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { extractText } from 'unpdf';
import * as pdfLib from 'pdf-lib';

const TRANSACTION_PROMPT = `Extract ALL stock transactions from this broker statement image.

Return ONLY valid JSON in this format:
{
  "broker": "Detected broker name",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "type": "BUY" or "SELL",
      "symbol": "Stock ticker",
      "quantity": number,
      "pricePerUnit": number,
      "totalAmount": number,
      "fees": number,
      "currency": "USD/GBP/etc"
    }
  ]
}

Rules:
- Extract EVERY transaction row from the table
- Normalize dates to YYYY-MM-DD
- Parse numbers without currency symbols or commas
- Identify transaction type: Buy, Sell, RSU Vest, etc.
- If fees/commission column exists, extract it
- Detect currency from document`;

export async function parseBrokerPDF(fileBuffer, brokerId) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('AI parsing requires ANTHROPIC_API_KEY environment variable');
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  
  // Convert PDF pages to images
  const pdfDoc = await pdfLib.PDFDocument.load(fileBuffer);
  const pages = pdfDoc.getPages();
  
  let allTransactions = [];
  
  // Process each page with Claude Vision
  for (let i = 0; i < Math.min(pages.length, 20); i++) { // Limit to 20 pages
    const page = pages[i];
    
    // Convert page to image (you'd use a library like pdf-to-img or similar)
    const imageBuffer = await convertPageToImage(page);
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // or claude-3-5-sonnet for better accuracy
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'image', 
            source: { 
              type: 'base64', 
              media_type: 'image/png', 
              data: base64Image 
            } 
          },
          { type: 'text', text: TRANSACTION_PROMPT }
        ]
      }],
    });
    
    // Parse response
    const content = response.content[0]?.text;
    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      allTransactions = allTransactions.concat(parsed.transactions || []);
    }
  }
  
  return {
    broker: brokerId,
    transactions: allTransactions,
    confidence: allTransactions.length > 0 ? 'high' : 'low'
  };
}

// Helper to convert PDF page to image
async function convertPageToImage(page) {
  // Use a library like pdfjs-dist or pdf-image
  // This is a placeholder - actual implementation depends on your choice
  // Alternative: use unpdf to extract text instead of images (cheaper but less accurate)
}
```

### 2. Update Calculate API

```javascript
// In src/app/api/calculate/route.js
import { parseBrokerPDF } from '@/lib/broker-pdf-parser';

export async function POST(request) {
  // ... existing code ...
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const brokerId = brokers[i] || 'other';
    const fileName = file.name?.toLowerCase() || '';
    
    const isPDF = fileName.endsWith('.pdf');
    const isXLSX = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    
    let transactions;
    
    if (isPDF) {
      // Parse PDF with AI
      const buffer = await file.arrayBuffer();
      const result = await parseBrokerPDF(buffer, brokerId);
      transactions = result.transactions;
    } else if (isXLSX) {
      // Existing XLSX logic
      // ...
    } else {
      // Existing CSV logic
      // ...
    }
    
    allTransactions = allTransactions.concat(transactions);
  }
  
  // ... rest of calculation logic ...
}
```

---

## Alternative: Text-Based Approach (Cheaper but Less Reliable)

If you want to minimize costs, you could:

1. Extract text from PDF using `unpdf`
2. Send text to Claude (not vision)
3. Ask Claude to parse the text into structured JSON

**Pros**: Slightly cheaper (no image tokens)
**Cons**: 
- Loses table structure
- May struggle with complex layouts
- Won't work with scanned PDFs

```javascript
// Text-based approach
const text = await extractText(pdfBuffer);
const response = await anthropic.messages.create({
  model: 'claude-3-haiku-20240307',
  max_tokens: 4096,
  messages: [{
    role: 'user',
    content: `${TRANSACTION_PROMPT}\n\nStatement Text:\n${text}`
  }]
});
```

**Cost**: ~$0.003 per PDF (40% cheaper but less reliable)

---

## Recommendation

### ✅ Use Claude Vision API (RECOMMENDED)

**Why**:
- Reliable extraction from any broker format
- Handles scanned PDFs
- Extremely low cost (~$0.005 per PDF)
- You already have the pattern (P60 parser)
- Minimal development effort
- Works with future broker formats without code changes

### Implementation Priority:

1. **Start with Vision API** using Claude 3 Haiku
2. **Test with real broker PDFs** from Schwab, Trading 212, IBKR
3. **Add validation** to check extracted data quality
4. **Monitor costs** and accuracy
5. **Upgrade to Claude 3.5 Sonnet** if accuracy needs improvement

### Timeline:
- **Week 1**: Build broker-pdf-parser.js (follow p60-parser.js pattern)
- **Week 2**: Integrate with calculate API, test with sample PDFs
- **Week 3**: Add validation, error handling, user feedback
- **Week 4**: Launch beta, monitor usage and costs

---

## Security Considerations

1. **API Key Management**: Store ANTHROPIC_API_KEY in environment variables
2. **File Size Limits**: Enforce 10MB max (same as P60)
3. **Rate Limiting**: Prevent abuse of AI parsing
4. **Data Privacy**: PDFs processed by Claude API (check Anthropic's privacy policy)
   - Consider adding user consent checkbox
   - Alternative: Self-host OCR + open-source LLM (more complex, expensive)

---

## Conclusion

**PDF support is absolutely viable and recommended.** Use Claude Vision API following your existing P60 parser pattern. The cost is negligible (~half a penny per PDF), reliability is high, and it will work with any broker format without maintaining complex parsing logic.

**Next Steps**:
1. Create `broker-pdf-parser.js` based on `p60-parser.js`
2. Add PDF support to file upload UI
3. Test with real broker statements
4. Launch as beta feature with user feedback

This approach balances cost, reliability, and development effort perfectly.
