"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

type Member = { id: string; ign: string; class: string; role: string };
type EventT = { id: string; name: string; type: string; date: string; time?: string };
type Att    = { id: string; member_id: string; event_id: string; status: string };

function formatDate(raw: string) {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function formatTimePH(time?: string) {
  if (!time) return "TBA";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}
function statusColor(s: string) {
  if (s === "Present") return "#22c55e";
  if (s === "Late")    return "#f59e0b";
  if (s === "Absent")  return "#ef4444";
  return "#94a3b8";
}
function getStreak(memberId: string, events: EventT[], attendance: Att[]): number {
  let streak = 0;
  for (const ev of events) {
    const r = attendance.find((a) => a.member_id === memberId && a.event_id === ev.id);
    if (r && (r.status === "Present" || r.status === "Late")) streak++;
    else break;
  }
  return streak;
}
function getMemberHistory(memberId: string, events: EventT[], attendance: Att[], n = 8) {
  return events.slice(0, n).map((ev) => {
    const r = attendance.find((a) => a.member_id === memberId && a.event_id === ev.id);
    return { event: ev, status: r?.status ?? null };
  });
}

export default function AttendancePage() {
  const [members,          setMembers]          = useState<Member[]>([]);
  const [events,           setEvents]           = useState<EventT[]>([]);
  const [selectedEvent,    setSelectedEvent]    = useState<string>("");
  const [attendance,       setAttendance]       = useState<Att[]>([]);
  const [search,           setSearch]           = useState("");
  const [loading,          setLoading]          = useState(true);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [selectedMember,   setSelectedMember]   = useState<Member | null>(null);
  const [view,             setView]             = useState<"unmarked" | "report">("unmarked");

  useEffect(() => { fetchAll(); }, []);

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
    if (e.data?.length && !selectedEvent) setSelectedEvent(e.data[0].id);
    setLoading(false);
  }

  async function markAttendance(memberId: string, status: string) {
    const { error } = await supabase.from("attendance").upsert(
      { member_id: memberId, event_id: selectedEvent, status },
      { onConflict: "member_id,event_id" }
    );
    if (error) return toast.error(error.message);
    setAttendance((prev) => {
      const filtered = prev.filter((a) => !(a.member_id === memberId && a.event_id === selectedEvent));
      return [...filtered, { id: crypto.randomUUID(), member_id: memberId, event_id: selectedEvent, status }];
    });
    toast.success(`Marked ${status}`);
  }

  async function removeAttendance(memberId: string) {
    const { error } = await supabase.from("attendance").delete()
      .eq("member_id", memberId).eq("event_id", selectedEvent);
    if (error) return toast.error(error.message);
    setAttendance((prev) => prev.filter((a) => !(a.member_id === memberId && a.event_id === selectedEvent)));
    toast.success("Removed");
  }

  async function addAllPresent() {
    const toInsert = filteredUnmarked.map((m) => ({ member_id: m.id, event_id: selectedEvent, status: "Present" }));
    const { error } = await supabase.from("attendance").upsert(toInsert, { onConflict: "member_id,event_id" });
    if (error) return toast.error(error.message);
    fetchAll();
    toast.success("All marked Present!");
  }

  async function removeAll() {
    const { error } = await supabase.from("attendance").delete().eq("event_id", selectedEvent);
    if (error) return toast.error(error.message);
    setAttendance((prev) => prev.filter((a) => a.event_id !== selectedEvent));
    setShowConfirmClear(false);
    toast.success("Event cleared");
  }

  // ── DERIVED ──
  const selectedEventObj = events.find((e) => e.id === selectedEvent);
  const eventAttendance  = attendance.filter((a) => a.event_id === selectedEvent);
  const markedIds        = new Set(eventAttendance.map((a) => a.member_id));

  const filteredUnmarked = members.filter(
    (m) => !markedIds.has(m.id) &&
      (m.ign?.toLowerCase().includes(search.toLowerCase()) ||
       m.class?.toLowerCase().includes(search.toLowerCase()) ||
       m.role?.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredMarked = eventAttendance
    .filter((a) => {
      const m = members.find((x) => x.id === a.member_id);
      return m && (m.ign?.toLowerCase().includes(search.toLowerCase()) || m.class?.toLowerCase().includes(search.toLowerCase()));
    })
    .sort((a, b) => {
      const order: Record<string, number> = { Present: 0, Late: 1, Absent: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });

  const presentCount   = eventAttendance.filter((a) => a.status === "Present").length;
  const lateCount      = eventAttendance.filter((a) => a.status === "Late").length;
  const absentCount    = eventAttendance.filter((a) => a.status === "Absent").length;
  const attendanceRate = members.length === 0 ? 0 : Math.round(((presentCount + lateCount) / members.length) * 100);
  const totalMarked    = eventAttendance.length;

  // Recent 8 events for the card picker
  const eventCards = events.slice(0, 12);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "#F8FAFC" }}>

      {/* HEADER */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 32, color: "#f8e7b0", fontWeight: 800 }}>📅 Attendance</h1>
        <p style={{ marginTop: 6, color: "#94a3b8", fontSize: 14 }}>Mark and track event participation.</p>
        <div style={{ marginTop: 16, height: 1, background: "linear-gradient(90deg, rgba(212,175,55,0.45), transparent)" }} />
      </div>

      {loading ? (
        <div style={{ color: "#94a3b8", padding: 40 }}>Loading...</div>
      ) : events.length === 0 ? (
        <div style={{ ...glassCard, textAlign: "center", padding: 50 }}>
          <p style={{ color: "#64748b", margin: 0 }}>No events yet.</p>
          <p style={{ color: "#475569", fontSize: 13, marginTop: 6 }}>Go to the Events page to create one.</p>
        </div>
      ) : (
        <>
          {/* EVENT CARD PICKER — horizontal scroll */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, fontWeight: 600, letterSpacing: 0.3 }}>
              SELECT EVENT
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
              {eventCards.map((ev) => {
                const isSelected = ev.id === selectedEvent;
                const att = attendance.filter((a) => a.event_id === ev.id);
                return (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev.id)}
                    style={{
                      flexShrink: 0, minWidth: 160, textAlign: "left",
                      padding: "12px 14px", borderRadius: 16, cursor: "pointer",
                      background: isSelected
                        ? "linear-gradient(135deg, #D4AF37, #F5D76E)"
                        : "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.03))",
                      border: isSelected ? "1px solid rgba(212,175,55,0.5)" : "1px solid rgba(212,175,55,0.16)",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? "#111827" : "#f8fafc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ev.name}
                    </div>
                    <div style={{ fontSize: 11, color: isSelected ? "rgba(17,24,39,0.7)" : "#64748b", marginTop: 3 }}>
                      {formatDate(ev.date)} • {formatTimePH(ev.time)}
                    </div>
                    <div style={{ fontSize: 11, color: isSelected ? "rgba(17,24,39,0.6)" : "#475569", marginTop: 4 }}>
                      {att.length} marked
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedEventObj && (
            <>
              {/* KPI STRIP */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
                <KPI label="Present"         value={presentCount}      color="#22c55e" />
                <KPI label="Late"            value={lateCount}         color="#f59e0b" />
                <KPI label="Absent"          value={absentCount}       color="#ef4444" />
                <KPI label="Attendance Rate" value={`${attendanceRate}%`} color="#D4AF37" />
              </div>

              {/* Stats bar */}
              {totalMarked > 0 && (
                <div style={{ ...glassCard, marginBottom: 16, padding: "14px 20px" }}>
                  <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", gap: 2 }}>
                    {presentCount > 0 && <div style={{ width: `${(presentCount/totalMarked)*100}%`, background: "#22c55e", borderRadius: "99px 0 0 99px" }} />}
                    {lateCount    > 0 && <div style={{ width: `${(lateCount/totalMarked)*100}%`, background: "#f59e0b" }} />}
                    {absentCount  > 0 && <div style={{ width: `${(absentCount/totalMarked)*100}%`, background: "#ef4444", borderRadius: "0 99px 99px 0" }} />}
                  </div>
                </div>
              )}

              {/* Toggle: Unmarked / Report */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={() => setView("unmarked")} style={view === "unmarked" ? activeToggle : toggle}>
                  👥 Unmarked ({filteredUnmarked.length})
                </button>
                <button onClick={() => setView("report")} style={view === "report" ? activeToggle : toggle}>
                  📊 Report ({totalMarked})
                </button>

                <input
                  placeholder="Search IGN, Class, or Role..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ ...input, flex: 1, minWidth: 220 }}
                />

                {view === "unmarked"
                  ? <button onClick={addAllPresent} style={greenButton}>✓ Mark All Present</button>
                  : <button onClick={() => setShowConfirmClear(true)} style={dangerButton}>❌ Clear All</button>
                }
              </div>

              {/* MAIN LIST */}
              <div style={glassCard}>
                {view === "unmarked" ? (
                  filteredUnmarked.length === 0
                    ? <p style={{ color: "#86efac", margin: 0 }}>All members marked! 🎉</p>
                    : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 }}>
                        {filteredUnmarked.map((m) => {
                          const streak = getStreak(m.id, events, attendance);
                          return (
                            <div key={m.id} style={memberRow}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontWeight: 700, color: "#f8fafc", fontSize: 14 }}>{m.ign}</span>
                                  {streak >= 3 && <span style={streakBadge}>🔥 {streak}</span>}
                                </div>
                                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{m.class} • {m.role}</div>
                              </div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <button onClick={() => setSelectedMember(m)} style={historyBtn} title="View history">📋</button>
                                <StatusButton label="P" title="Present" color="#16a34a" onClick={() => markAttendance(m.id, "Present")} />
                                <StatusButton label="L" title="Late"    color="#d97706" onClick={() => markAttendance(m.id, "Late")} />
                                <StatusButton label="A" title="Absent"  color="#dc2626" onClick={() => markAttendance(m.id, "Absent")} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                ) : (
                  filteredMarked.length === 0
                    ? <p style={{ color: "#64748b", margin: 0 }}>No records yet.</p>
                    : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 }}>
                        {filteredMarked.map((a) => {
                          const m = members.find((x) => x.id === a.member_id);
                          const sc = statusColor(a.status);
                          return (
                            <div key={a.id} style={memberRow}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontWeight: 700, color: "#f8fafc", fontSize: 14 }}>{m?.ign ?? "Unknown"}</span>
                                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{m?.class}</div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: `${sc}18`, border: `1px solid ${sc}40`, color: sc }}>
                                  {a.status}
                                </span>
                                <button onClick={() => setSelectedMember(m ?? null)} style={historyBtn} title="View history">📋</button>
                                <button onClick={() => removeAttendance(a.member_id)} style={removeBtn}>×</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* MEMBER HISTORY MODAL */}
      {selectedMember && (
        <div style={overlay} onClick={() => setSelectedMember(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, color: "#f8e7b0", fontSize: 20 }}>{selectedMember.ign}</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{selectedMember.class} • {selectedMember.role}</p>
              </div>
              <button onClick={() => setSelectedMember(null)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            {(() => {
              const streak = getStreak(selectedMember.id, events, attendance);
              const history = getMemberHistory(selectedMember.id, events, attendance, 10);
              const attended = history.filter((h) => h.status === "Present" || h.status === "Late").length;
              const total    = history.filter((h) => h.status !== null).length;
              const rate     = total === 0 ? 0 : Math.round((attended / total) * 100);
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                    <MiniStat label="Streak" value={streak >= 3 ? `🔥 ${streak}` : streak.toString()} color="#f59e0b" />
                    <MiniStat label="Attended" value={`${attended}/${total}`} color="#22c55e" />
                    <MiniStat label="Rate" value={`${rate}%`} color="#D4AF37" />
                  </div>
                  <div style={{ marginBottom: 8, fontSize: 12, color: "#64748b", fontWeight: 600 }}>LAST {history.length} EVENTS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {history.map(({ event, status }) => {
                      const sc = status ? statusColor(status) : "#334155";
                      return (
                        <div key={event.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: status ? `${sc}0d` : "rgba(255,255,255,0.02)", border: `1px solid ${status ? `${sc}30` : "rgba(255,255,255,0.05)"}` }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#f8fafc" }}>{event.name}</div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{formatDate(event.date)}</div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: `${sc}18`, border: `1px solid ${sc}40`, color: status ? sc : "#334155" }}>
                            {status ?? "No record"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* CONFIRM CLEAR */}
      {showConfirmClear && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 420 }}>
            <h2 style={{ margin: 0, color: "#f8e7b0", fontSize: 22 }}>⚠️ Clear All Records?</h2>
            <p style={{ color: "#94a3b8", marginTop: 12, marginBottom: 28 }}>This will permanently remove all attendance records for this event. This cannot be undone.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setShowConfirmClear(false)} style={cancelBtn}>Cancel</button>
              <button onClick={removeAll} style={dangerBtnSolid}>Yes, Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* SUB-COMPONENTS */
function KPI({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ padding: 18, borderRadius: 18, background: "linear-gradient(135deg, rgba(212,175,55,0.14), rgba(255,255,255,0.03))", border: "1px solid rgba(212,175,55,0.18)" }}>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: 12, textAlign: "center", background: "rgba(255,255,255,0.04)", border: `1px solid ${color}25` }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{label}</div>
    </div>
  );
}
function StatusButton({ label, title, color, onClick }: { label: string; title: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${color}60`, background: `${color}22`, color, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
      {label}
    </button>
  );
}

/* STYLES */
const glassCard: React.CSSProperties = { background: "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.03))", border: "1px solid rgba(212,175,55,0.16)", borderRadius: 20, padding: 18 };
const input: React.CSSProperties = { padding: 11, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "#1e293b", color: "#f8fafc", fontSize: 14, colorScheme: "dark", boxSizing: "border-box" };
const memberRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" };
const toggle: React.CSSProperties = { padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 600 };
const activeToggle: React.CSSProperties = { padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(212,175,55,0.3)", background: "linear-gradient(135deg, #D4AF37, #F5D76E)", color: "#111827", cursor: "pointer", fontSize: 13, fontWeight: 700 };
const greenButton: React.CSSProperties = { padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.12)", color: "#22c55e", fontWeight: 600, cursor: "pointer", fontSize: 13 };
const dangerButton: React.CSSProperties = { padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.10)", color: "#ef4444", fontWeight: 600, cursor: "pointer", fontSize: 13 };
const removeBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.10)", color: "#ef4444", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" };
const historyBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(212,175,55,0.2)", background: "rgba(212,175,55,0.08)", color: "#f8e7b0", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" };
const streakBadge: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modal: React.CSSProperties = { background: "linear-gradient(135deg, #0f172a, #1e293b)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 24, padding: 32, maxWidth: 480, width: "90%", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" };
const cancelBtn: React.CSSProperties = { padding: "12px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#f8fafc", cursor: "pointer", fontWeight: 600 };
const dangerBtnSolid: React.CSSProperties = { padding: "12px 20px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #b91c1c, #ef4444)", color: "white", cursor: "pointer", fontWeight: 700 };