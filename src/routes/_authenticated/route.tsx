import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  MessageSquareText,
  CalendarClock,
  Package,
  FileText,
  Users,
  BarChart3,
  ShieldCheck,
  LogOut,
  Menu,
  Headset,
  QrCode,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import inoovawebIcon from "@/assets/inoovaweb-icon.png";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const NAV_ITEMS = [
  { to: "/metricas", label: "Dashboard", icon: BarChart3 },
  { to: "/prompt", label: "Prompt da IA", icon: MessageSquareText },
  { to: "/whatsapp", label: "WhatsApp", icon: QrCode },
  { to: "/agenda", label: "Agenda & Calendário", icon: CalendarClock },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/documentos", label: "Documentos", icon: FileText },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/atendentes", label: "Atendentes", icon: Headset },
] as const;

async function fetchIsAdmin(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  const { data } = await supabase
    .from("admins")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return !!data;
}

function NavLinks({ pathname, isAdmin, onNavigate }: { pathname: string; isAdmin?: boolean; onNavigate?: () => void }) {
  return (
    <>
      <nav className="mt-10 flex flex-1 flex-col gap-1.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-lg bg-primary/8"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className={cn("relative z-10 size-4", active ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("relative z-10", active ? "text-foreground" : "text-muted-foreground")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {isAdmin && (
        <Link
          to="/admin"
          onClick={onNavigate}
          className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ShieldCheck className="size-4" />
          Super Admin
        </Link>
      )}
    </>
  );
}

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: isAdmin } = useQuery({ queryKey: ["is-admin"], queryFn: fetchIsAdmin, staleTime: 60_000 });
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border/60 bg-card px-5 py-8 lg:flex">
        <Link to="/" className="flex items-center gap-2.5 px-2">
          <img src={inoovawebIcon} alt="InoovaWeb" className="size-8 rounded-lg" />
          <span className="text-sm font-semibold tracking-tight text-foreground">InoovaWeb</span>
        </Link>

        <NavLinks pathname={pathname} isAdmin={isAdmin} />

        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </aside>

      <header className="flex h-14 w-full items-center justify-between border-b border-border/60 bg-card px-4 lg:hidden">
        <Link to="/" className="flex items-center gap-2">
          <img src={inoovawebIcon} alt="InoovaWeb" className="size-7 rounded-lg" />
          <span className="text-sm font-semibold tracking-tight text-foreground">InoovaWeb</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-72 flex-col p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex items-center gap-2.5 px-2 pt-2">
            <img src={inoovawebIcon} alt="InoovaWeb" className="size-8 rounded-lg" />
            <span className="text-sm font-semibold tracking-tight text-foreground">InoovaWeb</span>
          </div>
          <NavLinks pathname={pathname} isAdmin={isAdmin} onNavigate={() => setMobileOpen(false)} />
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </SheetContent>
      </Sheet>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
