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
  status: string;
};

type Party = {
  id: string;
  name: string;
  roster_type: "Main" | "Sub";
  commander_id: string | null;
  member_ids: string[];
};

const PARTY_SIZE = 5;

// Class → role bucket
const SUPPORT_CLASSES = ["High Priest", "Professor", "Minstrel", "Gypsy"];
const TANK_CLASSES    = ["Lord Knight", "Paladin", "Champion"];
const HEALER_CLASSES  = ["High Priest"];
const DPS_CLASSES     = [
  "High Wizard", "Sniper", "Biochemist", "Assassin Cross",
  "Stalker", "Mastersmith", "Summoner",
];

function classColor(cls: string): string {
  if (HEALER_CLASSES.includes(cls))  return "#34d399"; // green
  if (["Professor", "Minstrel", "Gypsy"].includes(cls)) return "#a78bfa"; // purple
  if (TANK_CLASSES.includes(cls))    return "#60a5fa"; // blue
  if (DPS_CLASSES.includes(cls))     return "#fbbf24"; // amber
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

// ── WARNINGS ───────────────────────────────────────────
function getWarnings(party: Party, members: Member[]): string[] {
  const warnings: string[] = [];
  const partyMembers = party.member_ids
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean) as Member[];

  if (partyMembers.length === 0) return [];

  const hasHealer  = partyMembers.some((m) => HEALER_CLASSES.includes(m.class));
  const hasSupport = partyMembers.some((m) => SUPPORT_CLASSES.includes(m.class));
  const hasTank    = partyMembers.some((m) => TANK_CLASSES.includes(m.class));
  const hasDPS     = partyMembers.some((m) => DPS_CLASSES.includes(m.class));
  const hasCommander = !!party.commander_id;

  if (!hasHealer)    warnings.push("No Healer");
  if (!hasSupport)   warnings.push("No Support");
  if (!hasTank)      warnings.push("No Tank");
  if (!hasDPS)       warnings.push("No DPS");
  if (!hasCommander) warnings.push("No Commander");

  const supportCount = partyMembers.filter((m) => SUPPORT_CLASSES.includes(m.class)).length;
  if (supportCount > 2) warnings.push("Too many Supports");

  return warnings;
}

// ── SUPABASE HELPERS ────────────────────────────────────
async function saveParty(party: Party) {
  const { error } = await supabase.from("parties").upsert({
    id: party.id,
    name: party.name,
    roster_type: party.roster_type,
    commander_id: party.commander_id,
    member_ids: party.member_ids,
  }, { onConflict: "id" });
  if (error) throw error;
}

async function deletePartyFromDB(id: string) {
  const { error } = await supabase.from("parties").delete().eq("id", id);
  if (error) throw error;
}

// ── MAIN COMPONENT ─────────────────────────────────────
export default function PartyPage() {
  const [members, setMembers]     = useState<Member[]>([]);
  const [parties, setParties]     = useState<Party[]>([]);
  const [tab, setTab]             = useState<"Main" | "Sub">("Main");
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState<string | null>(null);

  // drag state
  const dragMember  = useRef<string | null>(null);
  const dragSource  = useRef<string | null>(null); // party id or "pool"

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [m, p] = await Promise.all([
      supabase.from("members").select("*").order("ign"),
      supabase.from("parties").select("*").order("name"),
    ]);
    setMembers(m.data || []);
    setParties(p.data || []);
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
    const party = updated.find((p) => p.id === id)!;
    try { await saveParty(party); } catch { toast.error("Failed to rename"); }
  }

  async function setCommander(partyId: string, memberId: string) {
    const updated = parties.map((p) =>
      p.id === partyId
        ? { ...p, commander_id: p.commander_id === memberId ? null : memberId }
        : p
    );
    setParties(updated);
    const party = updated.find((p) => p.id === partyId)!;
    setSaving(partyId);
    try {
      await saveParty(party);
      toast.success("Commander updated");
    } catch { toast.error("Failed to save"); }
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
      toast.error(`Party is full (max ${PARTY_SIZE})`);
      return;
    }

    const updated = parties.map((p) => {
      if (p.id === sourceId) {
        return {
          ...p,
          member_ids: p.member_ids.filter((id) => id !== memberId),
          commander_id: p.commander_id === memberId ? null : p.commander_id,
        };
      }
      if (p.id === targetPartyId) {
        return { ...p, member_ids: [...p.member_ids, memberId] };
      }
      return p;
    });

    setParties(updated);
    setSaving(targetPartyId);
    try {
      const saves = [updated.find((p) => p.id === targetPartyId)!];
      if (sourceId !== "pool") saves.push(updated.find((p) => p.id === sourceId)!);
      await Promise.all(saves.map(saveParty));
    } catch { toast.error("Failed to save"); }
    finally { setSaving(null); }

    dragMember.current  = null;
    dragSource.current  = null;
  }

  async function onDropToPool(e: React.DragEvent) {
    e.preventDefault();
    const memberId = dragMember.current;
    const sourceId = dragSource.current;
    if (!memberId || sourceId === "pool") return;

    const updated = parties.map((p) =>
      p.id === sourceId
        ? {
            ...p,
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
    const party = updated.find((p) => p.id === partyId)!;
    try { await saveParty(party); toast.success("Party cleared"); }
    catch { toast.error("Failed to clear"); }
  }

  // ── DERIVED ──
  const tabParties   = parties.filter((p) => p.roster_type === tab);
  const tabMembers   = members.filter((m) => m.role === tab || m.role === "Main" && tab === "Main" || m.role === "Sub" && tab === "Sub");
  const rosterMembers = members.filter((m) => m.role === tab);

  const assignedIds  = new Set(tabParties.flatMap((p) => p.member_ids));
  const poolMembers  = rosterMembers.filter((m) => !assignedIds.has(m.id));

  const totalWarnings = tabParties.reduce(
    (sum, p) => sum + getWarnings(p, members).length, 0
  );

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
              <button key={t} onClick={() => setTab(t)} style={tab === t ? activeTabBtn : inactiveTabBtn}>
                {t === "Main" ? "⚔️" : "🛡️"} {t} Roster
              </button>
            ))}

            <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {/* Summary pills */}
              <Pill label="Parties"   value={tabParties.length}          color="#D4AF37" />
              <Pill label="Assigned"  value={assignedIds.size}           color="#22c55e" />
              <Pill label="Unassigned" value={poolMembers.length}        color="#94a3b8" />
              <Pill label="Warnings"  value={totalWarnings}              color={totalWarnings > 0 ? "#ef4444" : "#22c55e"} />

              <button onClick={addParty} style={addPartyBtn}>+ Add Party</button>
            </div>
          </div>

          {/* ── MAIN LAYOUT: parties + pool ── */}
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
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <input
                          value={party.name}
                          onChange={(e) => renameParty(party.id, e.target.value)}
                          style={partyNameInput}
                        />
                        <span style={{ fontSize: 12, color: isFull ? "#f59e0b" : "#94a3b8", flexShrink: 0 }}>
                          {partyMembers.length}/{PARTY_SIZE}
                        </span>
                        <button onClick={() => clearParty(party.id)} style={clearBtn} title="Clear party">↺</button>
                        <button onClick={() => deleteParty(party.id)} style={deleteBtn} title="Delete party">×</button>
                      </div>

                      {/* Commander row */}
                      <div style={{
                        marginBottom: 10, padding: "8px 10px", borderRadius: 10,
                        background: "rgba(212,175,55,0.08)",
                        border: "1px solid rgba(212,175,55,0.2)",
                        fontSize: 12,
                      }}>
                        <span style={{ color: "#f8e7b0", fontWeight: 700 }}>👑 Commander: </span>
                        {commander
                          ? <span style={{ color: "#f8fafc" }}>{commander.ign} <span style={{ color: "#64748b" }}>({commander.class})</span></span>
                          : <span style={{ color: "#64748b" }}>None — click a member's ★</span>
                        }
                      </div>

                      {/* Warnings */}
                      {warnings.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                          {warnings.map((w) => (
                            <span key={w} style={warningBadge}>⚠ {w}</span>
                          ))}
                        </div>
                      )}

                      {/* Members */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {partyMembers.length === 0 ? (
                          <div style={{ padding: 16, textAlign: "center", color: "#334155", fontSize: 13, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.08)" }}>
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
                            />
                          ))
                        )}
                        {/* Empty slots */}
                        {Array.from({ length: Math.max(0, PARTY_SIZE - partyMembers.length) }).map((_, i) => (
                          <div key={i} style={emptySlot} />
                        ))}
                      </div>

                      {isSaving && (
                        <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", textAlign: "right" }}>saving…</div>
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
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: "#f8e7b0", fontSize: 15, marginBottom: 2 }}>
                  🎒 Unassigned Pool
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {poolMembers.length} member{poolMembers.length !== 1 ? "s" : ""} • {tab} roster
                </div>
              </div>

              {poolMembers.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#334155", fontSize: 13 }}>
                  All members assigned 🎉
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "70vh", overflowY: "auto" }}>
                  {poolMembers.map((m) => (
                    <MemberChip
                      key={m.id}
                      member={m}
                      isCommander={false}
                      onDragStart={() => onDragStart(m.id, "pool")}
                      onSetCommander={() => {}}
                      hideCommander
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
  member, isCommander, onDragStart, onSetCommander, hideCommander,
}: {
  member: Member;
  isCommander: boolean;
  onDragStart: () => void;
  onSetCommander: () => void;
  hideCommander?: boolean;
}) {
  const color = classColor(member.class);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", borderRadius: 10, cursor: "grab",
        background: isCommander
          ? "linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))"
          : "rgba(255,255,255,0.04)",
        border: isCommander
          ? "1px solid rgba(212,175,55,0.35)"
          : `1px solid ${color}28`,
        transition: "all 0.15s ease",
        userSelect: "none",
      }}
    >
      {/* Class icon */}
      <span style={{ fontSize: 16, flexShrink: 0 }}>{classIcon(member.class)}</span>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isCommander && <span style={{ color: "#f8e7b0", marginRight: 4 }}>👑</span>}
          {member.ign}
        </div>
        <div style={{ fontSize: 11, color, marginTop: 1 }}>{member.class}</div>
      </div>

      {/* Commander toggle */}
      {!hideCommander && (
        <button
          onClick={onSetCommander}
          title={isCommander ? "Remove commander" : "Set as commander"}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 14, opacity: isCommander ? 1 : 0.3,
            padding: "2px 4px", borderRadius: 6, flexShrink: 0,
            transition: "opacity 0.2s",
          }}
        >
          ★
        </button>
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
  flex: 1, minWidth: 0,
  background: "transparent", border: "none", outline: "none",
  color: "#f8e7b0", fontWeight: 700, fontSize: 15,
  padding: "2px 4px", borderRadius: 6,
  cursor: "text",
};

const warningBadge: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  padding: "3px 8px", borderRadius: 20,
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.28)",
  color: "#fca5a5",
};

const emptySlot: React.CSSProperties = {
  height: 38, borderRadius: 10,
  border: "1px dashed rgba(255,255,255,0.06)",
  background: "rgba(255,255,255,0.01)",
};

const emptyState: React.CSSProperties = {
  padding: 40, textAlign: "center",
  color: "#334155", fontSize: 14,
  borderRadius: 20, border: "1px dashed rgba(255,255,255,0.08)",
};

const clearBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)", color: "#94a3b8",
  cursor: "pointer", fontSize: 14, display: "flex",
  alignItems: "center", justifyContent: "center", flexShrink: 0,
};

const deleteBtn: React.CSSProperties = {
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