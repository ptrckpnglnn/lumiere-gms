// lib/discord.ts
// Central helper for all Discord webhook posts

const WEBHOOKS = {
  events:  process.env.WEBHOOK_EVENT_ALERTS!,
  parties: process.env.WEBHOOK_PARTY_ASSIGNMENTS!,
  alerts:  process.env.WEBHOOK_MEMBER_ALERTS!,
};

type WebhookTarget = keyof typeof WEBHOOKS;

async function sendWebhook(target: WebhookTarget, payload: object) {
  const url = WEBHOOKS[target];
  if (!url) {
    console.warn(`Discord webhook not configured for: ${target}`);
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Discord webhook error (${target}):`, text);
    throw new Error(`Discord error: ${text}`);
  }
}

// Converts "20:55" → "8:55 PM"
function formatTimePH(time: string): string {
  if (!time) return "TBA";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ── 1. EVENT ANNOUNCEMENT ─────────────────────────────
export async function postEventAnnouncement(event: {
  name: string;
  date: string;
  time?: string;
  type: string;
}) {
  const date = new Date(event.date).toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "Asia/Manila",
  });

  const timeDisplay = event.time ? formatTimePH(event.time) : "TBA";

  await sendWebhook("events", {
    content: "@everyone",
    embeds: [
      {
        title: `⚔️ ${event.name}`,
        description: [
          `A new guild event has been scheduled!`,
          ``,
          `📅 **Date:** ${date}`,
          `⏰ **Time:** ${timeDisplay} PH Time`,
          `🏷️ **Type:** ${event.type}`,
          ``,
          `📋 Please mark your attendance in <#1521106376955531374>`,
          ``,
          `*Get ready, guild members! 🏰*`,
        ].join("\n"),
        color: 0xD4AF37,
        footer: { text: "LUMIERE GMS • Event Alert" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

// ── 1b. EVENT REMINDER (1 hour before) ───────────────
export async function postEventReminder(event: {
  name: string;
  date: string;
  time?: string;
  type: string;
}) {
  const timeDisplay = event.time ? formatTimePH(event.time) : "TBA";

  await sendWebhook("events", {
    content: "@everyone",
    embeds: [
      {
        title: `⏰ 1 Hour Reminder — ${event.name}`,
        description: [
          `The event is starting in **1 hour!**`,
          ``,
          `⏰ **Time:** ${timeDisplay} PH Time`,
          `🏷️ **Type:** ${event.type}`,
          ``,
          `📋 Mark your attendance in <#1521106376955531374>`,
          ``,
          `*Prepare your gear and get in position! ⚔️*`,
        ].join("\n"),
        color: 0xF59E0B,
        footer: { text: "LUMIERE GMS • Event Reminder" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

// ── 2. PARTY DEPLOYMENT ───────────────────────────────
export async function postPartyDeployment(parties: {
  name: string;
  rosterType: string;
  commander: string | null;
  members: { ign: string; class: string }[];
}[]) {
  if (parties.length === 0) return;

  const rosterType = parties[0].rosterType;

  const fields = parties.map((party) => {
    const memberList = party.members
      .map((m) => `• **${m.ign}** — ${m.class}`)
      .join("\n");
    return {
      name: `${party.commander ? "👑 " : "⚔️ "}${party.name}${party.commander ? ` — Commander: ${party.commander}` : ""}`,
      value: memberList || "*No members assigned*",
      inline: false,
    };
  });

  await sendWebhook("parties", {
    content: "@everyone",
    embeds: [
      {
        title: `⚔️ Party Assignments — ${rosterType} Roster`,
        description: `Guild parties have been finalized!\nGet in position and coordinate with your party. 🏰`,
        color: 0xD4AF37,
        fields,
        footer: { text: "LUMIERE GMS • Party Organizer" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

// ── 3. AT-RISK / INACTIVE ALERTS ─────────────────────
export async function postMemberAlerts(
  atRisk: { ign: string; class: string; role: string }[],
  inactive: { ign: string; class: string; role: string }[]
) {
  if (atRisk.length === 0 && inactive.length === 0) return;

  const fields = [];

  if (atRisk.length > 0) {
    fields.push({
      name: "⚠️ At-Risk Members (missed last 2 events)",
      value: atRisk.map((m) => `• **${m.ign}** — ${m.class} (${m.role})`).join("\n"),
      inline: false,
    });
  }

  if (inactive.length > 0) {
    fields.push({
      name: "❌ Inactive Members (missed last 4 events)",
      value: inactive.map((m) => `• **${m.ign}** — ${m.class} (${m.role})`).join("\n"),
      inline: false,
    });
  }

  await sendWebhook("alerts", {
    embeds: [
      {
        title: "🚨 Guild Member Health Alert",
        description: "The following members have low attendance and may need a check-in.",
        color: 0xEF4444,
        fields,
        footer: { text: "LUMIERE GMS • Member Alerts" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}