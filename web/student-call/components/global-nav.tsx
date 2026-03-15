"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function GlobalNav() {
  const pathname = usePathname();
  const router = useRouter();
  // Fast sync check from localStorage, then confirm with Supabase
  const [signedIn, setSignedIn] = useState(() =>
    typeof window !== "undefined" ? !!localStorage.getItem("livesesh_displayName") : false
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(!!session?.user);
    });
  }, []);

  // Don't show nav on the room/call page
  if (pathname.startsWith("/room/")) return null;

  const startSession = () => {
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
          {signedIn && (
            <Link href="/docs" className={`nav-link ${pathname === "/docs" ? "active" : ""}`}>
              Project Docs
            </Link>
          )}
          {signedIn ? (
            <button className="nav-btn" onClick={startSession}>Start Session</button>
          ) : (
            <Link href="/" className="nav-btn nav-btn-signin">Sign In</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
