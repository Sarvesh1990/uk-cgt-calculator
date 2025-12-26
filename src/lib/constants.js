// Shared constants across the app

export const BROKERS = [
  { id: 'schwab', name: 'Charles Schwab', icon: '🏦', description: 'Stock Plan Activity, RSU vestings' },
  { id: 'morgan-stanley', name: 'Morgan Stanley', icon: '🏛️', description: 'Stock Plan, RSU vestings' },
  { id: 'trading212', name: 'Trading 212', icon: '📈', description: 'UK investment platform' },
  { id: 'ibkr', name: 'Interactive Brokers', icon: '🌐', description: 'International broker' },
  { id: 'ig', name: 'IG', icon: '📊', description: 'UK trading & ISA platform' },
  { id: 'freetrade', name: 'Freetrade', icon: '📱', description: 'Commission-free trading' },
  { id: 'hl', name: 'Hargreaves Lansdown', icon: '🇬🇧', description: 'UK ISA & SIPP provider' },
  { id: 'generic', name: 'Generic CSV', icon: '📄', description: 'Custom CSV format' },
];

export const BROKER_ICONS = {
  'Charles Schwab': '🏦',
  'Morgan Stanley': '🏛️',
  'Trading 212': '📈',
  'Interactive Brokers': '🌐',
  'IG': '📊',
  'Freetrade': '📱',
  'Hargreaves Lansdown': '🇬🇧',
  'Unknown': '📄',
};

export const TAX_YEARS = ['2024/25', '2023/24', '2022/23', '2021/22'];

export const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return '£0.00';
  const sign = amount < 0 ? '-' : '';
  return `${sign}£${Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
