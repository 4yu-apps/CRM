"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { activeDataSource } from "@/lib/repo";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Leads" },
  { href: "/dashboard", label: "Dashboard" },
];

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const source = activeDataSource();
  const { user, signOut } = useAuth();

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          Garimpo
          <Badge variant={source === "supabase" ? "default" : "secondary"} className="font-normal">
            {source === "supabase" ? "Supabase" : "mock"}
          </Badge>
        </Link>

        {user && (
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
        )}

        {user && (
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              Sair
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
