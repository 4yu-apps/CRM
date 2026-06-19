"use client";
import Link from "next/link";
import Image from "next/image";
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
    <header className="border-b border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="4YUmkt" width={1080} height={419} priority className="h-7 w-auto" />
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
                  pathname === l.href
                    ? "bg-zinc-800 font-medium text-white"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}

        {user && (
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-zinc-400 sm:inline">{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-300 hover:bg-zinc-800 hover:text-white"
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
