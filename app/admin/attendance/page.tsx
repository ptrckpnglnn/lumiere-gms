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

export default function AttendancePage() {
  const [members, setMembers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [attendance, setAttendance] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // NEW EVENT FORM
  const [eventType, setEventType] = useState("Guild League");
  const [eventDate, setEventDate] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);

    const [m, e, a] = await Promise.all([
      supabase.from("members").select("*").order("ign", { ascending: true }),
      supabase.from("events").select("*").order("date", { ascending: false }),
      supabase.from("attendance").select("*"),
    ]);

    setMembers(m.data || []);
    setEvents(e.data || []);
    setAttendance(a.data || []);

    if (e.data?.length && !selectedEvent) {
      setSelectedEvent(e.data[0].id);
    }

    setLoading(false);
  }

  async function createEvent() {
    if (!eventDate) {
      toast.error("Please choose a date");
      return;
    }

    const { data, error } = await supabase
      .from("events")
      .insert([{ name: eventType, type: eventType, date: eventDate }])
      .select();

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data) {
      setEvents([data[0], ...events]);
      setSelectedEvent(data[0].id);
      setEventDate("");
      toast.success("Event created!");
    }
  }

  async function markAttendance(memberId: string, status: string) {
    const points = status === "Present" ? 5 : status === "Late" ? 2 : 0;

    const { error } = await supabase.from("attendance").upsert(
      { member_id: memberId, event_id: selectedEvent, status, points },
      { onConflict: "member_id,event_id" }
    );

    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`);
    fetchAll();
  }

  async function removeAttendance(memberId: string) {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("member_id", memberId)
      .eq("event_id", selectedEvent);

    if (error) return toast.error(error.message);
    toast.success("Removed");
    fetchAll();
  }

  async function addAllPresent() {
    const toInsert = filteredUnmarked.map((m) => ({
      member_id: m.id,
      event_id: selectedEvent,
      status: "Present",
      points: 5,
    }));

    const { error } = await supabase
      .from("attendance")
      .upsert(toInsert, { onConflict: "member_id,event_id" });

    if (error) return toast.error(error.message);
    toast.success("All marked Present!");
    fetchAll();
  }

  async function removeAll() {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("event_id", selectedEvent);

    if (error) return toast.error(error.message);
    toast.success("Event cleared");
    setShowConfirmClear(false);
    fetchAll();
  }

  const eventAttendance = attendance.filter((a) => a.event_id === selectedEvent);
  const markedIds = new Set(eventAttendance.map((a) => a.member_id));

  const filteredUnmarked = members.filter(
    (m) =>
      !markedIds.has(m.id) &&
      (m.ign?.toLowerCase().includes(search.toLowerCase()) ||
        m.class?.toLowerCase().includes(search.toLowerCase()) ||
        m.role?.toLowerCase().includes(search.toLowerCase()))
  );

  const presentCount = eventAttendance.filter((a) => a.status === "Present").length;
  const lateCount = eventAttendance.filter((a) => a.status === "Late").length;
  const absentCount = eventAttendance.filter((a) => a.status === "Absent").length;
  const totalMarked = eventAttendance.length;
  const attendanceRate =
    members.length === 0
      ? 0
      : Math.round(((presentCount + lateCount) / members.length) * 100);

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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 18,
              marginBottom: 24,
            }}
          >
            <KPI label="Present" value={presentCount} color="#22c55e" />
            <KPI label="Late" value={lateCount} color="#f59e0b" />
            <KPI label="Absent" value={absentCount} color="#ef4444" />
            <KPI label="Attendance Rate" value={`${attendanceRate}%`} color="#D4AF37" />
          </div>

          {/* CREATE EVENT */}
          <div style={glassCard}>
            <h3 style={sectionTitle}>➕ Create Event</h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                style={input}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} style={{ background: "#1e293b", color: "#f8fafc" }}>{t}</option>
                ))}
              </select>

              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                style={input}
              />

              <div style={{ gridColumn: "1 / -1" }}>
                <button onClick={createEvent} style={{ ...goldButton, width: "100%" }}>
                  + Create Event
                </button>
              </div>
            </div>
          </div>

          {/* EVENT SELECTOR + SEARCH */}
          <div style={glassCard}>
            <h3 style={sectionTitle}>🗓 Select Event</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <select
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                style={input}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id} style={{ background: "#1e293b", color: "#f8fafc" }}>
                    {ev.name} — {ev.date}
                  </option>
                ))}
              </select>

              <input
                placeholder="Search by IGN, Class, or Role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={input}
              />
            </div>
          </div>

          {/* MAIN GRID */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22 }}
          >
            {/* LEFT — UNMARKED MEMBERS */}
            <div style={glassCard}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h3 style={{ ...sectionTitle, margin: 0 }}>
                  👥 Unmarked ({filteredUnmarked.length})
                </h3>
                <button onClick={addAllPresent} style={greenButton}>
                  ✓ Mark All Present
                </button>
              </div>

              {filteredUnmarked.length === 0 ? (
                <p style={{ color: "#86efac", margin: 0 }}>
                  All members marked! 🎉
                </p>
              ) : (
                filteredUnmarked.map((m) => (
                  <div key={m.id} style={memberRow}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#f8fafc" }}>
                        {m.ign}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                        {m.class} • {m.role}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <StatusButton
                        label="P"
                        title="Present"
                        color="#16a34a"
                        onClick={() => markAttendance(m.id, "Present")}
                      />
                      <StatusButton
                        label="L"
                        title="Late"
                        color="#d97706"
                        onClick={() => markAttendance(m.id, "Late")}
                      />
                      <StatusButton
                        label="A"
                        title="Absent"
                        color="#dc2626"
                        onClick={() => markAttendance(m.id, "Absent")}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* RIGHT — EVENT REPORT */}
            <div style={glassCard}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h3 style={{ ...sectionTitle, margin: 0 }}>
                  📊 Report ({totalMarked})
                </h3>
                <button
                  onClick={() => setShowConfirmClear(true)}
                  style={dangerButton}
                >
                  ❌ Clear All
                </button>
              </div>

              {eventAttendance.length === 0 ? (
                <p style={{ color: "#64748b", margin: 0 }}>No records yet.</p>
              ) : (
                eventAttendance.map((a) => {
                  const m = members.find((x) => x.id === a.member_id);
                  const statusColor =
                    a.status === "Present"
                      ? "#22c55e"
                      : a.status === "Late"
                      ? "#f59e0b"
                      : "#ef4444";

                  return (
                    <div key={a.id} style={memberRow}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#f8fafc" }}>
                          {m?.ign ?? "Unknown"}
                        </div>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                          {m?.class}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              color: statusColor,
                              fontWeight: 700,
                              fontSize: 14,
                            }}
                          >
                            {a.status}
                          </div>
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>
                            {a.points} pts
                          </div>
                        </div>
                        <button
                          onClick={() => removeAttendance(a.member_id)}
                          style={removeBtn}
                          title="Remove record"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* CONFIRM CLEAR MODAL */}
      {showConfirmClear && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #0f172a, #1e293b)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 24,
              padding: 36,
              maxWidth: 420,
              width: "90%",
              boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
            }}
          >
            <h2 style={{ margin: 0, color: "#f8e7b0", fontSize: 22 }}>
              ⚠️ Clear All Records?
            </h2>
            <p style={{ color: "#94a3b8", marginTop: 12, marginBottom: 28 }}>
              This will permanently remove all attendance records for this event.
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowConfirmClear(false)}
                style={{
                  padding: "12px 20px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#f8fafc",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={removeAll}
                style={{
                  padding: "12px 20px",
                  borderRadius: 14,
                  border: "none",
                  background: "linear-gradient(135deg, #b91c1c, #ef4444)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── SUB-COMPONENTS ── */

function KPI({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 20,
        background:
          "linear-gradient(135deg, rgba(212,175,55,0.14), rgba(255,255,255,0.03))",
        border: `1px solid rgba(212,175,55,0.18)`,
        boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
      }}
    >
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function StatusButton({
  label,
  title,
  color,
  onClick,
}: {
  label: string;
  title: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        border: `1px solid ${color}60`,
        background: `${color}22`,
        color,
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLButtonElement).style.background = `${color}44`;
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLButtonElement).style.background = `${color}22`;
      }}
    >
      {label}
    </button>
  );
}

/* ── STYLES ── */

const glassCard: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.03))",
  border: "1px solid rgba(212,175,55,0.16)",
  borderRadius: 24,
  padding: 24,
  marginBottom: 22,
  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 16,
  color: "#f8e7b0",
  fontSize: 18,
  fontWeight: 700,
};

const input: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#1e293b",
  color: "#f8fafc",
  width: "100%",
  fontSize: 14,
  colorScheme: "dark",
};

const memberRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  marginBottom: 10,
};

const goldButton: React.CSSProperties = {
  padding: "12px 20px",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg, #D4AF37, #f8e7b0)",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontSize: 14,
};

const greenButton: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 12,
  border: "1px solid rgba(34,197,94,0.3)",
  background: "rgba(34,197,94,0.15)",
  color: "#22c55e",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

const dangerButton: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 12,
  border: "1px solid rgba(239,68,68,0.3)",
  background: "rgba(239,68,68,0.12)",
  color: "#ef4444",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

const removeBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid rgba(239,68,68,0.3)",
  background: "rgba(239,68,68,0.12)",
  color: "#ef4444",
  cursor: "pointer",
  fontSize: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};