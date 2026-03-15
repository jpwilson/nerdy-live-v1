"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function GlobalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  // Don't show nav on the room/call page
  if (pathname.startsWith("/room/")) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(!!session?.user);
    });
  }, []);

  const joinRoom = () => {
    const name = localStorage.getItem("livesesh_displayName") || "Tutor";
    const room = localStorage.getItem("livesesh_roomId") || "demo-room";
    const role = localStorage.getItem("livesesh_role") || "tutor_preview";
    const params = new URLSearchParams({ name, role });
    router.push(`/room/${encodeURIComponent(room)}?${params.toString()}`);
  };

  return (
    <nav className="global-nav">
      <div className="global-nav-inner">
        <div className="nav-brand">
          <Link href={signedIn ? "/dashboard" : "/"} className="nav-logo">LiveSesh AI</Link>
          <span className="nav-tagline">for <span className="nav-nerdy">nerdy</span> with <span className="nav-liveai">Live+AI</span></span>
        </div>
        <div className="nav-links">
          {signedIn && (
            <Link href="/dashboard" className={`nav-link ${pathname === "/dashboard" ? "active" : ""}`}>
              Dashboard
            </Link>
          )}
          <Link href="/docs" className={`nav-link ${pathname === "/docs" ? "active" : ""}`}>
            Docs
          </Link>
          {signedIn ? (
            <button className="nav-btn" onClick={joinRoom}>Join Room</button>
          ) : (
            <Link href="/" className="nav-btn">Sign In</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
