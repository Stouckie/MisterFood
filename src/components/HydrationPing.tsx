'use client';

export default function HydrationPing() {
  // petit log pour vérifier que le client se monte
  try { console.log('[HydrationPing] client mounted', { cookie: document.cookie }); } catch {}
  return (
    <div
      title="client OK"
      style={{
        position: 'fixed',
        right: 6,
        bottom: 6,
        width: 10,
        height: 10,
        borderRadius: 9999,
        background: '#22c55e',
        zIndex: 2147483647,
        pointerEvents: 'none',
      }}
    />
  );
}
