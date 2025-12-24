/**
 * CSV Parser for multiple UK broker formats
 * Supports: Trading 212, Interactive Brokers, Freetrade, Hargreaves Lansdown, Generic
 */

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

const brokerParsers = {
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
      const required = ["title", "type", "quantity", "price per share"];
      return required.every((h) => headers.some((header) => header.includes(h)));
    },
    parse: (rows, headers) => {
      const getIndex = (name) => headers.findIndex((h) => h.includes(name));

      const titleIdx = getIndex("title");
      const typeIdx = getIndex("type");
      const dateIdx = headers.findIndex((h) => h.includes("timestamp") || h.includes("date"));
      const quantityIdx = getIndex("quantity");
      const priceIdx = getIndex("price per share");
      const totalIdx = getIndex("total amount");
      const feeIdx = getIndex("fee");
      const currencyIdx = getIndex("currency");

      return rows
        .filter((row) => {
          const type = (row[typeIdx] || "").toLowerCase();
          return type === "buy" || type === "sell";
        })
        .map((row) => ({
          date: row[dateIdx] || "",
          type: row[typeIdx].toUpperCase(),
          symbol: (row[titleIdx] || "").split(" ")[0] || "",
          assetName: row[titleIdx],
          quantity: parseFloat((row[quantityIdx] || "0").replace(/[^0-9.-]/g, "")) || 0,
          pricePerUnit: parseFloat((row[priceIdx] || "0").replace(/[^0-9.-]/g, "")) || 0,
          totalAmount: totalIdx !== -1 ? parseFloat((row[totalIdx] || "0").replace(/[^0-9.-]/g, "")) : null,
          fees: feeIdx !== -1 ? parseFloat((row[feeIdx] || "0").replace(/[^0-9.-]/g, "")) || 0 : 0,
          currency: currencyIdx !== -1 ? row[currencyIdx] : "GBP",
          exchangeRate: 1,
          broker: "Freetrade",
        }));
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

  const parserOrder = ["trading212", "interactiveBrokers", "freetrade", "hargreavesLansdown", "generic"];

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
