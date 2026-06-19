"use client";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/lib/auth";
import { AuthGate } from "./auth-gate";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <AuthProvider>
        <AuthGate>{children}</AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
