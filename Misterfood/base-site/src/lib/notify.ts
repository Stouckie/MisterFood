import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import twilio from 'twilio';
// ⛔️ plus d'import de OrderItem

const resendKey = process.env.RESEND_API_KEY || '';
const resend = resendKey ? new Resend(resendKey) : null;

const twilioSid  = process.env.TWILIO_ACCOUNT_SID || '';
const twilioTok  = process.env.TWILIO_AUTH_TOKEN || '';
const tClient    = (twilioSid && twilioTok) ? twilio(twilioSid, twilioTok) : null;

function eur(cents: number, curr = 'EUR') {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: curr }).format((cents || 0) / 100);
  } catch {
    return `${(cents||0)/100} ${curr}`;
  }
}

export async function notifyMerchant(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, merchant: true },
  });
  if (!order) return;

  const m = order.merchant;
  const subject = `Nouvelle commande #${order.id.slice(0,8)} — ${eur(order.amountTotal, order.currency.toUpperCase())}`;

  // on ne lit que name, unitAmount, quantity -> on type minimal
  const lines = order.items
    .map((i: { name: string; unitAmount: number; quantity: number }) =>
      `• ${i.quantity}× ${i.name} — ${eur(i.unitAmount * i.quantity, order.currency.toUpperCase())}`
    )
    .join('\n');

  const textBody =
`✅ Paiement confirmé

Commande: ${order.id}
Total: ${eur(order.amountTotal, order.currency.toUpperCase())}

Items:
${lines}

Statut: ${order.status}
Date: ${new Date(order.createdAt).toLocaleString('fr-FR')}
`;

  const htmlBody =
`<h2>Paiement confirmé ✅</h2>
<p><b>Commande:</b> ${order.id}<br/>
<b>Total:</b> ${eur(order.amountTotal, order.currency.toUpperCase())}<br/>
<b>Statut:</b> ${order.status}<br/>
<b>Date:</b> ${new Date(order.createdAt).toLocaleString('fr-FR')}</p>
<hr/>
<ul>${
  order.items
    .map((i: { name: string; unitAmount: number; quantity: number }) =>
      `<li>${i.quantity}× ${i.name} — ${eur(i.unitAmount * i.quantity, order.currency.toUpperCase())}</li>`
    )
    .join('')
}</ul>
`;

  // EMAIL via Resend
  if (m.notifyEmailEnabled && m.notifyEmail && resend) {
    try {
      await resend.emails.send({
        from: process.env.NOTIFY_EMAIL_FROM || 'no-reply@example.com',
        to: [m.notifyEmail],
        subject,
        html: htmlBody,
        text: textBody,
      });
    } catch (e) {
      console.error('Notify email error:', e);
    }
  }

  // SMS via Twilio
  if (m.notifySmsEnabled && m.notifyPhone && tClient && process.env.TWILIO_FROM) {
    try {
      await tClient.messages.create({
        from: process.env.TWILIO_FROM!,
        to: m.notifyPhone,
        body: textBody,
      });
    } catch (e) {
      console.error('Notify SMS error:', e);
    }
  }

  // WhatsApp via Twilio
  if (m.notifyWhatsAppEnabled && m.notifyPhone && tClient && process.env.TWILIO_WHATSAPP_FROM) {
    try {
      await tClient.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM!}`,
        to: `whatsapp:${m.notifyPhone}`,
        body: textBody,
      });
    } catch (e) {
      console.error('Notify WhatsApp error:', e);
    }
  }
}
