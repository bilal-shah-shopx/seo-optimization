import type { ReactNode } from "react";
import { Link } from "react-router";

// In-app navigation inside the embedded iframe. React Router's Link keeps the
// session and App Bridge URL sync intact (see README: "Navigating/redirecting
// breaks an embedded app").
export function AppLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      style={{ color: "#005bd3", textDecoration: "none", fontWeight: 500 }}
    >
      {children}
    </Link>
  );
}
