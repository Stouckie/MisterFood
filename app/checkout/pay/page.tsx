import CheckoutPaymentForm from '@/components/CheckoutPaymentForm';

function parseNumber(value: string | string[] | undefined) {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

export default function CheckoutPayPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const clientSecretRaw = searchParams['client_secret'];
  const clientSecret = Array.isArray(clientSecretRaw) ? clientSecretRaw[0] : clientSecretRaw;

  if (!clientSecret) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Paiement indisponible</h1>
        <p>Le lien de paiement est incomplet. Retournez au panier pour réessayer.</p>
      </main>
    );
  }

  const orderIdRaw = searchParams['order_id'];
  const orderId = Array.isArray(orderIdRaw) ? orderIdRaw[0] : orderIdRaw;
  const amountMinor = parseNumber(searchParams['amount']);
  const currencyRaw = searchParams['currency'];
  const currency = Array.isArray(currencyRaw) ? currencyRaw[0] : currencyRaw;

  return (
    <main style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
      <CheckoutPaymentForm
        clientSecret={clientSecret}
        orderId={orderId}
        amountMinor={amountMinor}
        currency={currency}
      />
    </main>
  );
}
