"use client";
import { AuthProvider } from "@/lib/auth";
import { NavBar } from "./nav-bar";
import { AuthGate } from "./auth-gate";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NavBar />
      <main className="flex-1">
        <AuthGate>{children}</AuthGate>
      </main>
    </AuthProvider>
  );
}
