"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

const EVENT_TYPES = [
  "Guild League",
  "Emperium Overrun",
  "Guild War",
  "Raid",
  "Guild Meeting",
  "Training",
];

type Member = { id: string; ign: string; class: string; role: string };
type Event  = { id: string; name: string; type: string; date: string; time?: string };
type Att    = { id: string; member_id: string; event_id: string; status: string };

function formatDate(raw: string) {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function formatTimePH(time: string) {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm} PH Time`;
}

// Also show time in event selector
function formatEventLabel(ev: Event) {
  const date = formatDate(ev.date);
  const time = ev.time ? ` • ${formatTimePH(ev.time)}` : "";
  return `${ev.name} — ${date}${time}`;
}

function statusColor(s: string) {
  if (s === "Present") return "#22c55e";
  if (s === "Late")    return "#f59e0b";
  if (s === "Absent")  return "#ef4444";
  return "#94a3b8";
}

// Returns streak count of consecutive present/late from most recent event backwards
function getStreak(memberId: string, events: Event[], attendance: Att[]): number {
  let streak = 0;
  for (const ev of events) {
    const r = attendance.find((a) => a.member_id === memberId && a.event_id === ev.id);
    if (r && (r.status === "Present" || r.status === "Late")) streak++;
    else break;
  }
  return streak;
}

// Returns last N statuses for a member across events (newest first)
function getMemberHistory(memberId: string, events: Event[], attendance: Att[], n = 8) {
  return events.slice(0, n).map((ev) => {
    const r = attendance.find((a) => a.member_id === memberId && a.event_id === ev.id);
    return { event: ev, status: r?.status ?? null };
  });
}

export default function AttendancePage() {
  const [members,          setMembers]          = useState<Member[]>([]);
  const [events,           setEvents]           = useState<Event[]>([]);
  const [selectedEvent,    setSelectedEvent]    = useState<string>("");
  const [attendance,       setAttendance]       = useState<Att[]>([]);
  const [search,           setSearch]           = useState("");
  const [typeFilter,       setTypeFilter]       = useState("All");
  const [loading,          setLoading]          = useState(true);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [selectedMember,   setSelectedMember]   = useState<Member | null>(null);

  // Create event form
  const [eventType, setEventType] = useState("Guild League");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("20:55"); // default 8:55 PM

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

  async function createEvent() {
    if (!eventDate) { toast.error("Please choose a date"); return; }
    if (!eventTime) { toast.error("Please choose a time"); return; }
    const { data, error } = await supabase
      .from("events")
      .insert([{ name: eventType, type: eventType, date: eventDate, time: eventTime }])
      .select();
    if (error) { toast.error(error.message); return; }
    if (data) {
      setEvents([data[0], ...events]);
      setSelectedEvent(data[0].id);
      setEventDate("");
      setEventTime("20:55");
      toast.success("Event created!");

      // Post to Discord event-alerts channel
      try {
        const res = await fetch("/api/discord/event-announce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data[0].name,
            date: data[0].date,
            time: data[0].time,
            type: data[0].type,
          }),
        });
        if (res.ok) toast.success("📣 Announced on Discord!");
        else toast.error("Event created but Discord announcement failed");
      } catch {
        toast.error("Event created but Discord announcement failed");
      }
    }
  }

  async function deleteEvent(eventId: string) {
    // Delete attendance records first, then the event
    await supabase.from("attendance").delete().eq("event_id", eventId);
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) { toast.error("Failed to delete event"); return; }
    const remaining = events.filter((e) => e.id !== eventId);
    setEvents(remaining);
    setAttendance(attendance.filter((a) => a.event_id !== eventId));
    setSelectedEvent(remaining[0]?.id ?? "");
    toast.success("Event deleted");
  }

  async function markAttendance(memberId: string, status: string) {
    const { error } = await supabase.from("attendance").upsert(
      { member_id: memberId, event_id: selectedEvent, status },
      { onConflict: "member_id,event_id" }
    );
    if (error) return toast.error(error.message);
    setAttendance((prev) => {
      const filtered = prev.filter(
        (a) => !(a.member_id === memberId && a.event_id === selectedEvent)
      );
      return [...filtered, { id: crypto.randomUUID(), member_id: memberId, event_id: selectedEvent, status }];
    });
    toast.success(`Marked ${status}`);
  }

  async function removeAttendance(memberId: string) {
    const { error } = await supabase
      .from("attendance").delete()
      .eq("member_id", memberId).eq("event_id", selectedEvent);
    if (error) return toast.error(error.message);
    setAttendance((prev) =>
      prev.filter((a) => !(a.member_id === memberId && a.event_id === selectedEvent))
    );
    toast.success("Removed");
  }

  async function addAllPresent() {
    const toInsert = filteredUnmarked.map((m) => ({
      member_id: m.id, event_id: selectedEvent, status: "Present",
    }));
    const { error } = await supabase.from("attendance")
      .upsert(toInsert, { onConflict: "member_id,event_id" });
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
  const filteredEvents = events.filter(
    (e) => typeFilter === "All" || e.type === typeFilter
  );
  const selectedEventObj = events.find((e) => e.id === selectedEvent);
  const eventAttendance  = attendance.filter((a) => a.event_id === selectedEvent);
  const markedIds        = new Set(eventAttendance.map((a) => a.member_id));

  const filteredUnmarked = members.filter(
    (m) =>
      !markedIds.has(m.id) &&
      (m.ign?.toLowerCase().includes(search.toLowerCase()) ||
        m.class?.toLowerCase().includes(search.toLowerCase()) ||
        m.role?.toLowerCase().includes(search.toLowerCase()))
  );

  const presentCount   = eventAttendance.filter((a) => a.status === "Present").length;
  const lateCount      = eventAttendance.filter((a) => a.status === "Late").length;
  const absentCount    = eventAttendance.filter((a) => a.status === "Absent").length;
  const attendanceRate = members.length === 0 ? 0
    : Math.round(((presentCount + lateCount) / members.length) * 100);

  // Per-event stats bar
  const totalMarked  = eventAttendance.length;
  const presentPct   = totalMarked === 0 ? 0 : Math.round((presentCount / totalMarked) * 100);
  const latePct      = totalMarked === 0 ? 0 : Math.round((lateCount    / totalMarked) * 100);
  const absentPct    = totalMarked === 0 ? 0 : Math.round((absentCount  / totalMarked) * 100);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "#F8FAFC" }}>

      {/* HEADER */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 32, color: "#f8e7b0", fontWeight: 800 }}>
          📅 Attendance System
        </h1>
        <p style={{ marginTop: 6, color: "#94a3b8", fontSize: 14 }}>
          Track event participation and guild activity.
        </p>
        <div style={{ marginTop: 16, height: 1, background: "linear-gradient(90deg, rgba(212,175,55,0.45), transparent)" }} />
      </div>

      {loading ? (
        <div style={{ color: "#94a3b8", padding: 40 }}>Loading...</div>
      ) : (
        <>
          {/* KPI STRIP */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
            <KPI label="Present"         value={presentCount}      color="#22c55e" />
            <KPI label="Late"            value={lateCount}         color="#f59e0b" />
            <KPI label="Absent"          value={absentCount}       color="#ef4444" />
            <KPI label="Attendance Rate" value={`${attendanceRate}%`} color="#D4AF37" />
          </div>

          {/* EVENT STATS BAR */}
          {totalMarked > 0 && (
            <div style={{ ...glassCard, marginBottom: 16, padding: "14px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: "#f8e7b0", fontWeight: 700 }}>
                  📊 {selectedEventObj?.name} — {formatDate(selectedEventObj?.date ?? "")}
                  {selectedEventObj?.time && (
                    <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 6 }}>
                      {formatTimePH(selectedEventObj.time)}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 12, color: "#64748b" }}>{totalMarked} marked</span>
              </div>
              {/* Stacked bar */}
              <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", gap: 2 }}>
                {presentPct > 0 && <div style={{ width: `${presentPct}%`, background: "#22c55e", borderRadius: "99px 0 0 99px" }} />}
                {latePct    > 0 && <div style={{ width: `${latePct}%`,    background: "#f59e0b" }} />}
                {absentPct  > 0 && <div style={{ width: `${absentPct}%`,  background: "#ef4444", borderRadius: "0 99px 99px 0" }} />}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                {[
                  { label: `Present ${presentPct}%`, color: "#22c55e" },
                  { label: `Late ${latePct}%`,       color: "#f59e0b" },
                  { label: `Absent ${absentPct}%`,   color: "#ef4444" },
                ].map(({ label, color }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                    <span style={{ color: "#94a3b8" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOP ROW: Create + Select */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

            {/* CREATE EVENT */}
            <div style={glassCard}>
              <h3 style={sectionTitle}>➕ Create Event</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={input}>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} style={{ background: "#1e293b", color: "#f8fafc" }}>{t}</option>
                  ))}
                </select>
                <input type="date" value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)} style={input} />
                <div style={{ position: "relative" }}>
                  <input
                    type="time"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    style={input}
                  />
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    PH Time (Asia/Manila) • {eventTime ? formatTimePH(eventTime) : "—"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  <button onClick={createEvent} style={{ ...goldButton, width: "100%", marginTop: 0 }}>
                    + Create Event
                  </button>
                </div>
              </div>
            </div>

            {/* SELECT EVENT */}
            <div style={glassCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ ...sectionTitle, margin: 0 }}>🗓 Select Event</h3>
                {selectedEvent && (
                  <button
                    onClick={() => deleteEvent(selectedEvent)}
                    style={{ padding: "5px 12px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.10)", color: "#ef4444", cursor: "pointer", fontSize: 12 }}
                  >
                    🗑 Delete Event
                  </button>
                )}
              </div>
              {/* Type filter */}
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...input, marginBottom: 10 }}>
                <option value="All" style={{ background: "#1e293b" }}>All Types</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t} style={{ background: "#1e293b" }}>{t}</option>
                ))}
              </select>
              <select value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)} style={input}>
                {filteredEvents.map((ev) => (
                  <option key={ev.id} value={ev.id} style={{ background: "#1e293b", color: "#f8fafc" }}>
                    {formatEventLabel(ev)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* SEARCH */}
          <div style={{ marginBottom: 16 }}>
            <input
              placeholder="Search by IGN, Class, or Role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...input, width: "100%", boxSizing: "border-box" }}
            />
          </div>

          {/* MAIN GRID */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>

            {/* LEFT — UNMARKED */}
            <div style={glassCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ ...sectionTitle, margin: 0 }}>
                  👥 Unmarked ({filteredUnmarked.length})
                </h3>
                <button onClick={addAllPresent} style={greenButton}>✓ Mark All Present</button>
              </div>

              {filteredUnmarked.length === 0 ? (
                <p style={{ color: "#86efac", margin: 0 }}>All members marked! 🎉</p>
              ) : (
                filteredUnmarked.map((m) => {
                  const streak = getStreak(m.id, events, attendance);
                  return (
                    <div key={m.id} style={memberRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 700, color: "#f8fafc", fontSize: 14 }}>{m.ign}</span>
                          {streak >= 3 && (
                            <span title={`${streak} event streak!`} style={streakBadge}>
                              🔥 {streak}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                          {m.class} • {m.role}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          onClick={() => setSelectedMember(m)}
                          style={historyBtn}
                          title="View history"
                        >📋</button>
                        <StatusButton label="P" title="Present" color="#16a34a" onClick={() => markAttendance(m.id, "Present")} />
                        <StatusButton label="L" title="Late"    color="#d97706" onClick={() => markAttendance(m.id, "Late")} />
                        <StatusButton label="A" title="Absent"  color="#dc2626" onClick={() => markAttendance(m.id, "Absent")} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* RIGHT — REPORT */}
            <div style={glassCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ ...sectionTitle, margin: 0 }}>
                  📊 Report ({totalMarked})
                </h3>
                <button onClick={() => setShowConfirmClear(true)} style={dangerButton}>❌ Clear All</button>
              </div>

              {eventAttendance.length === 0 ? (
                <p style={{ color: "#64748b", margin: 0 }}>No records yet.</p>
              ) : (
                // Sort: Present first, then Late, then Absent
                [...eventAttendance]
                  .sort((a, b) => {
                    const order: Record<string, number> = { Present: 0, Late: 1, Absent: 2 };
                    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
                  })
                  .map((a) => {
                    const m = members.find((x) => x.id === a.member_id);
                    const sc = statusColor(a.status);
                    return (
                      <div key={a.id} style={memberRow}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 700, color: "#f8fafc", fontSize: 14 }}>{m?.ign ?? "Unknown"}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{m?.class}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            fontSize: 12, fontWeight: 700, padding: "3px 10px",
                            borderRadius: 20, background: `${sc}18`,
                            border: `1px solid ${sc}40`, color: sc,
                          }}>{a.status}</span>
                          <button
                            onClick={() => setSelectedMember(m ?? null)}
                            style={historyBtn}
                            title="View history"
                          >📋</button>
                          <button onClick={() => removeAttendance(a.member_id)} style={removeBtn}>×</button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </>
      )}

      {/* ── MEMBER HISTORY MODAL ── */}
      {selectedMember && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}
          onClick={() => setSelectedMember(null)}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #0f172a, #1e293b)",
              border: "1px solid rgba(212,175,55,0.25)",
              borderRadius: 24, padding: 32,
              maxWidth: 480, width: "90%",
              boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, color: "#f8e7b0", fontSize: 20 }}>{selectedMember.ign}</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
                  {selectedMember.class} • {selectedMember.role}
                </p>
              </div>
              <button onClick={() => setSelectedMember(null)} style={{
                background: "none", border: "none", color: "#64748b",
                fontSize: 22, cursor: "pointer", lineHeight: 1,
              }}>×</button>
            </div>

            {/* Streak */}
            {(() => {
              const streak = getStreak(selectedMember.id, events, attendance);
              const history = getMemberHistory(selectedMember.id, events, attendance, 10);
              const attended = history.filter((h) => h.status === "Present" || h.status === "Late").length;
              const total    = history.filter((h) => h.status !== null).length;
              const rate     = total === 0 ? 0 : Math.round((attended / total) * 100);

              return (
                <>
                  {/* Mini stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                    <MiniStat label="Streak" value={streak >= 3 ? `🔥 ${streak}` : streak.toString()} color="#f59e0b" />
                    <MiniStat label="Attended" value={`${attended}/${total}`} color="#22c55e" />
                    <MiniStat label="Rate" value={`${rate}%`} color="#D4AF37" />
                  </div>

                  {/* History timeline */}
                  <div style={{ marginBottom: 8, fontSize: 12, color: "#64748b", fontWeight: 600, letterSpacing: 0.5 }}>
                    LAST {history.length} EVENTS (newest first)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {history.map(({ event, status }) => {
                      const sc = status ? statusColor(status) : "#334155";
                      return (
                        <div key={event.id} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "8px 12px", borderRadius: 10,
                          background: status ? `${sc}0d` : "rgba(255,255,255,0.02)",
                          border: `1px solid ${status ? `${sc}30` : "rgba(255,255,255,0.05)"}`,
                        }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#f8fafc" }}>{event.name}</div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{formatDate(event.date)}</div>
                          </div>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
                            background: `${sc}18`, border: `1px solid ${sc}40`,
                            color: status ? sc : "#334155",
                          }}>
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

      {/* ── CONFIRM CLEAR MODAL ── */}
      {showConfirmClear && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "linear-gradient(135deg, #0f172a, #1e293b)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 24, padding: 36, maxWidth: 420, width: "90%",
            boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
          }}>
            <h2 style={{ margin: 0, color: "#f8e7b0", fontSize: 22 }}>⚠️ Clear All Records?</h2>
            <p style={{ color: "#94a3b8", marginTop: 12, marginBottom: 28 }}>
              This will permanently remove all attendance records for this event. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setShowConfirmClear(false)} style={{
                padding: "12px 20px", borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)", color: "#f8fafc",
                cursor: "pointer", fontWeight: 600,
              }}>Cancel</button>
              <button onClick={removeAll} style={{
                padding: "12px 20px", borderRadius: 14, border: "none",
                background: "linear-gradient(135deg, #b91c1c, #ef4444)",
                color: "white", cursor: "pointer", fontWeight: 700,
              }}>Yes, Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── SUB-COMPONENTS ── */

function KPI({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{
      padding: 20, borderRadius: 20,
      background: "linear-gradient(135deg, rgba(212,175,55,0.14), rgba(255,255,255,0.03))",
      border: "1px solid rgba(212,175,55,0.18)",
      boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
    }}>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 12, textAlign: "center",
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${color}25`,
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{label}</div>
    </div>
  );
}

function StatusButton({ label, title, color, onClick }: {
  label: string; title: string; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 36, height: 36, borderRadius: 10,
      border: `1px solid ${color}60`, background: `${color}22`,
      color, fontWeight: 700, fontSize: 13, cursor: "pointer",
    }}
      onMouseEnter={(e) => { (e.currentTarget).style.background = `${color}44`; }}
      onMouseLeave={(e) => { (e.currentTarget).style.background = `${color}22`; }}
    >{label}</button>
  );
}

/* ── STYLES ── */
const glassCard: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.03))",
  border: "1px solid rgba(212,175,55,0.16)",
  borderRadius: 24, padding: 20, marginBottom: 0,
  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0, marginBottom: 14,
  color: "#f8e7b0", fontSize: 15, fontWeight: 700,
};

const input: React.CSSProperties = {
  padding: 11, borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#1e293b", color: "#f8fafc",
  width: "100%", fontSize: 14,
  colorScheme: "dark", boxSizing: "border-box",
};

const memberRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "10px 12px", borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  marginBottom: 8,
};

const goldButton: React.CSSProperties = {
  padding: "11px 20px", borderRadius: 12, border: "none",
  background: "linear-gradient(135deg, #D4AF37, #f8e7b0)",
  color: "#111827", fontWeight: 700, cursor: "pointer", fontSize: 14,
};

const greenButton: React.CSSProperties = {
  padding: "7px 13px", borderRadius: 10,
  border: "1px solid rgba(34,197,94,0.3)",
  background: "rgba(34,197,94,0.12)", color: "#22c55e",
  fontWeight: 600, cursor: "pointer", fontSize: 12,
};

const dangerButton: React.CSSProperties = {
  padding: "7px 13px", borderRadius: 10,
  border: "1px solid rgba(239,68,68,0.3)",
  background: "rgba(239,68,68,0.10)", color: "#ef4444",
  fontWeight: 600, cursor: "pointer", fontSize: 12,
};

const removeBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  border: "1px solid rgba(239,68,68,0.3)",
  background: "rgba(239,68,68,0.10)", color: "#ef4444",
  cursor: "pointer", fontSize: 16,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const historyBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  border: "1px solid rgba(212,175,55,0.2)",
  background: "rgba(212,175,55,0.08)", color: "#f8e7b0",
  cursor: "pointer", fontSize: 13,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const streakBadge: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 20,
  background: "rgba(251,191,36,0.15)",
  border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24",
};