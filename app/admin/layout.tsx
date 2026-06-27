"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef } from "react";
import { Toaster } from "react-hot-toast";

const NAV = [
  { href: "/admin",            icon: "📊", label: "Dashboard"       },
  { href: "/admin/members",    icon: "👥", label: "Members"         },
  { href: "/admin/attendance", icon: "📅", label: "Attendance"      },
  { href: "/admin/parties",    icon: "⚔️", label: "Party Organizer" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned]   = useState(false);
  const timer = useRef<NodeJS.Timeout | null>(null);
  const expanded = hovered || pinned;

  function onEnter() {
    if (timer.current) clearTimeout(timer.current);
    setHovered(true);
  }
  function onLeave() {
    if (!pinned) timer.current = setTimeout(() => setHovered(false), 200);
  }

  const isActive = (href: string) => path === href;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#020617" }}>
      <Toaster position="top-center" toastOptions={{
        style: { background: "#1e293b", color: "#f8fafc", border: "1px solid rgba(212,175,55,0.2)" },
      }} />

      {/* ── SIDEBAR ── */}
      <aside
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        style={{
          width: expanded ? 260 : 72,
          flexShrink: 0,
          transition: "width 0.38s cubic-bezier(0.22,1,0.36,1)",
          background: "linear-gradient(180deg, #0c1322 0%, #0f172a 100%)",
          borderRight: "1px solid rgba(212,175,55,0.12)",
          boxShadow: expanded
            ? "4px 0 32px rgba(0,0,0,0.5)"
            : "2px 0 12px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "sticky",
          top: 0,
          height: "100vh",
          zIndex: 50,
        }}
      >
        {/* BRAND */}
        <div style={{
          display: "flex", alignItems: "center",
          gap: 12, padding: "20px 16px 16px",
          borderBottom: "1px solid rgba(212,175,55,0.08)",
          minHeight: 72,
        }}>
          <span style={{
            fontSize: 28, minWidth: 40, textAlign: "center",
            filter: "drop-shadow(0 0 10px rgba(212,175,55,0.4))",
            flexShrink: 0,
          }}>
            🏰
          </span>

          <div style={{
            opacity: expanded ? 1 : 0,
            width: expanded ? 160 : 0,
            overflow: "hidden",
            transition: "all 0.3s ease",
            whiteSpace: "nowrap",
          }}>
            <div style={{
              fontSize: 18, fontWeight: 800, color: "#f8e7b0",
              letterSpacing: 2,
              textShadow: "0 0 16px rgba(212,175,55,0.3)",
            }}>
              LUMIERE
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, letterSpacing: 0.5 }}>
              Guild Management
            </div>
          </div>

          {/* Pin button — only visible when expanded */}
          {expanded && (
            <button
              onClick={() => setPinned(!pinned)}
              title={pinned ? "Unpin sidebar" : "Pin sidebar"}
              style={{
                marginLeft: "auto", flexShrink: 0,
                width: 30, height: 30, borderRadius: 8,
                border: pinned
                  ? "1px solid rgba(212,175,55,0.4)"
                  : "1px solid rgba(255,255,255,0.08)",
                background: pinned
                  ? "rgba(212,175,55,0.15)"
                  : "rgba(255,255,255,0.04)",
                color: pinned ? "#f8e7b0" : "#64748b",
                cursor: "pointer", fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
              }}
            >
              {pinned ? "📌" : "📍"}
            </button>
          )}
        </div>

        {/* NAV LINKS */}
        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map(({ href, icon, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 12px", borderRadius: 14,
                  textDecoration: "none", overflow: "hidden",
                  whiteSpace: "nowrap",
                  color: active ? "#f8e7b0" : "#94a3b8",
                  background: active
                    ? "linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))"
                    : "transparent",
                  border: active
                    ? "1px solid rgba(212,175,55,0.22)"
                    : "1px solid transparent",
                  fontWeight: active ? 700 : 400,
                  fontSize: 14,
                  transition: "all 0.25s ease",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                    (e.currentTarget as HTMLElement).style.color = "#f8fafc";
                    (e.currentTarget as HTMLElement).style.border = "1px solid rgba(255,255,255,0.08)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "#94a3b8";
                    (e.currentTarget as HTMLElement).style.border = "1px solid transparent";
                  }
                }}
              >
                {/* Active indicator bar */}
                {active && (
                  <div style={{
                    position: "absolute", left: 0, top: "20%", bottom: "20%",
                    width: 3, borderRadius: 99,
                    background: "linear-gradient(180deg, #D4AF37, #F5D76E)",
                    boxShadow: "0 0 8px rgba(212,175,55,0.6)",
                  }} />
                )}

                <span style={{
                  fontSize: 20, minWidth: 28, textAlign: "center", flexShrink: 0,
                  filter: active ? "drop-shadow(0 0 6px rgba(212,175,55,0.4))" : "none",
                }}>
                  {icon}
                </span>

                <span style={{
                  opacity: expanded ? 1 : 0,
                  transform: expanded ? "translateX(0)" : "translateX(-8px)",
                  transition: "all 0.28s cubic-bezier(0.22,1,0.36,1)",
                  letterSpacing: 0.2,
                }}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* FOOTER */}
        <div style={{
          padding: "14px 16px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            fontSize: 11, color: "#334155", whiteSpace: "nowrap",
            overflow: "hidden",
            opacity: expanded ? 0.8 : 0.5,
            transition: "opacity 0.3s",
          }}>
            {expanded ? "v2.0 • LUMIERE GMS" : "v2"}
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{
        flex: 1,
        padding: 28,
        overflowX: "hidden",
        minWidth: 0,
      }}>
        {children}
      </main>
    </div>
  );
}