import ClearCart from './ClearCart';

function pickValue(param?: string | string[]) {
  if (!param) return undefined;
  return Array.isArray(param) ? param[0] : param;
}

function parseAmount(value?: string) {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export default function Success({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const orderId = pickValue(searchParams?.order_id);
  const amountMinor = parseAmount(pickValue(searchParams?.amount));
  const currency = pickValue(searchParams?.currency)?.toLowerCase();

  return (
    <main style={{ padding: 24 }}>
      <ClearCart orderId={orderId} amountMinor={amountMinor} currency={currency} />
      <h1>Paiement réussi ✅</h1>
      {orderId && <p>Commande #{orderId} confirmée. Merci !</p>}
      {amountMinor != null && currency && (
        <p>Montant réglé : {(amountMinor / 100).toFixed(2)} {currency.toUpperCase()}</p>
      )}
      <a href='/'>Retour</a>
    </main>
  );
}
