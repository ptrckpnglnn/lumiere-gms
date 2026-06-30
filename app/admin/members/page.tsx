"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

type Member = {
  id?: string;
  ign: string;
  class: string;
  role: string;
  joined_at?: string;
  health_override?: string | null; // 'at_risk' | 'inactive' | null
};

// Shared health logic — same function used by dashboard
export function getMemberHealth(
  member: Member,
  events: any[],
  attendance: any[]
): "new" | "at_risk" | "inactive" | "active" {
  if (isNewMember(member)) return "new";
  if (member.health_override === "at_risk") return "at_risk";
  if (member.health_override === "inactive") return "inactive";

  const latest4 = events.slice(0, 4);
  const latest2 = events.slice(0, 2);

  const getStatus = (eventId: string) => {
    const r = attendance.find(
      (a) => a.member_id === member.id && a.event_id === eventId
    );
    return r ? r.status : "Absent";
  };

  const last4statuses = latest4.map((e) => getStatus(e.id));
  const last2statuses = latest2.map((e) => getStatus(e.id));

  if (latest4.length >= 4 && last4statuses.every((s) => s === "Absent"))
    return "inactive";
  if (latest2.length >= 2 && last2statuses.every((s) => s === "Absent"))
    return "at_risk";
  return "active";
}

export function isNewMember(member: Member) {
  if (!member.joined_at) return false;
  const days =
    (Date.now() - new Date(member.joined_at).getTime()) / 86400000;
  return days <= 14;
}

function healthColor(h: string) {
  if (h === "active")   return "#22c55e";
  if (h === "at_risk")  return "#f59e0b";
  if (h === "inactive") return "#ef4444";
  if (h === "new")      return "#60a5fa";
  return "#94a3b8";
}

function healthLabel(h: string) {
  if (h === "active")   return "Active";
  if (h === "at_risk")  return "At Risk";
  if (h === "inactive") return "Inactive";
  if (h === "new")      return "New";
  return "—";
}

const classes = [
  "Lord Knight", "Paladin", "High Wizard", "Professor", "Sniper",
  "Minstrel", "Gypsy", "High Priest", "Champion", "Mastersmith",
  "Biochemist", "Assassin Cross", "Stalker", "Summoner",
];
const roles = ["Main", "Sub", "Support", "Reserve"];

export default function MembersPage() {
  const [members,    setMembers]    = useState<Member[]>([]);
  const [events,     setEvents]     = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [page,       setPage]       = useState(1);
  const pageSize = 10;

  const [filters, setFilters] = useState({
    ign: "", class: "All", role: "All", health: "All",
  });
  const [form, setForm] = useState<Member>({
    ign: "", class: "", role: "Main",
  });

  async function fetchAll() {
    setLoading(true);
    const [m, e, a] = await Promise.all([
      supabase.from("members").select("*").order("ign"),
      supabase.from("events").select("*").order("date", { ascending: false }),
      supabase.from("attendance").select("*"),
    ]);
    setMembers(m.data || []);
    setEvents(e.data || []);
    setAttendance(a.data || []);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function addMember() {
    if (!form.ign || !form.class) return;
    const { error } = await supabase.from("members").insert([{
      ign: form.ign,
      class: form.class,
      role: form.role,
      joined_at: new Date().toISOString().split("T")[0],
      health_override: null,
    }]);
    if (error) { toast.error("Failed to add member"); return; }
    toast.success("Member added!");
    setForm({ ign: "", class: "", role: "Main" });
    fetchAll();
  }

  async function updateMember(id: string | undefined, field: string, value: string) {
    if (!id) return;
    const { error } = await supabase.from("members").update({ [field]: value }).eq("id", id);
    if (error) toast.error("Failed to update");
    fetchAll();
  }

  async function toggleOverride(member: Member, override: "at_risk" | "inactive") {
    if (!member.id) return;
    const newVal = member.health_override === override ? null : override;
    const { error } = await supabase
      .from("members")
      .update({ health_override: newVal })
      .eq("id", member.id);
    if (error) { toast.error("Failed to update"); return; }
    toast.success(newVal ? `Marked as ${healthLabel(newVal)}` : "Override removed");
    fetchAll();
  }

  async function deleteMember(id?: string) {
    if (!id) return;
    const { error } = await supabase.from("members").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Member removed");
    fetchAll();
  }

  // Compute health for every member — only count events that have already happened
  const today = new Date().toISOString().split("T")[0];
  const pastEvents = events.filter((ev) => ev.date <= today);

  const membersWithHealth = members.map((m) => ({
    ...m,
    health: getMemberHealth(m, pastEvents, attendance),
  }));

  const filteredMembers = membersWithHealth.filter((m) => {
    const matchIGN    = m.ign.toLowerCase().includes(filters.ign.toLowerCase());
    const matchClass  = filters.class === "All" || m.class === filters.class;
    const matchRole   = filters.role  === "All" || m.role  === filters.role;
    const matchHealth = filters.health === "All" || m.health === filters.health;
    return matchIGN && matchClass && matchRole && matchHealth;
  });

  const start            = (page - 1) * pageSize;
  const paginatedMembers = filteredMembers.slice(start, start + pageSize);

  function clearFilters() {
    setFilters({ ign: "", class: "All", role: "All", health: "All" });
    setPage(1);
  }

  // Summary counts — same definitions as dashboard
  const activeCount   = membersWithHealth.filter((m) => m.health === "active").length;
  const atRiskCount   = membersWithHealth.filter((m) => m.health === "at_risk").length;
  const inactiveCount = membersWithHealth.filter((m) => m.health === "inactive").length;
  const newCount      = membersWithHealth.filter((m) => m.health === "new").length;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "#F8FAFC" }}>

      {/* HEADER */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 32, color: "#f8e7b0", fontWeight: 800 }}>
          👥 Members Command Center
        </h1>
        <p style={{ marginTop: 6, color: "#94a3b8", fontSize: 14 }}>
          Manage guild roster, roles, and member health.
        </p>
        <div style={{ marginTop: 16, height: 1, background: "linear-gradient(90deg, rgba(212,175,55,0.45), transparent)" }} />
      </div>

      {/* SUMMARY — matches dashboard exactly */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
        <div style={statCard}>
          <div style={statLabel}>Total Members</div>
          <div style={{ ...statValue, color: "#f8e7b0" }}>{members.length}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Active</div>
          <div style={{ ...statValue, color: "#22c55e" }}>{activeCount}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>At Risk</div>
          <div style={{ ...statValue, color: "#f59e0b" }}>{atRiskCount}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Inactive</div>
          <div style={{ ...statValue, color: "#ef4444" }}>{inactiveCount}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>New (14d)</div>
          <div style={{ ...statValue, color: "#60a5fa" }}>{newCount}</div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={glassCard}>
        <h3 style={sectionTitle}>🔎 Filters</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 12 }}>
          <input
            placeholder="Search IGN..."
            value={filters.ign}
            onChange={(e) => setFilters({ ...filters, ign: e.target.value })}
            style={input}
          />
          <button onClick={clearFilters} style={clearBtn}>Clear</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <select value={filters.class} onChange={(e) => setFilters({ ...filters, class: e.target.value })} style={input}>
            <option style={optStyle}>All Classes</option>
            {classes.map((c) => <option key={c} style={optStyle}>{c}</option>)}
          </select>
          <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })} style={input}>
            <option style={optStyle}>All</option>
            {roles.map((r) => <option key={r} style={optStyle}>{r}</option>)}
          </select>
          <select value={filters.health} onChange={(e) => setFilters({ ...filters, health: e.target.value })} style={input}>
            <option value="All" style={optStyle}>All Health</option>
            <option value="active"   style={optStyle}>Active</option>
            <option value="at_risk"  style={optStyle}>At Risk</option>
            <option value="inactive" style={optStyle}>Inactive</option>
            <option value="new"      style={optStyle}>New</option>
          </select>
        </div>
      </div>

      {/* ADD MEMBER */}
      <div style={glassCard}>
        <h3 style={sectionTitle}>➕ Add Member</h3>
        <div style={{ marginBottom: 12 }}>
          <input
            placeholder="In-Game Name (IGN)"
            value={form.ign}
            onChange={(e) => setForm({ ...form, ign: e.target.value })}
            style={{ ...input, width: "100%" }}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12 }}>
          <select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} style={input}>
            <option value="" style={optStyle}>Select Class</option>
            {classes.map((c) => <option key={c} style={optStyle}>{c}</option>)}
          </select>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={input}>
            {roles.map((r) => <option key={r} style={optStyle}>{r}</option>)}
          </select>
          <button onClick={addMember} style={goldButton}>Add</button>
        </div>
      </div>

      {/* TABLE */}
      <div style={glassCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>📋 Member Roster</h3>
          <div style={{ color: "#94a3b8", fontSize: 14 }}>{filteredMembers.length} member(s)</div>
        </div>

        <div style={tableHeader}>
          <div>IGN</div>
          <div>Class</div>
          <div>Role</div>
          <div>Health</div>
          <div>Joined</div>
          <div>Override</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={{ padding: 30, color: "#cbd5e1" }}>Loading members...</div>
        ) : (
          paginatedMembers.map((m) => {
            const hColor = healthColor(m.health);
            return (
              <div key={m.id} style={tableRow}>

                {/* IGN + badges */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.ign}
                  </span>
                  {m.health === "new" && <Badge color="#60a5fa">NEW</Badge>}
                  {m.health_override && <Badge color="#a78bfa">OVERRIDE</Badge>}
                </div>

                <select
                  value={m.class}
                  onChange={(e) => updateMember(m.id, "class", e.target.value)}
                  style={tableSelect}
                >
                  {classes.map((c) => <option key={c} style={optStyle}>{c}</option>)}
                </select>

                <select
                  value={m.role}
                  onChange={(e) => updateMember(m.id, "role", e.target.value)}
                  style={tableSelect}
                >
                  {roles.map((r) => <option key={r} style={optStyle}>{r}</option>)}
                </select>

                {/* Health badge — auto-calculated */}
                <div style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: `${hColor}18`, border: `1px solid ${hColor}40`, color: hColor,
                }}>
                  {healthLabel(m.health)}
                </div>

                {/* Joined date */}
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {m.joined_at ?? "—"}
                </div>

                {/* Manual override buttons */}
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    onClick={() => toggleOverride(m, "at_risk")}
                    title="Toggle At Risk override"
                    style={{
                      ...overrideBtn,
                      borderColor: m.health_override === "at_risk" ? "#f59e0b" : "rgba(245,158,11,0.25)",
                      background: m.health_override === "at_risk" ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.07)",
                      color: "#f59e0b",
                    }}
                  >⚠</button>
                  <button
                    onClick={() => toggleOverride(m, "inactive")}
                    title="Toggle Inactive override"
                    style={{
                      ...overrideBtn,
                      borderColor: m.health_override === "inactive" ? "#ef4444" : "rgba(239,68,68,0.25)",
                      background: m.health_override === "inactive" ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.07)",
                      color: "#ef4444",
                    }}
                  >✕</button>
                </div>

                <button onClick={() => deleteMember(m.id)} style={deleteBtn}>Delete</button>
              </div>
            );
          })
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} style={pageBtn}>◀ Prev</button>
          <div style={{ color: "#cbd5e1", fontSize: 14 }}>
            Page {page} of {Math.max(1, Math.ceil(filteredMembers.length / pageSize))}
          </div>
          <button onClick={() => setPage((p) => Math.min(p + 1, Math.ceil(filteredMembers.length / pageSize)))} style={pageBtn}>
            Next ▶
          </button>
        </div>
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 20,
      background: `${color}18`, border: `1px solid ${color}40`, color,
      letterSpacing: 0.5, flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

/* ── STYLES ── */
const optStyle: React.CSSProperties = { background: "#1e293b", color: "#f8fafc" };

const glassCard: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.03))",
  border: "1px solid rgba(212,175,55,0.16)",
  borderRadius: 24, padding: 24, marginBottom: 24,
  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
};

const statCard: React.CSSProperties = {
  padding: 20, borderRadius: 20,
  background: "linear-gradient(135deg, rgba(212,175,55,0.14), rgba(255,255,255,0.03))",
  border: "1px solid rgba(212,175,55,0.18)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
};

const statLabel: React.CSSProperties = { color: "#94a3b8", fontSize: 12, marginBottom: 10 };
const statValue: React.CSSProperties = { fontSize: 30, fontWeight: 700 };

const sectionTitle: React.CSSProperties = {
  marginTop: 0, marginBottom: 16, color: "#f8e7b0", fontSize: 18, fontWeight: 700,
};

const input: React.CSSProperties = {
  padding: 12, borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#1e293b", color: "#f8fafc",
  width: "100%", fontSize: 14,
  colorScheme: "dark", boxSizing: "border-box",
};

const tableSelect: React.CSSProperties = {
  padding: 10, borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#1e293b", color: "#f8fafc",
  width: "100%", fontSize: 13, colorScheme: "dark",
};

const goldButton: React.CSSProperties = {
  padding: "12px 22px", borderRadius: 14, border: "none",
  background: "linear-gradient(135deg, #D4AF37, #f8e7b0)",
  color: "#111827", fontWeight: 700, cursor: "pointer",
  whiteSpace: "nowrap", fontSize: 14,
};

const clearBtn: React.CSSProperties = {
  padding: "12px 18px", borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)", color: "#f8fafc",
  cursor: "pointer", whiteSpace: "nowrap", fontSize: 14,
};

const overrideBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8,
  border: "1px solid", cursor: "pointer",
  fontSize: 13, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const deleteBtn: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 10,
  border: "1px solid rgba(239,68,68,0.3)",
  background: "rgba(239,68,68,0.12)", color: "#ef4444",
  cursor: "pointer", fontWeight: 600, fontSize: 13,
};

const tableHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1.4fr 0.9fr 1fr 0.9fr 0.7fr 0.7fr",
  padding: "12px 14px", fontWeight: 700,
  color: "#94a3b8", fontSize: 13,
  borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 4,
};

const tableRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1.4fr 0.9fr 1fr 0.9fr 0.7fr 0.7fr",
  padding: "10px 14px", alignItems: "center",
  borderTop: "1px solid rgba(255,255,255,0.05)", gap: 10,
};

const pageBtn: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)", color: "#f8fafc",
  cursor: "pointer", fontSize: 13,
};