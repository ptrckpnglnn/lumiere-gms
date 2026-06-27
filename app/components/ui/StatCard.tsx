"use client";

import GlassCard from "./GlassCard";
import { theme } from "../../styles/theme";

type Props = {
  title: string;
  value: number | string;
};

export default function StatCard({
  title,
  value,
}: Props) {
  return (
    <GlassCard>
      <p
        style={{
          margin: 0,
          color: theme.colors.textSecondary,
          fontSize: 14,
        }}
      >
        {title}
      </p>

      <h2
        style={{
          margin: "12px 0 0",
          color: theme.colors.goldSoft,
          fontSize: 32,
          fontWeight: 700,
        }}
      >
        {value}
      </h2>
    </GlassCard>
  );
}