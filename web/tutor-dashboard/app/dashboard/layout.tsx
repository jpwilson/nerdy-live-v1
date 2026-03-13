"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "\u2302" },
  { href: "/dashboard/students", label: "Students", icon: "\u263A" },
  { href: "/dashboard/sessions", label: "Sessions", icon: "\u23F1" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/");
      } else {
        setEmail(session.user.email ?? "");
        setReady(true);
      }
    });
  }, [router, supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  if (!ready) {
    return (
      <div className="auth-page">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <div
        className={`sidebar-overlay${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-brand">LiveSesh</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${isActive(item.href) ? " active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-email">{email}</span>
          <button className="signout-btn" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <div className="main-header">
          <button
            className="hamburger"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            &#9776;
          </button>
        </div>
        {children}
      </main>
    </div>
  );
}
