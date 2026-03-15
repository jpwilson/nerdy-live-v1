"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function GlobalNav() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  // Don't show nav on the room/call page
  if (pathname.startsWith("/room/")) return null;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(!!session?.user);
    });
  }, []);

  return (
    <nav className="global-nav">
      <div className="global-nav-inner">
        <Link href="/" className="nav-logo">LiveSesh AI</Link>
        <div className="nav-links">
          {signedIn && (
            <>
              <Link href="/dashboard" className={`nav-link ${pathname === "/dashboard" ? "active" : ""}`}>
                Dashboard
              </Link>
            </>
          )}
          <Link href="/docs" className={`nav-link ${pathname === "/docs" ? "active" : ""}`}>
            Docs
          </Link>
          {signedIn ? (
            <Link href="/dashboard" className="nav-btn">Join Room</Link>
          ) : (
            <Link href="/" className="nav-btn">Sign In</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
