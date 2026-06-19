"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeDataSource } from "@/lib/repo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Leads" },
  { href: "/dashboard", label: "Dashboard" },
];

export function NavBar() {
  const pathname = usePathname();
  const source = activeDataSource();
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          Garimpo
          <Badge variant={source === "supabase" ? "default" : "secondary"} className="font-normal">
            {source === "supabase" ? "Supabase" : "mock"}
          </Badge>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                pathname === l.href ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
