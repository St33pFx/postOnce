import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "../modules/auth/server";
export const dynamic = "force-dynamic";
export default async function Home(){try{if(await currentUser(await headers()))redirect("/drafts");}catch{/* anonymous */}return <main><p className="eyebrow">POSTONCE</p><h1>Prepara tus publicaciones en un solo lugar.</h1><p>Organiza tus drafts y conexiones para Instagram, TikTok y YouTube.</p><Link href="/login">Iniciar sesión</Link></main>;}
