"use client";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

// ── TYPES ──────────────────────────────────────────────
type Member = {
  id: string;
  ign: string;
  class: string;
  role: string;
};

type Party = {
  id: string;
  name: string;
  roster_type: "Main" | "Sub";
  commander_id: string | null;
  member_ids: string[];
};

type Event = { id: string; name: string; date: string };
type Att   = { id: string; member_id: string; event_id: string; status: string };

function statusColor(s: string) {
  if (s === "Present") return "#22c55e";
  if (s === "Late")    return "#f59e0b";
  if (s === "Absent")  return "#ef4444";
  return "#94a3b8";
}

function getStreak(memberId: string, events: Event[], attendance: Att[]): number {
  let streak = 0;
  for (const ev of events) {
    const r = attendance.find((a) => a.member_id === memberId && a.event_id === ev.id);
    if (r && (r.status === "Present" || r.status === "Late")) streak++;
    else break;
  }
  return streak;
}

function getMemberStats(memberId: string, events: Event[], attendance: Att[], n = 6) {
  const history = events.slice(0, n).map((ev) => {
    const r = attendance.find((a) => a.member_id === memberId && a.event_id === ev.id);
    return { event: ev, status: r?.status ?? null };
  });
  const recorded = history.filter((h) => h.status !== null);
  const attended  = recorded.filter((h) => h.status === "Present" || h.status === "Late").length;
  const rate      = recorded.length === 0 ? 0 : Math.round((attended / recorded.length) * 100);
  return { history, attended, total: recorded.length, rate };
}

const PARTY_SIZE = 5;

const ALL_CLASSES = [
  "Lord Knight", "Paladin", "High Wizard", "Professor", "Sniper",
  "Minstrel", "Gypsy", "High Priest", "Champion", "Mastersmith",
  "Biochemist", "Assassin Cross", "Stalker", "Summoner",
];

const SUPPORT_CLASSES = ["High Priest", "Professor", "Minstrel", "Gypsy"];
const TANK_CLASSES    = ["Lord Knight", "Paladin", "Champion"];
const HEALER_CLASSES  = ["High Priest"];
const DPS_CLASSES     = [
  "High Wizard", "Sniper", "Biochemist", "Assassin Cross",
  "Stalker", "Mastersmith", "Summoner",
];

function classColor(cls: string): string {
  if (HEALER_CLASSES.includes(cls)) return "#34d399";
  if (["Professor", "Minstrel", "Gypsy"].includes(cls)) return "#a78bfa";
  if (TANK_CLASSES.includes(cls)) return "#60a5fa";
  if (DPS_CLASSES.includes(cls)) return "#fbbf24";
  return "#94a3b8";
}

function classIcon(cls: string): string {
  const map: Record<string, string> = {
    "Lord Knight": "⚔️", "Paladin": "🛡️", "High Wizard": "🔮",
    "Professor": "📖", "Sniper": "🏹", "Minstrel": "🎵",
    "Gypsy": "🎶", "High Priest": "✨", "Champion": "👊",
    "Mastersmith": "🔨", "Biochemist": "⚗️", "Assassin Cross": "🗡️",
    "Stalker": "🌑", "Summoner": "🐾",
  };
  return map[cls] || "⚔️";
}

function getWarnings(party: Party, members: Member[]): string[] {
  const pm = party.member_ids
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean) as Member[];
  if (pm.length === 0) return [];
  const warnings: string[] = [];
  if (!pm.some((m) => HEALER_CLASSES.includes(m.class)))  warnings.push("No Healer");
  if (!pm.some((m) => SUPPORT_CLASSES.includes(m.class))) warnings.push("No Support");
  if (!pm.some((m) => TANK_CLASSES.includes(m.class)))    warnings.push("No Tank");
  if (!pm.some((m) => DPS_CLASSES.includes(m.class)))     warnings.push("No DPS");
  if (!party.commander_id)                                 warnings.push("No Commander");
  if (pm.filter((m) => SUPPORT_CLASSES.includes(m.class)).length > 2)
    warnings.push("Too many Supports");
  return warnings;
}

async function saveParty(party: Party) {
  const { error } = await supabase.from("parties").upsert(
    { id: party.id, name: party.name, roster_type: party.roster_type,
      commander_id: party.commander_id, member_ids: party.member_ids },
    { onConflict: "id" }
  );
  if (error) throw error;
}

async function deletePartyFromDB(id: string) {
  const { error } = await supabase.from("parties").delete().eq("id", id);
  if (error) throw error;
}

async function syncMemberRole(memberId: string, role: "Main" | "Sub") {
  const { error } = await supabase
    .from("members")
    .update({ role })
    .eq("id", memberId);
  if (error) throw error;
}
export default function PartyPage() {
  const [members,    setMembers]    = useState<Member[]>([]);
  const [parties,    setParties]    = useState<Party[]>([]);
  const [events,     setEvents]     = useState<Event[]>([]);
  const [attendance, setAttendance] = useState<Att[]>([]);
  const [tab,        setTab]        = useState<"Main" | "Sub">("Main");
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState<string | null>(null);
  const [poolFilter, setPoolFilter] = useState("All");

  const dragMember = useRef<string | null>(null);
  const dragSource = useRef<string | null>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [m, p, e, a] = await Promise.all([
      supabase.from("members").select("*").order("ign"),
      supabase.from("parties").select("*").order("name"),
      supabase.from("events").select("*").order("date", { ascending: false }),
      supabase.from("attendance").select("*"),
    ]);
    setMembers(m.data || []);
    setParties(p.data || []);
    setEvents(e.data || []);
    setAttendance(a.data || []);
    setLoading(false);
  }

  // ── PARTY CRUD ──
  async function addParty() {
    const existing = parties.filter((p) => p.roster_type === tab);
    const newParty: Party = {
      id: crypto.randomUUID(),
      name: `Party ${existing.length + 1}`,
      roster_type: tab,
      commander_id: null,
      member_ids: [],
    };
    try {
      await saveParty(newParty);
      setParties((prev) => [...prev, newParty]);
      toast.success("Party created!");
    } catch { toast.error("Failed to create party"); }
  }

  async function deleteParty(id: string) {
    try {
      await deletePartyFromDB(id);
      setParties((prev) => prev.filter((p) => p.id !== id));
      toast.success("Party deleted");
    } catch { toast.error("Failed to delete party"); }
  }

  async function renameParty(id: string, name: string) {
    const updated = parties.map((p) => p.id === id ? { ...p, name } : p);
    setParties(updated);
    try { await saveParty(updated.find((p) => p.id === id)!); }
    catch { toast.error("Failed to rename"); }
  }

  async function setCommander(partyId: string, memberId: string) {
    const updated = parties.map((p) =>
      p.id === partyId
        ? { ...p, commander_id: p.commander_id === memberId ? null : memberId }
        : p
    );
    setParties(updated);
    setSaving(partyId);
    try { await saveParty(updated.find((p) => p.id === partyId)!); toast.success("Commander updated"); }
    catch { toast.error("Failed to save"); }
    finally { setSaving(null); }
  }

  // ── REMOVE MEMBER FROM PARTY ──
  async function removeMemberFromParty(partyId: string, memberId: string) {
    const updated = parties.map((p) =>
      p.id === partyId
        ? {
            ...p,
            member_ids: p.member_ids.filter((id) => id !== memberId),
            commander_id: p.commander_id === memberId ? null : p.commander_id,
          }
        : p
    );
    setParties(updated);
    setSaving(partyId);
    try { await saveParty(updated.find((p) => p.id === partyId)!); toast.success("Member removed"); }
    catch { toast.error("Failed to save"); }
    finally { setSaving(null); }
  }

  // ── DRAG & DROP ──
  function onDragStart(memberId: string, sourcePartyId: string | "pool") {
    dragMember.current = memberId;
    dragSource.current = sourcePartyId;
  }

  async function onDropToParty(targetPartyId: string) {
    const memberId = dragMember.current;
    const sourceId = dragSource.current;
    if (!memberId || targetPartyId === sourceId) return;

    const target = parties.find((p) => p.id === targetPartyId);
    if (!target) return;
    if (target.member_ids.includes(memberId)) return;
    if (target.member_ids.length >= PARTY_SIZE) {
      toast.error(`Party is full (max ${PARTY_SIZE})`); return;
    }

    const updated = parties.map((p) => {
      if (p.id === sourceId)
        return { ...p,
          member_ids: p.member_ids.filter((id) => id !== memberId),
          commander_id: p.commander_id === memberId ? null : p.commander_id,
        };
      if (p.id === targetPartyId)
        return { ...p, member_ids: [...p.member_ids, memberId] };
      return p;
    });

    setParties(updated);
    // Optimistically update member role in local state
    setMembers((prev) =>
      prev.map((m) => m.id === memberId ? { ...m, role: target.roster_type } : m)
    );
    setSaving(targetPartyId);
    try {
      const saves = [updated.find((p) => p.id === targetPartyId)!];
      if (sourceId !== "pool") saves.push(updated.find((p) => p.id === sourceId)!);
      await Promise.all([
        ...saves.map(saveParty),
        syncMemberRole(memberId, target.roster_type),
      ]);
      toast.success(`Added & role set to ${target.roster_type}`);
    } catch { toast.error("Failed to save"); }
    finally { setSaving(null); }

    dragMember.current = null;
    dragSource.current = null;
  }

  async function onDropToPool(e: React.DragEvent) {
    e.preventDefault();
    const memberId = dragMember.current;
    const sourceId = dragSource.current;
    if (!memberId || sourceId === "pool") return;

    const updated = parties.map((p) =>
      p.id === sourceId
        ? { ...p,
            member_ids: p.member_ids.filter((id) => id !== memberId),
            commander_id: p.commander_id === memberId ? null : p.commander_id,
          }
        : p
    );
    setParties(updated);
    const src = updated.find((p) => p.id === sourceId);
    if (src) {
      setSaving(sourceId);
      try { await saveParty(src); }
      catch { toast.error("Failed to save"); }
      finally { setSaving(null); }
    }
    dragMember.current = null;
    dragSource.current = null;
  }

  async function clearParty(partyId: string) {
    const updated = parties.map((p) =>
      p.id === partyId ? { ...p, member_ids: [], commander_id: null } : p
    );
    setParties(updated);
    try { await saveParty(updated.find((p) => p.id === partyId)!); toast.success("Party cleared"); }
    catch { toast.error("Failed to clear"); }
  }

  // ── DERIVED ──
  const tabParties = parties.filter((p) => p.roster_type === tab);

  // All IDs assigned to ANY party across both tabs
  const allAssignedIds = new Set(parties.flatMap((p) => p.member_ids));

  // Pool = all members NOT assigned anywhere, filtered by class
  const poolMembers = members
    .filter((m) => !allAssignedIds.has(m.id))
    .filter((m) => poolFilter === "All" || m.class === poolFilter);

  const totalWarnings = tabParties.reduce(
    (sum, p) => sum + getWarnings(p, members).length, 0
  );

  // Classes present in pool (for filter dropdown)
  const poolClasses = Array.from(
    new Set(members.filter((m) => !allAssignedIds.has(m.id)).map((m) => m.class))
  ).sort();

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "#f8fafc" }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 32, color: "#f8e7b0", fontWeight: 800 }}>
          ⚔️ Party Organizer
        </h1>
        <p style={{ marginTop: 6, color: "#94a3b8", fontSize: 14 }}>
          Build and manage party compositions for guild events.
        </p>
        <div style={{ marginTop: 16, height: 1, background: "linear-gradient(90deg, rgba(212,175,55,0.45), transparent)" }} />
      </div>

      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading...</p>
      ) : (
        <>
          {/* ── TABS + SUMMARY ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {(["Main", "Sub"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={tab === t ? activeTabBtn : inactiveTabBtn}>
                {t === "Main" ? "⚔️" : "🛡️"} {t} Roster
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Pill label="Parties"    value={tabParties.length}  color="#D4AF37" />
              <Pill label="Assigned"   value={tabParties.flatMap((p) => p.member_ids).length} color="#22c55e" />
              <Pill label="Unassigned" value={members.filter((m) => !allAssignedIds.has(m.id)).length} color="#94a3b8" />
              <Pill label="Warnings"   value={totalWarnings}      color={totalWarnings > 0 ? "#ef4444" : "#22c55e"} />
              <button onClick={addParty} style={addPartyBtn}>+ Add Party</button>
            </div>
          </div>

          {/* ── MAIN LAYOUT ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>

            {/* ── PARTIES GRID ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {tabParties.length === 0 ? (
                <div style={{ gridColumn: "1 / -1", ...emptyState }}>
                  No parties yet. Click <b>+ Add Party</b> to get started.
                </div>
              ) : (
                tabParties.map((party) => {
                  const partyMembers = party.member_ids
                    .map((id) => members.find((m) => m.id === id))
                    .filter(Boolean) as Member[];
                  const warnings  = getWarnings(party, members);
                  const isSaving  = saving === party.id;
                  const isFull    = partyMembers.length >= PARTY_SIZE;
                  const commander = members.find((m) => m.id === party.commander_id);

                  return (
                    <div
                      key={party.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDropToParty(party.id)}
                      style={{
                        ...partyCard,
                        borderColor: warnings.length > 0
                          ? "rgba(239,68,68,0.35)"
                          : "rgba(212,175,55,0.18)",
                        opacity: isSaving ? 0.75 : 1,
                      }}
                    >
                      {/* Party header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <input
                          value={party.name}
                          onChange={(e) => renameParty(party.id, e.target.value)}
                          style={partyNameInput}
                        />
                        <span style={{ fontSize: 12, color: isFull ? "#f59e0b" : "#94a3b8", flexShrink: 0 }}>
                          {partyMembers.length}/{PARTY_SIZE}
                        </span>
                        <button onClick={() => clearParty(party.id)} style={iconBtn} title="Clear party">↺</button>
                        <button onClick={() => deleteParty(party.id)} style={iconBtnRed} title="Delete party">×</button>
                      </div>

                      {/* Commander row */}
                      <div style={{
                        marginBottom: 10, padding: "7px 10px", borderRadius: 10,
                        background: "rgba(212,175,55,0.08)",
                        border: "1px solid rgba(212,175,55,0.2)", fontSize: 12,
                      }}>
                        <span style={{ color: "#f8e7b0", fontWeight: 700 }}>👑 </span>
                        {commander
                          ? <span style={{ color: "#f8fafc" }}>{commander.ign} <span style={{ color: "#64748b" }}>({commander.class})</span></span>
                          : <span style={{ color: "#64748b" }}>None — click ★ on a member</span>
                        }
                      </div>

                      {/* Warnings */}
                      {warnings.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                          {warnings.map((w) => (
                            <span key={w} style={warningBadge}>⚠ {w}</span>
                          ))}
                        </div>
                      )}

                      {/* Members */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {partyMembers.length === 0 ? (
                          <div style={{ padding: 14, textAlign: "center", color: "#334155", fontSize: 13, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.08)" }}>
                            Drop members here
                          </div>
                        ) : (
                          partyMembers.map((m) => (
                            <MemberChip
                              key={m.id}
                              member={m}
                              isCommander={party.commander_id === m.id}
                              onDragStart={() => onDragStart(m.id, party.id)}
                              onSetCommander={() => setCommander(party.id, m.id)}
                              onRemove={() => removeMemberFromParty(party.id, m.id)}
                            />
                          ))
                        )}
                        {/* Empty slots */}
                        {Array.from({ length: Math.max(0, PARTY_SIZE - partyMembers.length) }).map((_, i) => (
                          <div key={i} style={emptySlot} />
                        ))}
                      </div>

                      {isSaving && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "#64748b", textAlign: "right" }}>saving…</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* ── MEMBER POOL ── */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDropToPool}
              style={poolContainer}
            >
              {/* Pool header */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: "#f8e7b0", fontSize: 15, marginBottom: 2 }}>
                  🎒 Unassigned Pool
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {members.filter((m) => !allAssignedIds.has(m.id)).length} unassigned • all roles
                </div>
              </div>

              {/* Class filter */}
              <select
                value={poolFilter}
                onChange={(e) => setPoolFilter(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "#1e293b", color: "#f8fafc",
                  fontSize: 13, marginBottom: 10, colorScheme: "dark",
                }}
              >
                <option value="All" style={{ background: "#1e293b" }}>All Classes</option>
                {poolClasses.map((c) => (
                  <option key={c} value={c} style={{ background: "#1e293b" }}>{classIcon(c)} {c}</option>
                ))}
              </select>

              {/* Pool members */}
              {poolMembers.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#334155", fontSize: 13 }}>
                  {poolFilter !== "All"
                    ? `No unassigned ${poolFilter}s`
                    : "All members assigned 🎉"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "68vh", overflowY: "auto" }}>
                  {poolMembers.map((m) => (
                    <MemberChip
                      key={m.id}
                      member={m}
                      isCommander={false}
                      onDragStart={() => onDragStart(m.id, "pool")}
                      onSetCommander={() => {}}
                      hideCommander
                      showRole
                      events={events}
                      attendance={attendance}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── MEMBER CHIP ─────────────────────────────────────────
function MemberChip({
  member, isCommander, onDragStart, onSetCommander, onRemove,
  hideCommander, showRole, events = [], attendance = [],
}: {
  member: Member;
  isCommander: boolean;
  onDragStart: () => void;
  onSetCommander: () => void;
  onRemove?: () => void;
  hideCommander?: boolean;
  showRole?: boolean;
  events?: Event[];
  attendance?: Att[];
}) {
  const [hovered, setHovered] = useState(false);
  const [mouseY,  setMouseY]  = useState(0);
  const color = classColor(member.class);
  const showTooltip = hovered && events.length > 0;

  const streak = getStreak(member.id, events, attendance);
  const stats  = getMemberStats(member.id, events, attendance, 6);

  function handleMouseMove(e: React.MouseEvent) {
    setMouseY(e.clientY);
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        draggable
        onDragStart={onDragStart}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseMove={handleMouseMove}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px", borderRadius: 10, cursor: "grab",
          background: isCommander
            ? "linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))"
            : "rgba(255,255,255,0.04)",
          border: isCommander
            ? "1px solid rgba(212,175,55,0.35)"
            : `1px solid ${color}28`,
          userSelect: "none",
          transition: "background 0.15s",
        }}
      >
        <span style={{ fontSize: 15, flexShrink: 0 }}>{classIcon(member.class)}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isCommander && <span style={{ color: "#f8e7b0", marginRight: 4 }}>👑</span>}
            {streak >= 3 && <span style={{ marginRight: 4, fontSize: 11 }}>🔥</span>}
            {member.ign}
          </div>
          <div style={{ fontSize: 11, marginTop: 1, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color }}>{member.class}</span>
            {(showRole || member.role) && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 10,
                background: member.role === "Main" ? "rgba(212,175,55,0.15)" : "rgba(96,165,250,0.15)",
                border: member.role === "Main" ? "1px solid rgba(212,175,55,0.3)" : "1px solid rgba(96,165,250,0.3)",
                color: member.role === "Main" ? "#f8e7b0" : "#60a5fa",
              }}>
                {member.role}
              </span>
            )}
          </div>
        </div>

        {!hideCommander && (
          <button onClick={onSetCommander}
            title={isCommander ? "Remove commander" : "Set as commander"}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 13, opacity: isCommander ? 1 : 0.25,
              padding: "2px 3px", borderRadius: 4, flexShrink: 0,
              color: "#f8e7b0", transition: "opacity 0.2s",
            }}
          >★</button>
        )}

        {onRemove && (
          <button onClick={onRemove} title="Remove from party"
            style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
              border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.10)", color: "#ef4444",
              cursor: "pointer", fontSize: 13, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        )}
      </div>

      {/* ── HOVER TOOLTIP ── */}
      {showTooltip && (
        <div style={{
          position: "fixed",
          right: 308,
          top: Math.min(mouseY - 20, window.innerHeight - 380),
          width: 230, zIndex: 9999,
          background: "#0f172a",
          border: "1px solid rgba(212,175,55,0.25)",
          borderRadius: 16, padding: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
          pointerEvents: "none",
        }}>
          {/* Header */}
          <div style={{ fontWeight: 700, color: "#f8e7b0", fontSize: 13, marginBottom: 2 }}>
            {member.ign}
          </div>
          <div style={{ fontSize: 11, color, marginBottom: 10 }}>{member.class}</div>

          {/* Mini stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
            {[
              { label: "Streak", value: streak >= 3 ? `🔥${streak}` : `${streak}`, color: streak >= 3 ? "#f59e0b" : "#94a3b8" },
              { label: "Attended", value: `${stats.attended}/${stats.total}`, color: "#22c55e" },
              { label: "Rate", value: `${stats.rate}%`, color: "#D4AF37" },
            ].map(({ label, value, color: c }) => (
              <div key={label} style={{
                textAlign: "center", padding: "6px 4px", borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{value}</div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* History dots */}
          <div style={{ fontSize: 10, color: "#475569", marginBottom: 6, letterSpacing: 0.3 }}>
            LAST {stats.history.length} EVENTS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {stats.history.map(({ event, status }) => {
              const sc = status ? statusColor(status) : "#1e293b";
              return (
                <div key={event.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "4px 8px", borderRadius: 7,
                  background: status ? `${sc}10` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${status ? `${sc}25` : "rgba(255,255,255,0.04)"}`,
                }}>
                  <span style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>
                    {event.name}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 7px",
                    borderRadius: 20, flexShrink: 0, marginLeft: 6,
                    background: `${sc}18`, color: status ? sc : "#334155",
                  }}>
                    {status ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PILL ────────────────────────────────────────────────
function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "6px 14px", borderRadius: 12,
      background: "rgba(255,255,255,0.05)",
      border: `1px solid ${color}33`,
    }}>
      <span style={{ fontSize: 16, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{label}</span>
    </div>
  );
}

// ── STYLES ──────────────────────────────────────────────
const partyCard: React.CSSProperties = {
  padding: 16, borderRadius: 20,
  background: "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.03))",
  border: "1px solid rgba(212,175,55,0.18)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
  transition: "border-color 0.2s",
};

const poolContainer: React.CSSProperties = {
  position: "sticky", top: 24,
  padding: 16, borderRadius: 20,
  background: "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.03))",
  border: "1px solid rgba(212,175,55,0.16)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
};

const partyNameInput: React.CSSProperties = {
  flex: 1, minWidth: 0, background: "transparent",
  border: "none", outline: "none", color: "#f8e7b0",
  fontWeight: 700, fontSize: 15, padding: "2px 4px",
  borderRadius: 6, cursor: "text",
};

const warningBadge: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)",
  color: "#fca5a5",
};

const emptySlot: React.CSSProperties = {
  height: 36, borderRadius: 10,
  border: "1px dashed rgba(255,255,255,0.06)",
  background: "rgba(255,255,255,0.01)",
};

const emptyState: React.CSSProperties = {
  padding: 40, textAlign: "center", color: "#334155", fontSize: 14,
  borderRadius: 20, border: "1px dashed rgba(255,255,255,0.08)",
};

const iconBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)", color: "#94a3b8",
  cursor: "pointer", fontSize: 14, display: "flex",
  alignItems: "center", justifyContent: "center", flexShrink: 0,
};

const iconBtnRed: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 8,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(239,68,68,0.10)", color: "#ef4444",
  cursor: "pointer", fontSize: 16, display: "flex",
  alignItems: "center", justifyContent: "center", flexShrink: 0,
};

const addPartyBtn: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 12, border: "none",
  background: "linear-gradient(135deg, #D4AF37, #f8e7b0)",
  color: "#111827", fontWeight: 700, cursor: "pointer", fontSize: 14,
};

const activeTabBtn: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 12,
  border: "1px solid rgba(212,175,55,0.3)",
  background: "linear-gradient(135deg, #D4AF37, #F5D76E)",
  color: "#111827", fontWeight: 700, cursor: "pointer", fontSize: 14,
};

const inactiveTabBtn: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)", color: "#94a3b8",
  cursor: "pointer", fontSize: 14,
};