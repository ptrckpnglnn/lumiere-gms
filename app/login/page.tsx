"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const router = useRouter();

  const ADMIN_PASSWORD = "guild123"; // change this later

  function handleLogin() {
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem("auth", "true");
      router.push("/admin");
    } else {
      setError("Wrong password");
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>🔐 Admin Login</h1>

      <input
        type="password"
        placeholder="Enter password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: 10, marginTop: 20, width: 250 }}
      />

      <br />

      <button
        onClick={handleLogin}
        style={{
          marginTop: 20,
          padding: 10,
          background: "black",
          color: "white",
          border: "none",
        }}
      >
        Login
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}