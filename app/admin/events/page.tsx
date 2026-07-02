"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

const EVENT_TYPES = [
  "Guild League", "Emperium Overrun", "Guild War",
  "Raid", "Guild Meeting", "Training",
];

type EventT = { id: string; name: string; type: string; date: string; time?: string };
type Att    = { id: string; member_id: string; event_id: string; status: string };

function formatDate(raw: string) {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function formatTimePH(time?: string) {
  if (!time) return "TBA";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function isUpcoming(date: string) {
  const today = new Date().toISOString().split("T")[0];
  return date >= today;
}

export default function EventsPage() {
  const [events,     setEvents]     = useState<EventT[]>([]);
  const [attendance, setAttendance] = useState<Att[]>([]);
  const [memberCount,setMemberCount]= useState(0);
  const [loading,    setLoading]    = useState(true);
  const [typeFilter, setTypeFilter] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EventT | null>(null);

  const [eventType, setEventType] = useState("Guild League");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("20:55");

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [e, a, m] = await Promise.all([
      supabase.from("events").select("*").order("date", { ascending: false }),
      supabase.from("attendance").select("*"),
      supabase.from("members").select("id"),
    ]);
    setEvents(e.data || []);
    setAttendance(a.data || []);
    setMemberCount(m.data?.length || 0);
    setLoading(false);
  }

  async function createEvent() {
    if (!eventDate) { toast.error("Please choose a date"); return; }
    const { data, error } = await supabase
      .from("events")
      .insert([{ name: eventType, type: eventType, date: eventDate, time: eventTime }])
      .select();
    if (error) { toast.error(error.message); return; }
    if (data) {
      setEvents([data[0], ...events]);
      setEventDate("");
      setEventTime("20:55");
      setShowCreate(false);
      toast.success("Event created!");
      try {
        const res = await fetch("/api/discord/event-announce", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: data[0].id, name: data[0].name, date: data[0].date, time: data[0].time, type: data[0].type }),
        });
        if (res.ok) toast.success("📣 Announced on Discord!");
      } catch { toast.error("Event created but Discord announcement failed"); }
    }
  }

  async function deleteEvent(eventId: string) {
    await supabase.from("attendance").delete().eq("event_id", eventId);
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) { toast.error("Failed to delete event"); return; }
    setEvents(events.filter((e) => e.id !== eventId));
    setAttendance(attendance.filter((a) => a.event_id !== eventId));
    setConfirmDelete(null);
    toast.success("Event deleted");
  }

  const filteredEvents = events.filter((e) => typeFilter === "All" || e.type === typeFilter);
  const upcoming = filteredEvents.filter((e) => isUpcoming(e.date));
  const past     = filteredEvents.filter((e) => !isUpcoming(e.date));

  function getStats(ev: EventT) {
    const att = attendance.filter((a) => a.event_id === ev.id);
    const present = att.filter((a) => a.status === "Present").length;
    const late     = att.filter((a) => a.status === "Late").length;
    const absent   = att.filter((a) => a.status === "Absent").length;
    const rate = memberCount === 0 ? 0 : Math.round(((present + late) / memberCount) * 100);
    return { present, late, absent, marked: att.length, rate };
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "#f8fafc" }}>

      {/* HEADER */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32, color: "#f8e7b0", fontWeight: 800 }}>🗓 Events</h1>
            <p style={{ marginTop: 6, color: "#94a3b8", fontSize: 14 }}>Create and manage guild events.</p>
          </div>
          <button onClick={() => setShowCreate(true)} style={goldButton}>+ Create Event</button>
        </div>
        <div style={{ marginTop: 16, height: 1, background: "linear-gradient(90deg, rgba(212,175,55,0.45), transparent)" }} />
      </div>

      {loading ? <p style={{ color: "#94a3b8" }}>Loading...</p> : (
        <>
          {/* TYPE FILTER */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {["All", ...EVENT_TYPES].map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)} style={typeFilter === t ? activeFilterBtn : filterBtn}>
                {t}
              </button>
            ))}
          </div>

          {/* UPCOMING */}
          {upcoming.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h3 style={sectionLabel}>🔜 Upcoming</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                {upcoming.map((ev) => (
                  <EventCard key={ev.id} ev={ev} stats={getStats(ev)} upcoming onDelete={() => setConfirmDelete(ev)} />
                ))}
              </div>
            </div>
          )}

          {/* PAST */}
          <div>
            <h3 style={sectionLabel}>📜 Past Events</h3>
            {past.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: 13 }}>No past events yet.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                {past.map((ev) => (
                  <EventCard key={ev.id} ev={ev} stats={getStats(ev)} onDelete={() => setConfirmDelete(ev)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* CREATE MODAL */}
      {showCreate && (
        <div style={overlay} onClick={() => setShowCreate(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0, color: "#f8e7b0", fontSize: 20, marginBottom: 20 }}>➕ Create Event</h2>

            <label style={fieldLabel}>Event Type</label>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={{ ...input, marginBottom: 14 }}>
              {EVENT_TYPES.map((t) => <option key={t} style={{ background: "#1e293b" }}>{t}</option>)}
            </select>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div>
                <label style={fieldLabel}>Date</label>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={input} />
              </div>
              <div>
                <label style={fieldLabel}>Time</label>
                <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} style={input} />
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{formatTimePH(eventTime)} PH Time</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCreate(false)} style={cancelBtn}>Cancel</button>
              <button onClick={createEvent} style={goldButton}>Create & Announce</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {confirmDelete && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: 420 }}>
            <h2 style={{ margin: 0, color: "#f8e7b0", fontSize: 20 }}>⚠️ Delete Event?</h2>
            <p style={{ color: "#94a3b8", marginTop: 12, marginBottom: 28 }}>
              This will permanently delete <b style={{ color: "#f8fafc" }}>{confirmDelete.name}</b> and all its attendance records. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(null)} style={cancelBtn}>Cancel</button>
              <button onClick={() => deleteEvent(confirmDelete.id)} style={dangerBtn}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({ ev, stats, upcoming, onDelete }: {
  ev: EventT; stats: { present: number; late: number; absent: number; marked: number; rate: number };
  upcoming?: boolean; onDelete: () => void;
}) {
  return (
    <div style={{
      padding: 16, borderRadius: 18,
      background: upcoming
        ? "linear-gradient(135deg, rgba(96,165,250,0.10), rgba(255,255,255,0.03))"
        : "linear-gradient(135deg, rgba(212,175,55,0.07), rgba(255,255,255,0.02))",
      border: upcoming ? "1px solid rgba(96,165,250,0.25)" : "1px solid rgba(212,175,55,0.14)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f8fafc" }}>{ev.name}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{formatDate(ev.date)} • {formatTimePH(ev.time)}</div>
        </div>
        <button onClick={onDelete} style={miniDeleteBtn}>×</button>
      </div>

      {upcoming ? (
        <div style={{ fontSize: 12, color: "#60a5fa", marginTop: 8 }}>🔜 Scheduled</div>
      ) : (
        <>
          <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", gap: 2, marginTop: 10 }}>
            {stats.marked > 0 && (
              <>
                {stats.present > 0 && <div style={{ width: `${(stats.present / stats.marked) * 100}%`, background: "#22c55e" }} />}
                {stats.late    > 0 && <div style={{ width: `${(stats.late    / stats.marked) * 100}%`, background: "#f59e0b" }} />}
                {stats.absent  > 0 && <div style={{ width: `${(stats.absent  / stats.marked) * 100}%`, background: "#ef4444" }} />}
              </>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "#64748b" }}>
            <span>{stats.marked} marked</span>
            <span style={{ color: "#D4AF37", fontWeight: 700 }}>{stats.rate}% rate</span>
          </div>
        </>
      )}
    </div>
  );
}

/* STYLES */
const goldButton: React.CSSProperties = {
  padding: "11px 20px", borderRadius: 12, border: "none",
  background: "linear-gradient(135deg, #D4AF37, #f8e7b0)", color: "#111827",
  fontWeight: 700, cursor: "pointer", fontSize: 14,
};
const cancelBtn: React.CSSProperties = {
  padding: "11px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)", color: "#f8fafc", cursor: "pointer", fontWeight: 600, fontSize: 14,
};
const dangerBtn: React.CSSProperties = {
  padding: "11px 20px", borderRadius: 12, border: "none",
  background: "linear-gradient(135deg, #b91c1c, #ef4444)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14,
};
const filterBtn: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)", color: "#94a3b8", cursor: "pointer", fontSize: 12,
};
const activeFilterBtn: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 20, border: "1px solid rgba(212,175,55,0.3)",
  background: "linear-gradient(135deg, #D4AF37, #F5D76E)", color: "#111827", cursor: "pointer", fontWeight: 700, fontSize: 12,
};
const sectionLabel: React.CSSProperties = { color: "#f8e7b0", fontSize: 14, fontWeight: 700, marginBottom: 12 };
const input: React.CSSProperties = {
  padding: 11, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)",
  background: "#1e293b", color: "#f8fafc", width: "100%", fontSize: 14,
  colorScheme: "dark", boxSizing: "border-box",
};
const fieldLabel: React.CSSProperties = { fontSize: 12, color: "#94a3b8", marginBottom: 6, display: "block" };
const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: "linear-gradient(135deg, #0f172a, #1e293b)", border: "1px solid rgba(212,175,55,0.25)",
  borderRadius: 24, padding: 32, maxWidth: 460, width: "90%", boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
};
const miniDeleteBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 7, border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(239,68,68,0.08)", color: "#ef4444", cursor: "pointer", fontSize: 15, flexShrink: 0,
};