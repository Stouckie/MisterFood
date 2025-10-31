// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { CartProvider } from "@/lib/cart";
import Navbar from "@/components/Navbar";
import CartEmbed from "@/components/CartEmbed";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import ConsentManager from "@/components/ConsentManager";
import Footer from "@/components/Footer";
import ObservabilityClient from "@/components/ObservabilityClient";
import { getBusinessInfo } from "@/lib/business";
import { buildRestaurantSchema } from "@/lib/schema";

const business = getBusinessInfo();
const baseUrl = (process.env.APP_URL || "https://example.com").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: `${business.name} – Snack gourmand à ${business.city}`,
  description: `${business.name} propose une carte street-food fraîchement préparée à ${business.city}. Commandez en ligne pour une livraison rapide ou un retrait sur place.`,
  openGraph: {
    title: `${business.name} – Snack gourmand à ${business.city}`,
    description: `${business.name} prépare des snacks et menus à emporter ou en livraison à ${business.city}.`,
    url: baseUrl,
    siteName: business.name,
    locale: "fr_FR",
    type: "restaurant",
  },
  alternates: {
    canonical: baseUrl,
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const schema = await buildRestaurantSchema(baseUrl);

  return (
    <html lang="fr">
      <body>
        <ObservabilityClient />
        <AnalyticsProvider />
        <ConsentManager />
        <CartProvider
          config={{
            merchantId: "dev",
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
          <Footer />
        </CartProvider>
        <script type="application/ld+json" suppressHydrationWarning>
          {JSON.stringify(schema)}
        </script>
      </body>
    </html>
  );
}
