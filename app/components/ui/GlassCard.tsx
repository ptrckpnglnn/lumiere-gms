"use client";

import React from "react";
import { theme } from "../../styles/theme";

type Props = {
  children: React.ReactNode;
  padding?: number;
};

export default function GlassCard({
  children,
  padding = 24,
}: Props) {
  return (
    <div
      style={{
        background: theme.colors.surface,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.lg,
        padding,
        boxShadow: theme.shadow.glass,
      }}
    >
      {children}
    </div>
  );
}