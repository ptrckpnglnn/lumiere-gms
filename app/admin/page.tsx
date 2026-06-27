"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { theme } from "../styles/theme";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const C = {
  gold: "#D4AF37", goldLight: "#F5D76E",
  text: "#F8FAFC", muted: "#CBD5E1",
};

function formatDate(raw: string) {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function isNewMember(member: any) {
  if (!member.joined_at) return false;
  return (Date.now() - new Date(member.joined_at).getTime()) / 86400000 <= 14;
}

function getMemberHealth(member: any, events: any[], attendance: any[]) {
  if (isNewMember(member)) return "new";
  if (member.health_override === "at_risk")  return "at_risk";
  if (member.health_override === "inactive") return "inactive";
  const getStatus = (eventId: string) => {
    const r = attendance.find((a: any) => a.member_id === member.id && a.event_id === eventId);
    return r ? r.status : "Absent";
  };
  const last4 = events.slice(0, 4).map((e: any) => getStatus(e.id));
  const last2 = events.slice(0, 2).map((e: any) => getStatus(e.id));
  if (last4.length >= 4 && last4.every((s) => s === "Absent")) return "inactive";
  if (last2.length >= 2 && last2.every((s) => s === "Absent")) return "at_risk";
  return "active";
}

function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1e293b", border: "1px solid rgba(212,175,55,0.35)",
      borderRadius: 12, padding: "10px 16px", color: "#f8fafc",
      fontSize: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", pointerEvents: "none",
    }}>
      <div style={{ color: "#94a3b8", marginBottom: 6, fontSize: 12 }}>{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: entry.color || "#D4AF37" }} />
          <span style={{ color: "#cbd5e1", fontSize: 13 }}>{entry.name}:</span>
          <span style={{ fontWeight: 700, color: "#F5D76E", fontSize: 16 }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [members,    setMembers]    = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [events,     setEvents]     = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const auth = localStorage.getItem("auth");
    if (auth !== "true") router.push("/login");
    else fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [m, a, e] = await Promise.all([
      supabase.from("members").select("*"),
      supabase.from("attendance").select("*"),
      supabase.from("events").select("*").order("date", { ascending: false }),
    ]);
    setMembers(m.data || []);
    setAttendance(a.data || []);
    setEvents(e.data || []);
    setLoading(false);
  }

  function logout() {
    localStorage.removeItem("auth");
    router.push("/login");
  }

  // ── DERIVED ──
  const recentEvents = events.slice(0, 3);

  const eventSummaries = recentEvents.map((ev) => ({
    ...ev,
    attendees: attendance.filter(
      (a) => a.event_id === ev.id && (a.status === "Present" || a.status === "Late")
    ).length,
  }));

  const membersWithHealth = members.map((m) => ({
    ...m, health: getMemberHealth(m, events, attendance),
  }));

  const newMembers      = membersWithHealth.filter((m) => m.health === "new");
  const atRiskMembers   = membersWithHealth.filter((m) => m.health === "at_risk");
  const inactiveMembers = membersWithHealth.filter((m) => m.health === "inactive");
  const activeMembers   = membersWithHealth.filter((m) => m.health === "active");

  const latest3 = events.slice(0, 3);
  const totalPossible = latest3.length * members.length;
  const actualPresent = latest3.reduce((sum, ev) =>
    sum + attendance.filter(
      (a) => a.event_id === ev.id && (a.status === "Present" || a.status === "Late")
    ).length, 0
  );
  const attendanceRate = totalPossible === 0
    ? 0 : Math.round((actualPresent / totalPossible) * 100);

  const attendanceChartData = recentEvents.slice().reverse().map((ev) => ({
    name: `${ev.name}\n${formatDate(ev.date)}`,
    Attendees: attendance.filter(
      (a) => a.event_id === ev.id && (a.status === "Present" || a.status === "Late")
    ).length,
  }));

  const classCounts: Record<string, number> = {};
  members.forEach((m) => {
    const c = m.class || "Unknown";
    classCounts[c] = (classCounts[c] || 0) + 1;
  });
  const classChartData = Object.entries(classCounts).map(([name, Count]) => ({ name, Count }));

  const classMinimums: Record<string, number> = {
    "High Wizard": 3, Professor: 2, Biochemist: 2,
    "High Priest": 2, Minstrel: 1, Gypsy: 1,
  };
  const recruitmentNeeds = Object.entries(classMinimums)
    .map(([className, minimum]) => {
      const current = members.filter((m) => m.class === className).length;
      return { className, minimum, current, shortage: Math.max(0, minimum - current) };
    })
    .filter((x) => x.shortage > 0);

  // Compact alert pills
  const alerts: { label: string; color: string }[] = [];
  if (attendanceRate < 70)      alerts.push({ label: `Low attendance ${attendanceRate}%`, color: "#ef4444" });
  if (atRiskMembers.length)     alerts.push({ label: `${atRiskMembers.length} at-risk`, color: "#f59e0b" });
  if (inactiveMembers.length)   alerts.push({ label: `${inactiveMembers.length} inactive`, color: "#ef4444" });
  if (recruitmentNeeds.length)  alerts.push({ label: `${recruitmentNeeds.length} recruitment needs`, color: "#60a5fa" });

  return (
    <div style={{ color: C.text, maxWidth: 1400, margin: "0 auto" }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32, color: theme.colors.goldSoft, fontWeight: 800 }}>
              🏰 Guild Command Center
            </h1>
            <p style={{ marginTop: 6, marginBottom: 0, color: theme.colors.textSecondary, fontSize: 14 }}>
              Real-time strategic overview of LUMIERE
            </p>
          </div>
          <button onClick={logout} style={logoutBtn}>Logout</button>
        </div>
        <div style={{ marginTop: 16, height: 1, background: "linear-gradient(90deg, rgba(212,175,55,0.45), transparent)" }} />
      </div>

      {loading ? (
        <p style={{ color: C.muted, padding: 20 }}>Loading dashboard...</p>
      ) : (
        <>
          {/* ── KPI STRIP ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
            <KPI label="Total Members"  value={members.length}         color="#f8e7b0" />
            <KPI label="Active"         value={activeMembers.length}   color="#22c55e" />
            <KPI label="At Risk"        value={atRiskMembers.length}   color="#f59e0b" />
            <KPI label="Inactive"       value={inactiveMembers.length} color="#ef4444" />
            <KPI label="New (14d)"      value={newMembers.length}      color="#60a5fa" />
          </div>

          {/* ── ALERTS — compact pill row ── */}
          {alerts.length > 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
              marginBottom: 16, padding: "12px 16px", borderRadius: 16,
              background: "linear-gradient(135deg, rgba(212,175,55,0.06), rgba(255,255,255,0.02))",
              border: "1px solid rgba(212,175,55,0.14)",
            }}>
              <span style={{ fontSize: 12, color: "#64748b", marginRight: 4 }}>🚨 Alerts:</span>
              {alerts.map((a, i) => (
                <span key={i} style={{
                  fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                  background: `${a.color}15`, border: `1px solid ${a.color}40`, color: a.color,
                }}>
                  {a.label}
                </span>
              ))}
            </div>
          )}

          {/* ── MAIN 2-COLUMN LAYOUT ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

            {/* ══ LEFT — Action Panel ══ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Recent Events */}
              <Card title="📅 Recent Events">
                {eventSummaries.length === 0
                  ? <Empty>No events yet.</Empty>
                  : eventSummaries.map((ev) => (
                    <div key={ev.id} style={evRow}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{ev.name}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{formatDate(ev.date)}</div>
                      </div>
                      <div style={pill}>{ev.attendees}</div>
                    </div>
                  ))
                }
              </Card>

              {/* At Risk + Inactive side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Card title="⚠️ At Risk">
                  {atRiskMembers.length === 0
                    ? <Empty>None 🎉</Empty>
                    : atRiskMembers.map((m) => <MCard key={m.id} member={m} tone="warning" />)
                  }
                </Card>
                <Card title="❌ Inactive">
                  {inactiveMembers.length === 0
                    ? <Empty>None 🎉</Empty>
                    : inactiveMembers.map((m) => <MCard key={m.id} member={m} tone="danger" />)
                  }
                </Card>
              </div>

              {/* Recently Joined */}
              {newMembers.length > 0 && (
                <Card title="🆕 Recently Joined">
                  {newMembers.map((m) => (
                    <div key={m.id} style={{
                      padding: "8px 12px", borderRadius: 10, marginBottom: 6,
                      background: "rgba(96,165,250,0.07)",
                      border: "1px solid rgba(96,165,250,0.18)",
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{m.ign}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {m.class} • {m.role} • {formatDate(m.joined_at)}
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </div>

            {/* ══ RIGHT — Stats Panel ══ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Attendance chart */}
              <div style={chartCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={cardTitle}>📈 Attendance per Event</h3>
                  <div style={{
                    padding: "4px 12px", borderRadius: 20,
                    background: "rgba(212,175,55,0.12)",
                    border: "1px solid rgba(212,175,55,0.25)",
                    fontSize: 13, fontWeight: 700, color: C.goldLight,
                  }}>
                    {attendanceRate}%
                  </div>
                </div>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceChartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                      <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                      <YAxis stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        content={<DarkTooltip />}
                        cursor={{ fill: "rgba(212,175,55,0.10)" }}
                      />
                      <Bar dataKey="Attendees" fill="#D4AF37" radius={[6, 6, 0, 0]} isAnimationActive={false} minPointSize={4} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Class distribution chart */}
              <div style={chartCard}>
                <h3 style={{ ...cardTitle, marginBottom: 12 }}>📊 Class Distribution</h3>
                <div style={{ width: "100%", overflowX: "auto" }}>
                  <div style={{ minWidth: Math.max(classChartData.length * 70, 300), height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classChartData} margin={{ top: 4, right: 8, left: -16, bottom: 50 }}>
                        <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={70}
                          stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 10 }} />
                        <YAxis stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 11 }} allowDecimals={false} />
                        <Tooltip
                          content={<DarkTooltip />}
                          cursor={{ fill: "rgba(212,175,55,0.10)" }}
                        />
                        <Bar dataKey="Count" fill="#D4AF37" radius={[6, 6, 0, 0]} isAnimationActive={false} minPointSize={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Recruitment Needs */}
              <Card title="📢 Recruitment Needs">
                {recruitmentNeeds.length === 0
                  ? <Empty>Roster healthy ✅</Empty>
                  : recruitmentNeeds.map((n) => (
                    <div key={n.className} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", borderRadius: 10, marginBottom: 6,
                      background: "rgba(80,150,255,0.07)",
                      border: "1px solid rgba(80,150,255,0.18)",
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{n.className}</div>
                      <div style={{
                        fontSize: 11, color: "#60a5fa", fontWeight: 600,
                        background: "rgba(96,165,250,0.12)", padding: "2px 8px",
                        borderRadius: 20, border: "1px solid rgba(96,165,250,0.25)",
                      }}>
                        need {n.shortage} ({n.current}/{n.minimum})
                      </div>
                    </div>
                  ))
                }
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── SUB-COMPONENTS ── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 16, borderRadius: 20,
      background: "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.03))",
      border: "1px solid rgba(212,175,55,0.16)",
      boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 12, color: "#F5D76E", fontSize: 14, fontWeight: 700 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: 18, borderRadius: 18,
      background: "linear-gradient(135deg, rgba(212,175,55,0.14), rgba(255,255,255,0.03))",
      border: "1px solid rgba(212,175,55,0.18)",
      boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
    }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function MCard({ member, tone }: { member: any; tone: "warning" | "danger" }) {
  const bg     = tone === "warning" ? "rgba(251,191,36,0.08)"  : "rgba(239,68,68,0.08)";
  const border = tone === "warning" ? "rgba(251,191,36,0.22)"  : "rgba(239,68,68,0.22)";
  return (
    <div style={{ padding: "8px 10px", borderRadius: 10, background: bg, border: `1px solid ${border}`, marginBottom: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#F8FAFC" }}>{member.ign}</div>
      <div style={{ marginTop: 2, fontSize: 11, color: "#CBD5E1" }}>{member.class} • {member.role}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "#86efac", margin: 0, fontSize: 13 }}>{children}</p>;
}

/* ── STYLES ── */
const evRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 10px", borderRadius: 10, marginBottom: 6,
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
};

const pill: React.CSSProperties = {
  minWidth: 36, height: 36, borderRadius: 999,
  background: "linear-gradient(135deg, #D4AF37, #F5D76E)",
  color: "#111827", display: "flex", justifyContent: "center",
  alignItems: "center", fontWeight: 700, fontSize: 13,
  boxShadow: "0 3px 10px rgba(212,175,55,0.3)", flexShrink: 0,
};

const logoutBtn: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 14, border: "none",
  background: "linear-gradient(135deg, #b91c1c, #ef4444)",
  color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14,
};

// No backdropFilter on chart cards so tooltip isn't clipped
const chartCard: React.CSSProperties = {
  padding: 16, borderRadius: 20,
  background: "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.03))",
  border: "1px solid rgba(212,175,55,0.16)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
};

const cardTitle: React.CSSProperties = {
  margin: 0, color: "#F5D76E", fontSize: 14, fontWeight: 700,
};