"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ADMIN_PASSWORD = "Lumiere26";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPw,   setShowPw]   = useState(false);
  const router = useRouter();

  function handleLogin() {
    if (!password) return;
    setLoading(true);
    setError("");

    setTimeout(() => {
      if (password === ADMIN_PASSWORD) {
        localStorage.setItem("auth", "true");
        router.push("/admin");
      } else {
        setError("Incorrect password. Please try again.");
        setLoading(false);
      }
    }, 600); // slight delay for feel
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#020617",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* Background glow orbs */}
      <div style={{
        position: "absolute", top: "15%", left: "20%",
        width: 400, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(212,175,55,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "10%", right: "15%",
        width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(212,175,55,0.05) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Login card */}
      <div style={{
        width: "100%", maxWidth: 420,
        margin: "0 16px",
        background: "linear-gradient(160deg, rgba(212,175,55,0.10), rgba(255,255,255,0.03))",
        border: "1px solid rgba(212,175,55,0.22)",
        borderRadius: 28,
        padding: "44px 40px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.08)",
        position: "relative",
      }}>

        {/* Top gold line */}
        <div style={{
          position: "absolute", top: 0, left: "10%", right: "10%", height: 2,
          background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.6), transparent)",
          borderRadius: 2,
        }} />

        {/* Logo + title */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            fontSize: 52,
            filter: "drop-shadow(0 0 20px rgba(212,175,55,0.5))",
            marginBottom: 16,
            lineHeight: 1,
          }}>
            🏰
          </div>
          <h1 style={{
            margin: 0, fontSize: 26, fontWeight: 800,
            color: "#f8e7b0", letterSpacing: 3,
            textShadow: "0 0 30px rgba(212,175,55,0.3)",
          }}>
            LUMIERE
          </h1>
          <p style={{
            margin: "8px 0 0", fontSize: 13,
            color: "#64748b", letterSpacing: 1,
          }}>
            GUILD MANAGEMENT SYSTEM
          </p>

          {/* Gold divider */}
          <div style={{
            margin: "20px auto 0",
            width: 48, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)",
          }} />
        </div>

        {/* Password field */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block", fontSize: 12, fontWeight: 600,
            color: "#94a3b8", marginBottom: 8, letterSpacing: 0.5,
          }}>
            PASSWORD
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showPw ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{
                width: "100%", padding: "13px 44px 13px 16px",
                borderRadius: 14, fontSize: 15,
                border: error
                  ? "1px solid rgba(239,68,68,0.5)"
                  : "1px solid rgba(212,175,55,0.2)",
                background: "rgba(0,0,0,0.3)",
                color: "#f8fafc", outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s",
                colorScheme: "dark",
              }}
              onFocus={(e) => {
                if (!error) e.target.style.borderColor = "rgba(212,175,55,0.5)";
              }}
              onBlur={(e) => {
                if (!error) e.target.style.borderColor = "rgba(212,175,55,0.2)";
              }}
            />
            {/* Show/hide toggle */}
            <button
              onClick={() => setShowPw(!showPw)}
              tabIndex={-1}
              style={{
                position: "absolute", right: 14, top: "50%",
                transform: "translateY(-50%)",
                background: "none", border: "none",
                color: "#64748b", cursor: "pointer",
                fontSize: 16, padding: 0, lineHeight: 1,
              }}
            >
              {showPw ? "🙈" : "👁"}
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              marginTop: 8, fontSize: 13,
              color: "#f87171", display: "flex", alignItems: "center", gap: 5,
            }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={loading || !password}
          style={{
            width: "100%", padding: "14px 0",
            borderRadius: 14, border: "none", cursor: loading || !password ? "not-allowed" : "pointer",
            background: loading || !password
              ? "rgba(212,175,55,0.25)"
              : "linear-gradient(135deg, #D4AF37, #F5D76E)",
            color: loading || !password ? "rgba(255,255,255,0.3)" : "#111827",
            fontWeight: 800, fontSize: 15,
            letterSpacing: 1,
            transition: "all 0.2s ease",
            boxShadow: loading || !password
              ? "none"
              : "0 8px 24px rgba(212,175,55,0.3)",
          }}
          onMouseEnter={(e) => {
            if (!loading && password)
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 12px 32px rgba(212,175,55,0.45)";
          }}
          onMouseLeave={(e) => {
            if (!loading && password)
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 24px rgba(212,175,55,0.3)";
          }}
        >
          {loading ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{
                width: 14, height: 14, borderRadius: "50%",
                border: "2px solid rgba(212,175,55,0.3)",
                borderTopColor: "#D4AF37",
                display: "inline-block",
                animation: "spin 0.7s linear infinite",
              }} />
              Authenticating...
            </span>
          ) : "ENTER GUILD"}
        </button>

        {/* Footer */}
        <p style={{
          marginTop: 28, marginBottom: 0,
          textAlign: "center", fontSize: 11,
          color: "#334155", letterSpacing: 0.3,
        }}>
          v2.0 • LUMIERE GMS • Restricted Access
        </p>
      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}