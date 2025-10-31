'use client';
import { useState, useEffect } from 'react';
import { postJSON } from '@/lib/fetch';

export default function Admin() {
  const [merchantId, setMerchantId] = useState('');

  useEffect(()=>{
    const m = new URLSearchParams(location.search).get('merchantId');
    if (m) setMerchantId(m);
  },[]);

  async function connectStripe() {
    const { url } = await postJSON<{url:string}>('/api/connect/onboard', { merchantId });
    location.href = url;
  }

  async function testCheckout() {
    const { clientSecret, orderId, amount, currency } = await postJSON<{
      clientSecret: string;
      orderId: string;
      amount: number;
      currency: string;
    }>('/api/checkout/create', {
      merchantId,
      items: [{ name: 'Menu Tacos', unitAmount: 1299, quantity: 1 }],
      currency: 'eur',
    });
    const params = new URLSearchParams({
      client_secret: clientSecret,
      order_id: orderId,
      amount: String(amount),
      currency: currency.toLowerCase(),
    });
    location.href = `/checkout/pay?${params.toString()}`;
  }

  return (
    <main style={{padding: 24}}>
      <h1>Admin</h1>
      <p>1) Renseigne un <code>merchantId</code> existant.</p>
      <input
        placeholder='merchantId'
        value={merchantId}
        onChange={(e)=>setMerchantId(e.target.value)}
        style={{padding:8, width:360, marginRight:12}}
      />
      <div style={{marginTop:12, display:'flex', gap:12}}>
        <button onClick={connectStripe} disabled={!merchantId}>Connecter Stripe</button>
        <button onClick={testCheckout}  disabled={!merchantId}>Commande test</button>
      </div>
    </main>
  );
}
