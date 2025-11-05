"use client";
import Link from "next/link";
import { useCart } from "@/lib/cart";

export default function Navbar() {
  const cart = useCart();
  const count = (cart as any)?.lines?.length ?? (cart as any)?.items?.length ?? 0;

  const openCart = () => {
    if (typeof (cart as any).open === "function") (cart as any).open();
  };

  return (
    <header style={{
      position:"sticky", top:0, zIndex:50, backdropFilter:"saturate(180%) blur(8px)",
      background:"rgba(11,15,20,.7)", borderBottom:"1px solid #1f2a37"
    }}>
      <div className="container" style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0"}}>
        <Link href="/" style={{textDecoration:"none"}}>
          <strong style={{fontWeight:900, letterSpacing:.3, fontSize:"1.05rem"}}>Misterfood</strong>
        </Link>
        <nav style={{display:"flex", gap:10}}>
          <Link href="/menu" className="chip">Menu</Link>
          <button className="btn btn-primary" onClick={openCart}>
            Voir mon panier {count ? `(${count})` : ""}
          </button>
        </nav>
      </div>
    </header>
  );
}
