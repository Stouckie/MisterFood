// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { CartProvider } from "@/lib/cart";
import Navbar from "@/components/Navbar";
import CartEmbed from "@/components/CartEmbed"; // ✅ garde l'embed

export const metadata: Metadata = {
  title: "Misterfood",
  description: "Menu",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <CartProvider
          config={{
            merchantId: "dev", // ⚠️ ton vrai merchantId ici
            currency: "eur",
            tipOptions: [0, 5, 10],
            allowDelivery: false,
            serviceFeeMinor: 0,
            deliveryFeeMinor: 0,
          }}
        >
          <Navbar />
          <div className="container">
            <div className="content-grid">
              <main className="content-area">{children}</main>
              <aside className="cart-col">
                <CartEmbed currency="eur" tipOptions={[0, 5, 10]} allowDelivery={false} />
              </aside>
            </div>
          </div>
        </CartProvider>
      </body>
    </html>
  );
}
