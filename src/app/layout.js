import "./globals.css";

export const metadata = {
  title: "UK Capital Gains Tax Calculator",
  description: "Calculate your UK Capital Gains Tax with HMRC-compliant share matching rules. Supports Trading 212, Interactive Brokers, Freetrade, and more.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
