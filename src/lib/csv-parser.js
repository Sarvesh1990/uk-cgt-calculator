/**
 * File Parser for multiple UK broker formats
 * Supports: CSV and XLSX files
 * Brokers: Trading 212, Interactive Brokers, Freetrade, Hargreaves Lansdown, Charles Schwab, Morgan Stanley, IG, Generic
 */

import * as XLSX from 'xlsx';

/**
 * Convert Excel serial date number to ISO date string
 * Excel dates are stored as days since Dec 30, 1899 (with a bug for 1900 leap year)
 * @param {number} serial - Excel serial date number
 * @returns {string} - ISO date string (YYYY-MM-DD) or datetime string
 */
function excelSerialToDate(serial) {
  // Excel's epoch is December 30, 1899
  // But there's a bug where Excel thinks 1900 was a leap year, so we need to adjust
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Dec 30, 1899

  // Handle the Excel leap year bug (dates after Feb 28, 1900 need adjustment)
  const adjustedSerial = serial > 60 ? serial - 1 : serial;

  // Calculate the date
  const date = new Date(excelEpoch.getTime() + adjustedSerial * 24 * 60 * 60 * 1000);

  // Check if there's a time component (decimal part)
  const hasTime = serial % 1 !== 0;

  if (hasTime) {
    // Return datetime in ISO format
    return date.toISOString().replace('T', ' ').slice(0, 19);
  } else {
    // Return just the date
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Check if a value looks like an Excel serial date
 * Excel dates for years 2000-2100 are roughly between 36526 and 73050
 * @param {any} value - The value to check
 * @param {string} header - The column header (to help identify date columns)
 * @returns {boolean}
 */
function isExcelSerialDate(value, header = '') {
  if (typeof value !== 'number') return false;

  // Check if the header suggests this is a date column
  const dateHeaders = ['date', 'time', 'timestamp', 'created', 'trade date', 'settlement'];
  const isDateColumn = dateHeaders.some(h => header.includes(h));

  // Excel serial dates for reasonable years (1990-2100) are between ~32874 and ~73050
  // Also check for datetime values which include decimals
  const isInDateRange = value >= 32874 && value <= 73050;

  return isDateColumn && isInDateRange;
}

/**
 * Parse XLSX file and convert to CSV-like structure
 * @param {ArrayBuffer} buffer - The file buffer
 * @returns {Object} - { headers: string[], rows: string[][] }
 */
export function parseXLSX(buffer) {
  // Read with cellDates option to try to get dates as JS Date objects
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  // Get the first sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON with header option and raw values
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });

  if (jsonData.length === 0) {
    return { headers: [], rows: [] };
  }

  // First row is headers
  const headers = jsonData[0].map(h => String(h).toLowerCase().trim());

  // Rest are data rows, convert all values to strings with special handling for dates
  const rows = jsonData.slice(1)
    .filter(row => row.some(cell => cell !== '')) // Filter empty rows
    .map(row => row.map((cell, colIndex) => {
      // If it's already a Date object, format it
      if (cell instanceof Date) {
        // Check if it has a time component
        const hours = cell.getHours();
        const minutes = cell.getMinutes();
        const seconds = cell.getSeconds();

        if (hours === 0 && minutes === 0 && seconds === 0) {
          // Just a date
          return cell.toISOString().slice(0, 10);
        } else {
          // Date with time
          return cell.toISOString().replace('T', ' ').slice(0, 19);
        }
      }

      // If it's a number that looks like an Excel serial date, convert it
      if (typeof cell === 'number' && isExcelSerialDate(cell, headers[colIndex] || '')) {
        return excelSerialToDate(cell);
      }

      // For all other values, convert to string
      return String(cell).trim();
    }));

  return { headers, rows };
}

export function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parseRow = (line) => {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().trim());
  const rows = lines.slice(1).filter((line) => line.trim()).map(parseRow);

  return { headers, rows };
}

export const brokerParsers = {
  trading212: {
    name: "Trading 212",
    detect: (headers) => {
      const required = ["action", "time", "ticker", "no. of shares", "price / share"];
      return required.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const actionIdx = getIndex("action");
      const timeIdx = getIndex("time");
      const tickerIdx = getIndex("ticker");
      const nameIdx = getIndex("name");
      const sharesIdx = getIndex("no. of shares");
      const priceIdx = getIndex("price / share");
      const totalIdx = getIndex("total");
      const feeIdx = getIndex("fee") !== -1 ? getIndex("fee") : getIndex("stamp duty");
      const currencyIdx = getIndex("currency");
      const fxIdx = getIndex("exchange rate");

      return rows
        .filter((row) => {
          const action = (row[actionIdx] || "").toLowerCase();
          return action.includes("buy") || action.includes("sell");
        })
        .map((row) => {
          const action = (row[actionIdx] || "").toLowerCase();
          return {
            date: row[timeIdx] || "",
            type: action.includes("sell") ? "SELL" : "BUY",
            symbol: row[tickerIdx] || "",
            assetName: nameIdx !== -1 ? row[nameIdx] : undefined,
            quantity: parseFloat((row[sharesIdx] || "0").replace(/[^0-9.-]/g, "")) || 0,
            pricePerUnit: parseFloat((row[priceIdx] || "0").replace(/[^0-9.-]/g, "")) || 0,
            totalAmount: totalIdx !== -1 ? parseFloat((row[totalIdx] || "0").replace(/[^0-9.-]/g, "")) : null,
            fees: feeIdx !== -1 ? parseFloat((row[feeIdx] || "0").replace(/[^0-9.-]/g, "")) || 0 : 0,
            currency: currencyIdx !== -1 ? row[currencyIdx] : "GBP",
            exchangeRate: fxIdx !== -1 ? parseFloat(row[fxIdx]) || 1 : 1,
            broker: "Trading 212",
          };
        });
    },
  },

  interactiveBrokers: {
    name: "Interactive Brokers",
    detect: (headers) => {
      const required = ["symbol", "date/time", "quantity", "t. price"];
      return required.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const symbolIdx = getIndex("symbol");
      const dateIdx = getIndex("date/time");
      const quantityIdx = getIndex("quantity");
      const priceIdx = getIndex("t. price");
      const proceedsIdx = getIndex("proceeds");
      const commIdx = getIndex("comm/fee");
      const currencyIdx = getIndex("currency");

      return rows
        .filter((row) => {
          const qty = parseFloat(row[quantityIdx] || "0");
          return !isNaN(qty) && qty !== 0;
        })
        .map((row) => {
          const quantity = parseFloat(row[quantityIdx] || "0");
          return {
            date: row[dateIdx] || "",
            type: quantity < 0 ? "SELL" : "BUY",
            symbol: row[symbolIdx] || "",
            quantity: Math.abs(quantity),
            pricePerUnit: parseFloat(row[priceIdx] || "0") || 0,
            totalAmount: proceedsIdx !== -1 ? Math.abs(parseFloat((row[proceedsIdx] || "0").replace("-", ""))) : null,
            fees: commIdx !== -1 ? Math.abs(parseFloat((row[commIdx] || "0").replace("-", ""))) || 0 : 0,
            currency: currencyIdx !== -1 ? row[currencyIdx] : "USD",
            exchangeRate: 1,
            broker: "Interactive Brokers",
          };
        });
    },
  },

  freetrade: {
    name: "Freetrade",
    detect: (headers) => {
      // Freetrade format: Type, Timestamp, Ticker, ISIN, Title, Buy / Sell, Quantity, Price per Share, Total Amount, FX Fee Amount, FX Rate, Account Currency, Instrument Currency
      const required = ["type", "ticker", "quantity", "price per share", "total amount"];
      return required.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const typeIdx = getIndex("type");
      const buySellIdx = headers.findIndex((h) => h === "buy / sell" || h === "buy/sell");
      const tickerIdx = getIndex("ticker");
      const titleIdx = getIndex("title");
      const timestampIdx = getIndex("timestamp");
      const quantityIdx = getIndex("quantity");
      const priceIdx = getIndex("price per share");
      const totalIdx = getIndex("total amount");
      const fxFeeIdx = getIndex("fx fee amount");
      const fxRateIdx = getIndex("fx rate");
      const instrumentCurrencyIdx = getIndex("instrument currency");
      const accountCurrencyIdx = getIndex("account currency");

      return rows
        .filter((row) => {
          const type = (row[typeIdx] || "").toUpperCase();
          // Only process ORDER type transactions (BUY/SELL)
          return type === "ORDER";
        })
        .map((row) => {
          const buySell = (row[buySellIdx] || "").toUpperCase();
          const total = parseFloat((row[totalIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          const fxFee = fxFeeIdx !== -1 ? parseFloat((row[fxFeeIdx] || "0").replace(/[^0-9.-]/g, "")) || 0 : 0;
          const fxRate = fxRateIdx !== -1 ? parseFloat(row[fxRateIdx]) || 1 : 1;

          // Exclude FX fees from cost basis (matches Trading212/Schwab behavior)
          const totalExcludingFxFees = Math.abs(total) - Math.abs(fxFee);

          // Instrument currency is the stock's native currency (USD, EUR, GBP)
          const instrumentCurrency = instrumentCurrencyIdx !== -1 ? (row[instrumentCurrencyIdx] || "GBP").toUpperCase() : "GBP";
          // Account currency is always GBP for Freetrade
          const accountCurrency = accountCurrencyIdx !== -1 ? (row[accountCurrencyIdx] || "GBP").toUpperCase() : "GBP";

          return {
            date: row[timestampIdx] || "",
            type: buySell === "SELL" ? "SELL" : "BUY",
            symbol: row[tickerIdx] || "",
            assetName: titleIdx !== -1 ? row[titleIdx] : undefined,
            quantity: parseFloat((row[quantityIdx] || "0").replace(/[^0-9.-]/g, "")) || 0,
            pricePerUnit: parseFloat((row[priceIdx] || "0").replace(/[^0-9.-]/g, "")) || 0,
            totalAmount: totalExcludingFxFees, // Use total excluding FX fees for cost basis
            fees: fxFee, // Store FX fee separately
            currency: accountCurrency, // Freetrade settles in GBP
            exchangeRate: 1, // Already converted to GBP
            broker: "Freetrade",
          };
        });
    },
  },

  hargreavesLansdown: {
    name: "Hargreaves Lansdown",
    detect: (headers) => {
      const required = ["trade date", "sedol", "quantity", "price"];
      return required.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const dateIdx = getIndex("trade date");
      const sedolIdx = getIndex("sedol");
      const stockIdx = getIndex("stock");
      const typeIdx = getIndex("buy/sell");
      const quantityIdx = getIndex("quantity");
      const priceIdx = getIndex("price");
      const valueIdx = getIndex("value");
      const chargesIdx = getIndex("charges");

      return rows
        .filter((row) => {
          const type = (row[typeIdx] || "").toLowerCase();
          return type === "buy" || type === "sell" || type === "b" || type === "s";
        })
        .map((row) => {
          const type = (row[typeIdx] || "").toLowerCase();
          return {
            date: row[dateIdx] || "",
            type: type === "sell" || type === "s" ? "SELL" : "BUY",
            symbol: row[sedolIdx] || "",
            assetName: stockIdx !== -1 ? row[stockIdx] : undefined,
            quantity: parseFloat((row[quantityIdx] || "0").replace(/[^0-9.-]/g, "")) || 0,
            pricePerUnit: parseFloat((row[priceIdx] || "0").replace(/[^0-9.-]/g, "")) || 0,
            totalAmount: valueIdx !== -1 ? parseFloat((row[valueIdx] || "0").replace(/[^0-9.-]/g, "")) : null,
            fees: chargesIdx !== -1 ? parseFloat((row[chargesIdx] || "0").replace(/[^0-9.-]/g, "")) || 0 : 0,
            currency: "GBP",
            exchangeRate: 1,
            broker: "Hargreaves Lansdown",
          };
        });
    },
  },

  schwab: {
    name: "Charles Schwab",
    detect: (headers) => {
      // Schwab transaction history format: Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount
      const transactionHeaders = ["date", "action", "symbol", "quantity"];
      const hasTransactionFormat = transactionHeaders.every((h) =>
        headers.some((header) => header.includes(h))
      );

      // Check for "fees & comm" or "feesandcommissions" which are Schwab-specific
      const hasSchwabFees = headers.some((h) =>
        h.includes("fees & comm") || h.includes("feesandcommissions")
      );

      return hasTransactionFormat && hasSchwabFees;
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const dateIdx = getIndex("date");
      const actionIdx = getIndex("action");
      const symbolIdx = getIndex("symbol");
      const descriptionIdx = getIndex("description");
      const quantityIdx = getIndex("quantity");
      const priceIdx = getIndex("price");
      const feesIdx = headers.findIndex((h) => h.includes("fees & comm") || h.includes("feesandcommissions"));
      const amountIdx = getIndex("amount");

      // Schwab Equity Award specific columns
      const salePriceIdx = getIndex("saleprice");
      const fmvPriceIdx = getIndex("fairmarketvalueprice");

      return rows
        .filter((row) => {
          const action = (row[actionIdx] || "").toLowerCase();
          // Filter for buy/sell transactions
          // Schwab uses actions like "Buy", "Sell", "Stock Plan Activity" (for RSU vesting), "Lapse", "Deposit"
          return action.includes("buy") ||
                 action.includes("sell") ||
                 action.includes("stock plan activity") ||
                 action.includes("lapse") ||
                 action.includes("deposit");
        })
        .map((row) => {
          const action = (row[actionIdx] || "").toLowerCase();
          const quantity = parseFloat((row[quantityIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;

          // Determine transaction type
          let type = "BUY";
          let needsHistoricalPrice = false;

          if (action.includes("sell")) {
            type = "SELL";
          } else if (action.includes("stock plan activity") || action.includes("lapse") || action.includes("deposit")) {
            // RSU vesting is treated as a buy at fair market value
            type = "BUY";
            needsHistoricalPrice = true; // Flag to fetch closing price on vesting date
          }

          // Get price - remove $ symbol and parse
          // prefer sale price for sells, FMV for vesting, otherwise regular price
          let pricePerUnit = 0;
          if (type === "SELL" && salePriceIdx !== -1 && row[salePriceIdx]) {
            pricePerUnit = parseFloat((row[salePriceIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          } else if (type === "BUY" && fmvPriceIdx !== -1 && row[fmvPriceIdx]) {
            pricePerUnit = parseFloat((row[fmvPriceIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
            needsHistoricalPrice = false; // FMV is provided, no need to fetch
          } else if (priceIdx !== -1) {
            // Remove $ symbol and parse
            pricePerUnit = parseFloat((row[priceIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          }

          // If we have a price already, don't need to fetch historical
          if (pricePerUnit > 0) {
            needsHistoricalPrice = false;
            console.log(`[SCHWAB] Price from CSV for ${row[symbolIdx]} on ${row[dateIdx]}: $${pricePerUnit.toFixed(2)} (column: ${type === 'SELL' && salePriceIdx !== -1 ? 'salePrice' : (fmvPriceIdx !== -1 && row[fmvPriceIdx] ? 'FMV' : 'price')})`);
          } else {
            console.log(`[SCHWAB] No price in CSV for ${row[symbolIdx]} on ${row[dateIdx]}, will fetch from Yahoo Finance`);
          }

          // Parse amount (total value of transaction) - remove $ symbol
          const amount = amountIdx !== -1 && row[amountIdx]
            ? parseFloat((row[amountIdx] || "0").replace(/[^0-9.-]/g, ""))
            : null;

          // Parse fees - remove $ symbol
          const fees = feesIdx !== -1
            ? Math.abs(parseFloat((row[feesIdx] || "0").replace(/[^0-9.-]/g, ""))) || 0
            : 0;

          // Parse date - handle "MM/DD/YYYY as of MM/DD/YYYY" format
          let date = row[dateIdx] || "";
          if (date.includes(" as of ")) {
            // Use the "as of" date which is the actual effective date
            date = date.split(" as of ")[1];
          }

          // Normalize ticker (FB → META)
          let symbol = row[symbolIdx] || "";
          if (symbol === "FB") {
            symbol = "META";
          }

          // Determine currency - Schwab is primarily USD but some UK shares may be GBP
          // Check if there's a currency column, otherwise default to USD
          const currencyIdx = getIndex("currency");
          let currency = "USD";
          if (currencyIdx !== -1 && row[currencyIdx]) {
            currency = row[currencyIdx].toUpperCase().trim();
          }

          return {
            date,
            type,
            symbol,
            assetName: descriptionIdx !== -1 ? row[descriptionIdx] : undefined,
            quantity: Math.abs(quantity),
            pricePerUnit,
            totalAmount: amount !== null ? Math.abs(amount) : null,
            fees,
            currency,
            exchangeRate: 1,
            broker: "Charles Schwab",
            needsHistoricalPrice, // Flag for RSU vesting transactions
          };
        });
    },
  },

  morganStanley: {
    name: "Morgan Stanley",
    detect: (headers) => {
      // Morgan Stanley format: Action, Time, ISIN, Ticker, Name, No. of shares, Price / share, etc.
      const required = ["action", "ticker", "no. of shares", "price / share"];
      return required.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const actionIdx = getIndex("action");
      const timeIdx = getIndex("time");
      const tickerIdx = getIndex("ticker");
      const nameIdx = getIndex("name");
      const sharesIdx = getIndex("no. of shares");
      const priceIdx = getIndex("price / share");
      const totalIdx = getIndex("total");

      return rows
        .filter((row) => {
          const action = (row[actionIdx] || "").toLowerCase();
          const ticker = row[tickerIdx] || "";
          return (action.includes("buy") || action.includes("sell")) && ticker && ticker !== "N/A";
        })
        .map((row) => {
          const action = (row[actionIdx] || "").toLowerCase();
          const shares = parseFloat((row[sharesIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          const price = parseFloat((row[priceIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;

          // Morgan Stanley is USD only - calculate total from shares * price
          const totalInUSD = Math.abs(shares * price);

          return {
            date: row[timeIdx] || "",
            type: action.includes("sell") ? "SELL" : "BUY",
            symbol: row[tickerIdx] || "",
            assetName: nameIdx !== -1 ? row[nameIdx] : undefined,
            quantity: Math.abs(shares),
            pricePerUnit: price,
            totalAmount: totalInUSD,
            fees: 0,
            currency: "USD", // Morgan Stanley is USD only
            exchangeRate: 1,
            broker: "Morgan Stanley",
          };
        });
    },
  },

  ig: {
    name: "IG",
    detect: (headers) => {
      // IG format: Date, Reference, Description, Market, Size, Price, etc.
      // or Date, Market, Direction, Size, Open, Close, P/L
      const igHeaders1 = ["date", "market", "size", "price"];
      const igHeaders2 = ["date", "reference", "description", "market"];
      return igHeaders1.every((h) => headers.some((header) => header.includes(h))) ||
             igHeaders2.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const dateIdx = getIndex("date");
      const marketIdx = getIndex("market");
      const directionIdx = getIndex("direction");
      const descIdx = getIndex("description");
      const sizeIdx = getIndex("size");
      const priceIdx = getIndex("price");
      const openIdx = getIndex("open");
      const closeIdx = getIndex("close");
      const plIdx = getIndex("p/l");

      return rows
        .filter((row) => {
          // Filter for actual trades
          const size = parseFloat((row[sizeIdx] || "0").replace(/[^0-9.-]/g, ""));
          return !isNaN(size) && size !== 0;
        })
        .map((row) => {
          const size = parseFloat((row[sizeIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          let type = "BUY";

          // Determine type from direction column or size sign
          if (directionIdx !== -1) {
            const direction = (row[directionIdx] || "").toLowerCase();
            type = direction.includes("sell") ? "SELL" : "BUY";
          } else if (size < 0) {
            type = "SELL";
          }

          // Get price - prefer specific price column, fall back to open/close
          let pricePerUnit = 0;
          if (priceIdx !== -1 && row[priceIdx]) {
            pricePerUnit = parseFloat((row[priceIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          } else if (type === "SELL" && closeIdx !== -1) {
            pricePerUnit = parseFloat((row[closeIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          } else if (type === "BUY" && openIdx !== -1) {
            pricePerUnit = parseFloat((row[openIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          }

          // Extract symbol from market name (e.g., "Apple Inc" -> "AAPL")
          const market = row[marketIdx] || "";

          return {
            date: row[dateIdx] || "",
            type,
            symbol: market, // May need symbol extraction
            assetName: market,
            quantity: Math.abs(size),
            pricePerUnit,
            totalAmount: Math.abs(size * pricePerUnit),
            fees: 0,
            currency: "GBP", // IG is GBP
            exchangeRate: 1,
            broker: "IG",
          };
        });
    },
  },

  generic: {
    name: "Generic CSV",
    detect: () => true,
    parse: (rows, headers) => {
      const getIndex = (patterns) =>
        headers.findIndex((h) => patterns.some((p) => h.includes(p)));

      const dateIdx = getIndex(["date", "time", "timestamp"]);
      const typeIdx = getIndex(["type", "action", "side", "buy/sell"]);
      const symbolIdx = getIndex(["symbol", "ticker", "stock", "asset", "sedol", "isin"]);
      const nameIdx = getIndex(["name", "description", "title"]);
      const quantityIdx = getIndex(["quantity", "shares", "units", "amount", "no."]);
      const priceIdx = getIndex(["price", "rate", "cost"]);
      const totalIdx = getIndex(["total", "value", "proceeds"]);
      const feeIdx = getIndex(["fee", "commission", "charges"]);
      const currencyIdx = getIndex(["currency", "ccy"]);

      if (dateIdx === -1 || symbolIdx === -1 || quantityIdx === -1) {
        throw new Error("CSV must contain at least date, symbol/ticker, and quantity columns");
      }

      return rows
        .filter((row) => row[dateIdx] && row[symbolIdx] && row[quantityIdx])
        .map((row) => {
          let type = "BUY";
          if (typeIdx !== -1) {
            const typeVal = (row[typeIdx] || "").toLowerCase();
            if (typeVal.includes("sell") || typeVal === "s") {
              type = "SELL";
            }
          }

          const quantity = parseFloat((row[quantityIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          if (quantity < 0) type = "SELL";

          return {
            date: row[dateIdx] || "",
            type,
            symbol: row[symbolIdx] || "",
            assetName: nameIdx !== -1 ? row[nameIdx] : undefined,
            quantity: Math.abs(quantity),
            pricePerUnit: priceIdx !== -1 ? parseFloat((row[priceIdx] || "0").replace(/[^0-9.-]/g, "")) || 0 : 0,
            totalAmount: totalIdx !== -1 ? parseFloat((row[totalIdx] || "0").replace(/[^0-9.-]/g, "")) : null,
            fees: feeIdx !== -1 ? parseFloat((row[feeIdx] || "0").replace(/[^0-9.-]/g, "")) || 0 : 0,
            currency: currencyIdx !== -1 ? row[currencyIdx] : "GBP",
            exchangeRate: 1,
            broker: "Unknown",
          };
        });
    },
  },
};

export function detectAndParseCSV(content) {
  // Handle various input types
  if (!content) {
    throw new Error("No content provided");
  }

  // Ensure content is a string
  let contentStr = content;
  if (typeof content !== 'string') {
    contentStr = String(content);
  }

  // Remove BOM if present
  if (contentStr.charCodeAt(0) === 0xFEFF) {
    contentStr = contentStr.slice(1);
  }

  const { headers, rows } = parseCSV(contentStr);

  console.log('Parsed headers:', headers);
  console.log('Parsed rows count:', rows.length);

  if (headers.length === 0 || rows.length === 0) {
    throw new Error(`CSV file is empty or invalid. Headers: ${headers.length}, Rows: ${rows.length}`);
  }

  const parserOrder = ["trading212", "morganStanley", "interactiveBrokers", "freetrade", "hargreavesLansdown", "schwab", "ig", "generic"];

  for (const parserKey of parserOrder) {
    const parser = brokerParsers[parserKey];
    if (parser.detect(headers)) {
      return {
        broker: parser.name,
        transactions: parser.parse(rows, headers),
      };
    }
  }

  throw new Error("Unable to detect CSV format");
}

/**
 * Parse XLSX file and detect broker format
 * @param {ArrayBuffer} buffer - The file buffer
 * @returns {Object} - { broker: string, transactions: Array }
 */
export function detectAndParseXLSX(buffer) {
  const { headers, rows } = parseXLSX(buffer);

  console.log('XLSX Parsed headers:', headers);
  console.log('XLSX Parsed rows count:', rows.length);

  if (headers.length === 0 || rows.length === 0) {
    throw new Error(`XLSX file is empty or invalid. Headers: ${headers.length}, Rows: ${rows.length}`);
  }

  const parserOrder = ["trading212", "morganStanley", "interactiveBrokers", "freetrade", "hargreavesLansdown", "schwab", "ig", "generic"];

  for (const parserKey of parserOrder) {
    const parser = brokerParsers[parserKey];
    if (parser.detect(headers)) {
      return {
        broker: parser.name,
        transactions: parser.parse(rows, headers),
      };
    }
  }

  throw new Error("Unable to detect XLSX format");
}

/**
 * Unified file parser that handles both CSV and XLSX files
 * @param {File|Blob} file - The file object
 * @returns {Promise<Object>} - { broker: string, transactions: Array }
 */
export async function parseFile(file) {
  const fileName = file.name?.toLowerCase() || '';

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    // Parse as Excel file
    const buffer = await file.arrayBuffer();
    return detectAndParseXLSX(buffer);
  } else {
    // Parse as CSV (default)
    const content = await file.text();
    return detectAndParseCSV(content);
  }
}

/**
 * List of common UK stocks/ETFs - dividends from these are UK dividends
 * This is a simplified list - in production, you'd use ISIN or exchange data
 */
const UK_SYMBOLS = new Set([
  // FTSE 100 common stocks
  'SHEL', 'SHELL', 'BP', 'BP.', 'HSBA', 'HSBC', 'AZN', 'ULVR', 'GSK', 'RIO',
  'BATS', 'DGE', 'LSEG', 'REL', 'NG', 'VOD', 'LLOY', 'BARC', 'NWG', 'STAN',
  'PRU', 'AVIVA', 'AV', 'GLEN', 'AAL', 'ANTO', 'III', 'SSE', 'CPG', 'IMB',
  'BT', 'BT.A', 'TSCO', 'SBRY', 'JD', 'OCDO', 'PSN', 'CRH', 'EXPN', 'MNDI',
  // UK ETFs
  'ISF', 'IUKD', 'VUKE', 'VMID', 'VFTSE', 'CUKX',
  // Other common UK
  'LAND', 'LGEN', 'SGRO', 'RMV', 'AUTO', 'SMDS', 'WTB', 'PHNX', 'HIK', 'ENT',
]);

/**
 * Determine if a dividend is from a UK or Foreign source
 * @param {Object} dividend - The dividend object with symbol, isin, etc.
 * @returns {string} - 'UK' or 'FOREIGN'
 */
function classifyDividendSource(dividend) {
  const symbol = (dividend.symbol || '').toUpperCase().replace('.L', '');

  // Check ISIN first (most reliable) - UK ISINs start with GB
  if (dividend.isin && dividend.isin.startsWith('GB')) {
    return 'UK';
  }

  // Check if it's a known UK symbol
  if (UK_SYMBOLS.has(symbol)) {
    return 'UK';
  }

  // Check currency - GBp (pence) suggests UK
  if (dividend.currency === 'GBp' || dividend.currency === 'GBX') {
    return 'UK';
  }

  // Default to foreign for USD, EUR, etc.
  return 'FOREIGN';
}

/**
 * Dividend parsers for each broker
 */
export const dividendParsers = {
  trading212: {
    name: "Trading 212",
    detect: (headers) => {
      const required = ["action", "time", "ticker"];
      return required.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const actionIdx = getIndex("action");
      const timeIdx = getIndex("time");
      const tickerIdx = getIndex("ticker");
      const nameIdx = getIndex("name");
      const totalIdx = getIndex("total");
      const currencyIdx = getIndex("currency");
      const isinIdx = getIndex("isin");
      const withheldIdx = getIndex("withholding tax");
      const fxIdx = getIndex("exchange rate");

      return rows
        .filter((row) => {
          const action = (row[actionIdx] || "").toLowerCase();
          return action.includes("dividend");
        })
        .map((row) => {
          const amount = parseFloat((row[totalIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          const withheld = withheldIdx !== -1
            ? Math.abs(parseFloat((row[withheldIdx] || "0").replace(/[^0-9.-]/g, ""))) || 0
            : 0;
          const currency = currencyIdx !== -1 ? row[currencyIdx] : "GBP";
          const exchangeRate = fxIdx !== -1 ? parseFloat(row[fxIdx]) || 1 : 1;

          const dividend = {
            date: row[timeIdx] || "",
            symbol: row[tickerIdx] || "",
            assetName: nameIdx !== -1 ? row[nameIdx] : undefined,
            isin: isinIdx !== -1 ? row[isinIdx] : undefined,
            grossAmount: amount + withheld, // Gross = net + withheld
            netAmount: amount,
            withholdingTax: withheld,
            currency,
            exchangeRate,
            amountGBP: currency === "GBP" ? amount : amount * exchangeRate,
            broker: "Trading 212",
          };

          dividend.source = classifyDividendSource(dividend);
          return dividend;
        });
    },
  },

  schwab: {
    name: "Charles Schwab",
    detect: (headers) => {
      const transactionHeaders = ["date", "action", "symbol", "quantity"];
      return transactionHeaders.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const dateIdx = getIndex("date");
      const actionIdx = getIndex("action");
      const symbolIdx = getIndex("symbol");
      const descriptionIdx = getIndex("description");
      const amountIdx = getIndex("amount");

      return rows
        .filter((row) => {
          const action = (row[actionIdx] || "").toLowerCase();
          return action.includes("dividend") || action.includes("qual div") || action.includes("cash div");
        })
        .map((row) => {
          let amount = amountIdx !== -1 && row[amountIdx]
            ? parseFloat((row[amountIdx] || "0").replace(/[^0-9.-]/g, ""))
            : 0;

          // Schwab amounts are typically in USD
          let symbol = row[symbolIdx] || "";
          if (symbol === "FB") symbol = "META";

          // Parse date
          let date = row[dateIdx] || "";
          if (date.includes(" as of ")) {
            date = date.split(" as of ")[1];
          }

          const dividend = {
            date,
            symbol,
            assetName: descriptionIdx !== -1 ? row[descriptionIdx] : undefined,
            grossAmount: Math.abs(amount),
            netAmount: Math.abs(amount), // Schwab shows net after any withholding
            withholdingTax: 0, // Usually shown separately or not at all
            currency: "USD",
            exchangeRate: 1, // Will be converted later
            amountGBP: 0, // Will be calculated after FX conversion
            broker: "Charles Schwab",
          };

          dividend.source = classifyDividendSource(dividend);
          return dividend;
        });
    },
  },

  interactiveBrokers: {
    name: "Interactive Brokers",
    detect: (headers) => {
      const required = ["symbol", "date/time", "quantity"];
      return required.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const symbolIdx = getIndex("symbol");
      const dateIdx = getIndex("date/time");
      const amountIdx = getIndex("amount");
      const currencyIdx = getIndex("currency");
      const descIdx = getIndex("description");

      return rows
        .filter((row) => {
          const desc = (row[descIdx] || "").toLowerCase();
          return desc.includes("dividend") || desc.includes("payment in lieu");
        })
        .map((row) => {
          const amount = parseFloat((row[amountIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          const currency = currencyIdx !== -1 ? row[currencyIdx] : "USD";

          const dividend = {
            date: row[dateIdx] || "",
            symbol: row[symbolIdx] || "",
            assetName: descIdx !== -1 ? row[descIdx] : undefined,
            grossAmount: Math.abs(amount),
            netAmount: Math.abs(amount),
            withholdingTax: 0,
            currency,
            exchangeRate: 1,
            amountGBP: currency === "GBP" ? Math.abs(amount) : 0,
            broker: "Interactive Brokers",
          };

          dividend.source = classifyDividendSource(dividend);
          return dividend;
        });
    },
  },

  freetrade: {
    name: "Freetrade",
    detect: (headers) => {
      const required = ["type", "ticker", "total amount"];
      return required.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const typeIdx = getIndex("type");
      const tickerIdx = getIndex("ticker");
      const titleIdx = getIndex("title");
      const timestampIdx = getIndex("timestamp");
      const totalIdx = getIndex("total amount");
      const isinIdx = getIndex("isin");
      const currencyIdx = getIndex("account currency");

      return rows
        .filter((row) => {
          const type = (row[typeIdx] || "").toUpperCase();
          return type === "DIVIDEND";
        })
        .map((row) => {
          const amount = parseFloat((row[totalIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          const currency = currencyIdx !== -1 ? (row[currencyIdx] || "GBP").toUpperCase() : "GBP";

          const dividend = {
            date: row[timestampIdx] || "",
            symbol: row[tickerIdx] || "",
            assetName: titleIdx !== -1 ? row[titleIdx] : undefined,
            isin: isinIdx !== -1 ? row[isinIdx] : undefined,
            grossAmount: Math.abs(amount),
            netAmount: Math.abs(amount),
            withholdingTax: 0,
            currency,
            exchangeRate: 1,
            amountGBP: currency === "GBP" ? Math.abs(amount) : 0,
            broker: "Freetrade",
          };

          dividend.source = classifyDividendSource(dividend);
          return dividend;
        });
    },
  },

  generic: {
    name: "Generic CSV",
    detect: () => true,
    parse: (rows, headers) => {
      const getIndex = (patterns) =>
        headers.findIndex((h) => patterns.some((p) => h.includes(p)));

      const dateIdx = getIndex(["date", "time", "timestamp"]);
      const typeIdx = getIndex(["type", "action"]);
      const symbolIdx = getIndex(["symbol", "ticker", "stock"]);
      const amountIdx = getIndex(["amount", "total", "value", "dividend"]);
      const currencyIdx = getIndex(["currency", "ccy"]);

      if (dateIdx === -1 || amountIdx === -1) {
        return []; // Can't parse dividends without date and amount
      }

      return rows
        .filter((row) => {
          if (typeIdx === -1) return false;
          const type = (row[typeIdx] || "").toLowerCase();
          return type.includes("dividend");
        })
        .map((row) => {
          const amount = parseFloat((row[amountIdx] || "0").replace(/[^0-9.-]/g, "")) || 0;
          const currency = currencyIdx !== -1 ? row[currencyIdx] : "GBP";

          const dividend = {
            date: row[dateIdx] || "",
            symbol: symbolIdx !== -1 ? row[symbolIdx] : "UNKNOWN",
            grossAmount: Math.abs(amount),
            netAmount: Math.abs(amount),
            withholdingTax: 0,
            currency,
            exchangeRate: 1,
            amountGBP: currency === "GBP" ? Math.abs(amount) : 0,
            broker: "Unknown",
          };

          dividend.source = classifyDividendSource(dividend);
          return dividend;
        });
    },
  },
};

/**
 * Parse dividends from CSV content
 * @param {string} content - CSV content
 * @param {string} parserKey - The parser to use (e.g., 'trading212', 'schwab')
 * @returns {Array} - Array of dividend objects
 */
export function parseDividends(rows, headers, parserKey = 'generic') {
  const parser = dividendParsers[parserKey] || dividendParsers.generic;

  if (!parser.detect(headers)) {
    return [];
  }

  return parser.parse(rows, headers);
}
