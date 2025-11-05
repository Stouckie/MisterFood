import './globals.css';
import type { Metadata } from 'next';

import { CartProvider } from '@/lib/cart';
import Navbar from '@/components/Navbar';
import CartEmbed from '@/components/CartEmbed';
import Footer from '@/components/Footer';
import ObservabilityClient from '@/components/ObservabilityClient';
import { getBusinessInfo } from '@/lib/business';
import { buildRestaurantSchema } from '@/lib/schema';

// ⬇️ Import de composants CLIENT (wrappers)
import HydrationPing from '@/components/HydrationPing';
import ClientConsent from '@/components/ClientConsent';

const business = getBusinessInfo();
const baseUrl = (process.env.APP_URL || 'https://example.com').replace(/\/$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: `${business.name} – Snack gourmand à ${business.city}`,
  description: `${business.name} propose une carte street-food à ${business.city}.`,
  openGraph: {
    title: `${business.name} – Snack gourmand à ${business.city}`,
    description: `${business.name} prépare des snacks et menus (retrait/livraison) à ${business.city}.`,
    url: baseUrl,
    siteName: business.name,
    locale: 'fr_FR',
    type: 'website', // ✅ pas "restaurant"
  },
  alternates: { canonical: baseUrl },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const schema = await buildRestaurantSchema(baseUrl);

  return (
    <html lang="fr">
      <body>
        <ObservabilityClient />
        <CartProvider
          config={{
            merchantId: 'dev',
            currency: 'eur',
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

        {/* Debug + bandeau consent côté client */}
        <HydrationPing />
        <ClientConsent />

        <script type="application/ld+json" suppressHydrationWarning>
          {JSON.stringify(schema)}
        </script>
      </body>
    </html>
  );
}
