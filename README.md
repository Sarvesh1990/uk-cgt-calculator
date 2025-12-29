# UK Capital Gains Tax Calculator 🇬🇧

A modern web application to calculate UK Capital Gains Tax with HMRC-compliant share matching rules. Built with Next.js and React, ready for Vercel deployment.

## Features

- ✅ **HMRC-Compliant Calculations**
  - Same-day rule matching
  - Bed and Breakfast rule (30-day)
  - Section 104 pool (average cost basis)

- ✅ **Multiple Broker Support**
  - Trading 212
  - Interactive Brokers
  - Freetrade
  - Hargreaves Lansdown
  - Generic CSV format

- ✅ **Tax Year Support**
  - 2024/25 (£3,000 exemption)
  - 2023/24 (£6,000 exemption)
  - 2022/23 (£12,300 exemption)
  - 2021/22 (£12,300 exemption)

- ✅ **Modern UI**
  - Drag & drop file upload
  - Responsive design
  - Dark theme
  - Export to JSON

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd uk-cgt-calculator
npm install
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Deploy to Vercel

1. Push your code to GitHub
2. Connect your repo to [Vercel](https://vercel.com)
3. Deploy automatically!

Or use the Vercel CLI:

```bash
npm install -g vercel
vercel
```

## Firebase Setup (Optional)

To enable user authentication and data persistence:

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable Authentication and Firestore
3. Copy `.env.local.example` to `.env.local`
4. Fill in your Firebase config values

```bash
cp .env.local.example .env.local
```

## CSV Format Support

### Trading 212
The app automatically detects Trading 212 exports with columns:
- Action, Time, Ticker, Name, No. of shares, Price / share, etc.

### Interactive Brokers
Supports IB trade exports with columns:
- Symbol, Date/Time, Quantity, T. Price, Proceeds, Comm/Fee, etc.

### Generic CSV
Any CSV with these columns will work:
- Date (required)
- Symbol/Ticker (required)
- Quantity (required)
- Type (BUY/SELL)
- Price
- Fees

## UK CGT Rules Implemented

### 1. Same-Day Rule
Shares sold are first matched with shares bought on the same day.

### 2. Bed and Breakfast Rule
If not matched same-day, match with shares bought within 30 days AFTER the sale.

### 3. Section 104 Pool
Remaining shares are matched against the Section 104 pool (average cost basis of all shares held for more than 30 days).

## Tax Rates (2024/25)

| Rate Band | Shares/Other Assets | Residential Property |
|-----------|--------------------|--------------------|
| Basic Rate | 10% | 18% |
| Higher Rate | 20% | 24% |

Annual Exemption: £3,000

## Project Structure

```
uk-cgt-calculator/
├── src/
│   ├── app/
│   │   ├── api/calculate/route.js  # API endpoint
│   │   ├── layout.js
│   │   ├── page.js                  # Main React component
│   │   └── globals.css
│   ├── lib/
│   │   ├── csv-parser.js            # Multi-broker CSV parser
│   │   ├── cgt-engine.js            # CGT calculation engine
│   │   └── firebase.js              # Firebase config
│   └── components/
├── sample-data/
│   └── trading212-sample.csv        # Sample data for testing
├── public/
└── package.json
```

## Convert to Mobile App

This project is designed to be easily converted to a mobile app using:

1. **Expo/React Native** - Reuse the calculation logic
2. **Capacitor** - Wrap the Next.js app in a native shell

## Disclaimer

⚠️ This calculator is for informational purposes only and does not constitute tax advice. Tax calculations are estimates and may not reflect your actual tax liability. Please consult a qualified tax professional or HMRC for official guidance.

## License

MIT
