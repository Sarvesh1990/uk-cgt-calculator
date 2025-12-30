# Google Ads Conversion Tracking Setup

This guide will help you set up Google Ads conversion tracking for the CGT calculation event.

## Current Status

✅ Google Ads base tracking code is installed in `src/app/layout.js`
✅ Conversion tracking library created at `src/lib/google-ads.js`
✅ Conversion event integrated in `src/components/steps/CGTStep.js`

## What's Tracked

When a user successfully calculates their CGT, the following conversion event is triggered:

- **Event Type**: Google Ads Conversion
- **Event Name**: `cgt_calculation_complete`
- **Data Sent**:
  - Value: Net gain amount (in GBP)
  - Currency: GBP
  - Transaction ID: Unique ID for deduplication
  - Tax year
  - Number of brokers used
  - Number of disposals
  - Net gain
  - Taxable gain

## Setup Steps

### 1. Create a Conversion Action in Google Ads

1. Log in to your Google Ads account
2. Click on **Goals** in the left menu
3. Click on **Conversions**
4. Click the **+ New conversion action** button
5. Select **Website** as the conversion source
6. Choose **Manual setup using code**
7. Configure your conversion action:
   - **Conversion name**: `CGT Calculation Complete` (or your preferred name)
   - **Category**: Select `Lead` or `Other`
   - **Value**: Select "Use different values for each conversion" (we send the net gain amount)
   - **Count**: Select "One" (each calculation should count once)
   - **Attribution model**: Choose your preferred model
8. Click **Create and continue**

### 2. Get Your Conversion Label

After creating the conversion action, Google will show you a conversion tag that looks like this:

```javascript
gtag('event', 'conversion', {
  'send_to': 'AW-939500252/abc123xyz',  // <-- This is your conversion ID/Label
  'value': 1.0,
  'currency': 'GBP'
});
```

The part after the slash (`abc123xyz` in the example above) is your **conversion label**.

### 3. Update the Code

Open `src/lib/google-ads.js` and find this line:

```javascript
const conversionLabel = 'CONVERSION_LABEL'; // Replace this!
```

Replace `'CONVERSION_LABEL'` with your actual conversion label:

```javascript
const conversionLabel = 'abc123xyz'; // Your actual label from Google Ads
```

### 4. Test the Conversion

1. Deploy your changes
2. Go through the CGT calculation flow on your website
3. Upload broker files and calculate CGT
4. Check in Google Ads:
   - Go to **Goals > Conversions**
   - You should see conversions appear within 24 hours (usually faster)
   - Use Google Tag Assistant Chrome extension for real-time testing

## Troubleshooting

### Conversions Not Showing Up

1. **Check browser console**: Look for `[Google Ads] Conversion tracked` messages
2. **Verify conversion label**: Make sure you copied the correct label from Google Ads
3. **Check ad blockers**: Ad blockers may prevent tracking
4. **Wait 24-48 hours**: Conversions can take time to appear in Google Ads

### Testing Locally

The conversion tracking will work on localhost, but conversions won't be attributed to any campaigns. For testing:

1. Open browser console
2. Look for console logs: `[Google Ads] Conversion tracked: <label>`
3. Use Google Tag Assistant Chrome extension

## Additional Events

The library also tracks these custom events:
- `cgt_calculation_complete` - Custom event with detailed CGT data
- `tax_summary_reached` - When user reaches final summary
- `pdf_download` - When user downloads PDF report

You can create additional conversion actions in Google Ads for these events if needed.

## Example Console Output

When working correctly, you should see in the browser console:

```
[Google Ads] Conversion tracked: abc123xyz {value: 1234.56, currency: "GBP", transaction_id: "cgt_1735598400000"}
[Google Ads] Event tracked: cgt_calculation_complete {tax_year: "2023-2024", brokers_count: 2, disposals_count: 5, ...}
```

## Next Steps

After setting up:
1. Monitor conversions in Google Ads
2. Create campaigns targeting the conversion
3. Optimize ad spend based on conversion data
4. Consider setting up conversion value rules in Google Ads

## Support

For issues with:
- **Google Ads setup**: Contact Google Ads support
- **Code implementation**: Check browser console for errors
- **Conversion not firing**: Ensure the CGT calculation completes successfully

## Files Modified

- `src/lib/google-ads.js` - Conversion tracking library
- `src/components/steps/CGTStep.js` - Integration point (line ~176)
- `src/app/layout.js` - Base Google Ads tracking code (already set up)
