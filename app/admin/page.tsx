"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { theme } from "../styles/theme";
import toast from "react-hot-toast";
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

function tenureLabel(joinedAt: string): string {
  if (!joinedAt) return "—";
  const days = Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86400000);
  if (days < 14)  return `${days}d (New)`;
  if (days < 30)  return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  return m > 0 ? `${y}y ${m}mo` : `${y}y`;
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

function statusColor(s: string) {
  if (s === "Present") return "#22c55e";
  if (s === "Late")    return "#f59e0b";
  if (s === "Absent")  return "#ef4444";
  return "#94a3b8";
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

// ── MEMBER STAT TOOLTIP ──────────────────────────────────
function MemberStatTooltip({ member, events, attendance, visible, x, y }: {
  member: any; events: any[]; attendance: any[];
  visible: boolean; x: number; y: number;
}) {
  if (!visible) return null;
  const history = events.slice(0, 6).map((ev: any) => {
    const r = attendance.find((a: any) => a.member_id === member.id && a.event_id === ev.id);
    return { event: ev, status: r?.status ?? null };
  });
  const attended = history.filter((h) => h.status === "Present" || h.status === "Late").length;
  const total    = history.filter((h) => h.status !== null).length;
  const rate     = total === 0 ? 0 : Math.round((attended / total) * 100);
  let streak = 0;
  for (const h of history) {
    if (h.status === "Present" || h.status === "Late") streak++;
    else break;
  }

  return (
    <div style={{
      position: "fixed",
      left: Math.min(x + 12, window.innerWidth - 240),
      top:  Math.min(y - 10, window.innerHeight - 320),
      width: 220, zIndex: 9999, pointerEvents: "none",
      background: "#0f172a",
      border: "1px solid rgba(212,175,55,0.25)",
      borderRadius: 14, padding: 14,
      boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
    }}>
      <div style={{ fontWeight: 700, color: "#f8e7b0", fontSize: 13 }}>{member.ign}</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
        {member.class} • {member.role} • {tenureLabel(member.joined_at)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
        {[
          { label: "Streak", value: streak >= 3 ? `🔥${streak}` : `${streak}`, color: streak >= 3 ? "#f59e0b" : "#94a3b8" },
          { label: "Attended", value: `${attended}/${total}`, color: "#22c55e" },
          { label: "Rate", value: `${rate}%`, color: "#D4AF37" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: "center", padding: "5px 4px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#475569", marginBottom: 5, letterSpacing: 0.3 }}>LAST {history.length} EVENTS</div>
      {history.map(({ event, status }) => {
        const sc = status ? statusColor(status) : "#334155";
        return (
          <div key={event.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "3px 8px", borderRadius: 6, marginBottom: 3,
            background: status ? `${sc}10` : "rgba(255,255,255,0.02)",
            border: `1px solid ${status ? `${sc}25` : "rgba(255,255,255,0.04)"}`,
          }}>
            <span style={{ fontSize: 10, color: "#94a3b8", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {event.name}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20, color: status ? sc : "#334155", background: `${sc}18`, flexShrink: 0, marginLeft: 4 }}>
              {status ?? "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [members,    setMembers]    = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [events,     setEvents]     = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);

  // Modal states
  const [eventModal,  setEventModal]  = useState<any | null>(null);
  const [hoverMember, setHoverMember] = useState<any | null>(null);
  const [hoverPos,    setHoverPos]    = useState({ x: 0, y: 0 });
  const [alertHover,  setAlertHover]  = useState<string | null>(null);
  const [alertPos,    setAlertPos]    = useState({ x: 0, y: 0 });

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

  async function sendDiscordAlerts() {
    try {
      const res = await fetch("/api/discord/member-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atRisk:   atRiskMembers.map((m) => ({ ign: m.ign, class: m.class, role: m.role })),
          inactive: inactiveMembers.map((m) => ({ ign: m.ign, class: m.class, role: m.role })),
        }),
      });
      if (res.ok) toast.success("⚠️ Alerts sent to Discord!");
      else toast.error("Failed to send alerts");
    } catch { toast.error("Failed to send alerts"); }
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

  const newMembers      = [...membersWithHealth.filter((m) => m.health === "new")]
    .sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime());
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
    name: ev.name,
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

  // ── SMARTER RECRUITMENT ──
  // Minimums per class across full guild
  const classMinimums: Record<string, number> = {
    "High Wizard": 6, "Professor": 4, "Biochemist": 4,
    "High Priest": 6, "Minstrel": 2, "Gypsy": 2,
    "Lord Knight": 6, "Paladin": 4, "Sniper": 4,
    "Champion": 2, "Assassin Cross": 4, "Stalker": 2,
  };

  const recruitmentNeeds = Object.entries(classMinimums)
    .map(([className, minimum]) => {
      const current  = members.filter((m) => m.class === className).length;
      const shortage = Math.max(0, minimum - current);
      // Severity: critical if shortage > 2, warning if 1-2
      const severity = shortage > 2 ? "critical" : shortage > 0 ? "warning" : "ok";
      return { className, minimum, current, shortage, severity };
    })
    .filter((x) => x.shortage > 0)
    .sort((a, b) => b.shortage - a.shortage);

  // Alert pills
  const alerts: { label: string; color: string; key: string }[] = [];
  if (attendanceRate < 70)     alerts.push({ label: `Low attendance ${attendanceRate}%`, color: "#ef4444", key: "attendance" });
  if (atRiskMembers.length)    alerts.push({ label: `${atRiskMembers.length} at-risk`, color: "#f59e0b", key: "atrisk" });
  if (inactiveMembers.length)  alerts.push({ label: `${inactiveMembers.length} inactive`, color: "#ef4444", key: "inactive" });
  if (recruitmentNeeds.length) alerts.push({ label: `${recruitmentNeeds.length} recruitment needs`, color: "#60a5fa", key: "recruitment" });

  // Event modal data
  const eventModalData = eventModal ? (() => {
    const att = attendance.filter(
      (a) => a.event_id === eventModal.id && (a.status === "Present" || a.status === "Late")
    );
    const mainAttendees = att
      .map((a) => members.find((m) => m.id === a.member_id))
      .filter((m) => m && m.role === "Main") as any[];
    const subAttendees  = att
      .map((a) => members.find((m) => m.id === a.member_id))
      .filter((m) => m && m.role === "Sub") as any[];
    const otherAttendees = att
      .map((a) => members.find((m) => m.id === a.member_id))
      .filter((m) => m && m.role !== "Main" && m.role !== "Sub") as any[];
    const isEmperiumOverrun = eventModal.type === "Emperium Overrun";
    return { mainAttendees, subAttendees, otherAttendees, isEmperiumOverrun };
  })() : null;

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
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={sendDiscordAlerts}
              disabled={atRiskMembers.length === 0 && inactiveMembers.length === 0}
              style={{
                padding: "10px 18px", borderRadius: 14, border: "none",
                background: atRiskMembers.length === 0 && inactiveMembers.length === 0
                  ? "rgba(88,101,242,0.2)" : "linear-gradient(135deg, #5865F2, #7983f5)",
                color: atRiskMembers.length === 0 && inactiveMembers.length === 0
                  ? "rgba(255,255,255,0.3)" : "white",
                fontWeight: 700, fontSize: 13,
                cursor: atRiskMembers.length === 0 && inactiveMembers.length === 0 ? "not-allowed" : "pointer",
              }}
            >⚠️ Send Alerts</button>
            <button onClick={logout} style={logoutBtn}>Logout</button>
          </div>
        </div>
        <div style={{ marginTop: 16, height: 1, background: "linear-gradient(90deg, rgba(212,175,55,0.45), transparent)" }} />
      </div>

      {loading ? (
        <p style={{ color: C.muted, padding: 20 }}>Loading dashboard...</p>
      ) : (
        <>
          {/* ── KPI STRIP ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
            <KPI label="Total Members"  value={members.length}         color={C.text} />
            <KPI label="Active"         value={activeMembers.length}   color="#22c55e" />
            <KPI label="At Risk"        value={atRiskMembers.length}   color="#f59e0b" />
            <KPI label="Inactive"       value={inactiveMembers.length} color="#ef4444" />
            <KPI label="New (14d)"      value={newMembers.length}      color="#60a5fa" />
          </div>

          {/* ── ALERTS — hoverable pills ── */}
          {alerts.length > 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
              marginBottom: 16, padding: "12px 16px", borderRadius: 16,
              background: "linear-gradient(135deg, rgba(212,175,55,0.06), rgba(255,255,255,0.02))",
              border: "1px solid rgba(212,175,55,0.14)",
            }}>
              <span style={{ fontSize: 12, color: "#64748b", marginRight: 4 }}>🚨 Alerts:</span>
              {alerts.map((a) => (
                <span
                  key={a.key}
                  onMouseEnter={(e) => {
                    setAlertHover(a.key);
                    setAlertPos({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e) => setAlertPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setAlertHover(null)}
                  style={{
                    fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
                    background: `${a.color}15`, border: `1px solid ${a.color}40`, color: a.color,
                    cursor: "default",
                  }}
                >
                  {a.label}
                </span>
              ))}
            </div>
          )}

          {/* Alert hover popover */}
          {alertHover && (
            <div style={{
              position: "fixed",
              left: Math.min(alertPos.x + 12, window.innerWidth - 260),
              top:  Math.min(alertPos.y + 12, window.innerHeight - 300),
              width: 240, zIndex: 9999, pointerEvents: "none",
              background: "#0f172a", border: "1px solid rgba(212,175,55,0.25)",
              borderRadius: 14, padding: 14,
              boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
            }}>
              {alertHover === "atrisk" && (
                <>
                  <div style={{ fontWeight: 700, color: "#f59e0b", fontSize: 13, marginBottom: 8 }}>⚠️ At-Risk Members</div>
                  {atRiskMembers.map((m) => (
                    <div key={m.id} style={{ fontSize: 12, color: "#f8fafc", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {m.ign} <span style={{ color: "#64748b" }}>— {m.class}</span>
                    </div>
                  ))}
                </>
              )}
              {alertHover === "inactive" && (
                <>
                  <div style={{ fontWeight: 700, color: "#ef4444", fontSize: 13, marginBottom: 8 }}>❌ Inactive Members</div>
                  {inactiveMembers.map((m) => (
                    <div key={m.id} style={{ fontSize: 12, color: "#f8fafc", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {m.ign} <span style={{ color: "#64748b" }}>— {m.class}</span>
                    </div>
                  ))}
                </>
              )}
              {alertHover === "recruitment" && (
                <>
                  <div style={{ fontWeight: 700, color: "#60a5fa", fontSize: 13, marginBottom: 8 }}>📢 Recruitment Needs</div>
                  {recruitmentNeeds.map((n) => (
                    <div key={n.className} style={{ fontSize: 12, color: "#f8fafc", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between" }}>
                      <span>{n.className}</span>
                      <span style={{ color: "#60a5fa" }}>need {n.shortage}</span>
                    </div>
                  ))}
                </>
              )}
              {alertHover === "attendance" && (
                <>
                  <div style={{ fontWeight: 700, color: "#ef4444", fontSize: 13, marginBottom: 8 }}>📉 Low Attendance</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    Guild attendance rate is <span style={{ color: "#ef4444", fontWeight: 700 }}>{attendanceRate}%</span> across the last 3 events. Target is 70%+.
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── MAIN 2-COLUMN LAYOUT ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

            {/* ══ LEFT ══ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Recent Events — clickable */}
              <Card title="📅 Recent Events">
                {eventSummaries.length === 0
                  ? <Empty>No events yet.</Empty>
                  : eventSummaries.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => setEventModal(ev)}
                      style={{ ...evRow, cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "rgba(212,175,55,0.08)"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{ev.name}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{formatDate(ev.date)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={pill}>{ev.attendees}</div>
                        <span style={{ fontSize: 11, color: "#64748b" }}>View ›</span>
                      </div>
                    </div>
                  ))
                }
              </Card>

              {/* At Risk + Inactive side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Card title="⚠️ At Risk">
                  {atRiskMembers.length === 0
                    ? <Empty>None 🎉</Empty>
                    : atRiskMembers.map((m) => (
                      <HoverMemberCard
                        key={m.id} member={m} tone="warning"
                        events={events} attendance={attendance}
                        onHover={(member, x, y) => { setHoverMember(member); setHoverPos({ x, y }); }}
                        onLeave={() => setHoverMember(null)}
                        onMove={(x, y) => setHoverPos({ x, y })}
                      />
                    ))
                  }
                </Card>
                <Card title="❌ Inactive">
                  {inactiveMembers.length === 0
                    ? <Empty>None 🎉</Empty>
                    : inactiveMembers.map((m) => (
                      <HoverMemberCard
                        key={m.id} member={m} tone="danger"
                        events={events} attendance={attendance}
                        onHover={(member, x, y) => { setHoverMember(member); setHoverPos({ x, y }); }}
                        onLeave={() => setHoverMember(null)}
                        onMove={(x, y) => setHoverPos({ x, y })}
                      />
                    ))
                  }
                </Card>
              </div>

              {/* Recently Joined — sorted by most recent */}
              {newMembers.length > 0 && (
                <Card title="🆕 Recently Joined">
                  {newMembers.map((m) => (
                    <div key={m.id} style={{
                      padding: "8px 12px", borderRadius: 10, marginBottom: 6,
                      background: "rgba(96,165,250,0.07)",
                      border: "1px solid rgba(96,165,250,0.18)",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{m.ign}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                          {m.class} • {m.role}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#60a5fa", textAlign: "right" }}>
                        {formatDate(m.joined_at)}
                        <div style={{ color: "#334155", fontSize: 10 }}>{tenureLabel(m.joined_at)}</div>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </div>

            {/* ══ RIGHT ══ */}
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
                  }}>{attendanceRate}%</div>
                </div>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceChartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                      <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                      <YAxis stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 11 }} allowDecimals={false} />
                      <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(212,175,55,0.10)" }} />
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
                        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(212,175,55,0.10)" }} />
                        <Bar dataKey="Count" fill="#D4AF37" radius={[6, 6, 0, 0]} isAnimationActive={false} minPointSize={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Recruitment Needs — smarter */}
              <Card title="📢 Recruitment Needs">
                {recruitmentNeeds.length === 0
                  ? <Empty>Roster healthy ✅</Empty>
                  : recruitmentNeeds.map((n) => {
                    const isCritical = n.severity === "critical";
                    const color = isCritical ? "#ef4444" : "#f59e0b";
                    return (
                      <div key={n.className} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", borderRadius: 10, marginBottom: 6,
                        background: `${color}0d`, border: `1px solid ${color}30`,
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{n.className}</div>
                          <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
                            Have {n.current} · Need {n.minimum} min
                          </div>
                        </div>
                        <div style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 8px",
                          borderRadius: 20, color,
                          background: `${color}18`, border: `1px solid ${color}35`,
                        }}>
                          {isCritical ? "🔴" : "🟡"} -{n.shortage}
                        </div>
                      </div>
                    );
                  })
                }
              </Card>
            </div>
          </div>

          {/* Member stat hover tooltip */}
          <MemberStatTooltip
            member={hoverMember}
            events={events}
            attendance={attendance}
            visible={!!hoverMember}
            x={hoverPos.x}
            y={hoverPos.y}
          />
        </>
      )}

      {/* ── EVENT ATTENDEES MODAL ── */}
      {eventModal && eventModalData && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => setEventModal(null)}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #0f172a, #1e293b)",
              border: "1px solid rgba(212,175,55,0.25)",
              borderRadius: 24, padding: 32,
              maxWidth: 560, width: "90%", maxHeight: "80vh", overflowY: "auto",
              boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, color: "#f8e7b0", fontSize: 20 }}>{eventModal.name}</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
                  {formatDate(eventModal.date)} · {eventModal.attendees} attended
                </p>
              </div>
              <button onClick={() => setEventModal(null)} style={{
                background: "none", border: "none", color: "#64748b",
                fontSize: 22, cursor: "pointer",
              }}>×</button>
            </div>

            {/* Gold divider */}
            <div style={{ height: 1, background: "linear-gradient(90deg, rgba(212,175,55,0.4), transparent)", marginBottom: 20 }} />

            {eventModalData.isEmperiumOverrun ? (
              // No Main/Sub separation for Emperium Overrun
              <div>
                <div style={{ fontWeight: 700, color: "#f8e7b0", fontSize: 13, marginBottom: 10 }}>
                  ⚔️ All Attendees ({[...eventModalData.mainAttendees, ...eventModalData.subAttendees, ...eventModalData.otherAttendees].length})
                </div>
                {[...eventModalData.mainAttendees, ...eventModalData.subAttendees, ...eventModalData.otherAttendees].map((m: any) => (
                  <AttendeeRow key={m.id} member={m} />
                ))}
              </div>
            ) : (
              // Main + Sub separated
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#f8e7b0", fontSize: 13, marginBottom: 10 }}>
                    ⚔️ Main ({eventModalData.mainAttendees.length})
                  </div>
                  {eventModalData.mainAttendees.length === 0
                    ? <p style={{ color: "#334155", fontSize: 12 }}>None</p>
                    : eventModalData.mainAttendees.map((m: any) => <AttendeeRow key={m.id} member={m} />)
                  }
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: "#60a5fa", fontSize: 13, marginBottom: 10 }}>
                    🛡️ Sub ({eventModalData.subAttendees.length})
                  </div>
                  {eventModalData.subAttendees.length === 0
                    ? <p style={{ color: "#334155", fontSize: 12 }}>None</p>
                    : eventModalData.subAttendees.map((m: any) => <AttendeeRow key={m.id} member={m} />)
                  }
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 32, textAlign: "center", fontSize: 11, color: "#1e293b" }}>
        v2.1 • LUMIERE GMS
      </div>
    </div>
  );
}

/* ── SUB-COMPONENTS ── */

function AttendeeRow({ member }: { member: any }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 10px", borderRadius: 8, marginBottom: 5,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#f8fafc" }}>{member.ign}</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{member.class}</div>
      </div>
    </div>
  );
}

function HoverMemberCard({ member, tone, events, attendance, onHover, onLeave, onMove }: {
  member: any; tone: "warning" | "danger";
  events: any[]; attendance: any[];
  onHover: (m: any, x: number, y: number) => void;
  onLeave: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const bg     = tone === "warning" ? "rgba(251,191,36,0.08)"  : "rgba(239,68,68,0.08)";
  const border = tone === "warning" ? "rgba(251,191,36,0.22)"  : "rgba(239,68,68,0.22)";
  return (
    <div
      onMouseEnter={(e) => onHover(member, e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      onMouseMove={(e) => onMove(e.clientX, e.clientY)}
      style={{
        padding: "8px 10px", borderRadius: 10,
        background: bg, border: `1px solid ${border}`,
        marginBottom: 6, cursor: "default",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: "#F8FAFC" }}>{member.ign}</div>
      <div style={{ marginTop: 2, fontSize: 11, color: "#CBD5E1" }}>
        {member.class} • {member.role} • {tenureLabel(member.joined_at)}
      </div>
    </div>
  );
}

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

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "#86efac", margin: 0, fontSize: 13 }}>{children}</p>;
}

const evRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 10px", borderRadius: 10, marginBottom: 6,
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
  transition: "background 0.15s",
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

const chartCard: React.CSSProperties = {
  padding: 16, borderRadius: 20,
  background: "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.03))",
  border: "1px solid rgba(212,175,55,0.16)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
};

const cardTitle: React.CSSProperties = {
  margin: 0, color: "#F5D76E", fontSize: 14, fontWeight: 700,
};