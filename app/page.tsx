import { redirect } from "next/navigation";

export default function Home() {
  // Redirige l'accueil vers la page menu
  redirect("/menu");
}
