"use client";

import { theme } from "../../styles/theme";

export default function SectionTitle({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <h2
      style={{
        color: theme.colors.goldSoft,
        marginBottom: 14,
        fontSize: 22,
        fontWeight: 700,
      }}
    >
      {children}
    </h2>
  );
}