import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, UserRound } from "lucide-react";
import Avatar from "./ui/Avatar";
import ThemeToggle from "./ui/ThemeToggle";
import NotificationsButton from "./NotificationsButton";
import { useAuth } from "../hooks/useAuth";
import { asset } from "../lib/paths";

export default function AppHeader() {
  const { user, profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/70 backdrop-blur-lg dark:border-slate-800/70 dark:bg-slate-950/60">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="group flex items-center gap-2">
          <img
            src={asset("brand/app-icon.svg")}
            alt="Rivo"
            width={32}
            height={32}
            className="h-8 w-8 rounded-xl shadow-glow transition-transform duration-200 group-hover:scale-105"
          />
          <span className="font-display text-lg font-semibold tracking-tight">Rivo</span>
        </Link>

        {user ? (
          <div className="flex items-center gap-1">
            <NotificationsButton />
            <ThemeToggle />
            <div className="relative" ref={ref}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="ml-1 flex items-center gap-2 rounded-full p-0.5 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <Avatar id={user.id} name={profile?.name ?? "?"} src={profile?.avatar_url} size="sm" />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-56 origin-top-right animate-scale-in rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold">{profile?.name}</p>
                    <p className="truncate text-xs text-slate-400">@{profile?.username}</p>
                  </div>
                  <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <UserRound className="h-4 w-4" />
                    Editar perfil
                  </Link>
                  <button
                    onClick={() => signOut()}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <ThemeToggle />
        )}
      </div>
    </header>
  );
}
