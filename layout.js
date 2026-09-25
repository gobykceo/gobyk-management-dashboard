import { Manrope } from "next/font/google";

const manrope = Manrope({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "GoBYK Management Dashboard",
  description: "Live consolidated view of GoBYK branch performance",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={manrope.className}
        style={{
          background: "#000000",
          color: "#FFFFFF",
          margin: 0,
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
