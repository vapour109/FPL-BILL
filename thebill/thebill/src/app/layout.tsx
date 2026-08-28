import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Bill — FPL Draft side stakes",
  description: "Real events, real money. A running tab for your FPL Draft league.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
