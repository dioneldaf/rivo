import { useState } from "react";
import { Bell, Repeat2, ShieldCheck } from "lucide-react";
import { Reveal, StaggerGroup, StaggerItem } from "../components/ui/motion";
import MeshGradient from "../components/dashboard/MeshGradient";
import { supabase } from "../lib/supabaseClient";
import { asset, appUrl } from "../lib/paths";
import { useToast } from "../providers/ToastProvider";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: appUrl(),
        queryParams: { prompt: "select_account" },
      },
    });
    // On success the browser navigates to Google, so nothing below runs.
    if (error) {
      setLoading(false);
      toast.error(error.message);
    }
  };

  const features = [
    { icon: ShieldCheck, text: "Cada deuda se confirma antes de contar." },
    { icon: Repeat2, text: "Transfiere deudas en cadena con aprobación." },
    { icon: Bell, text: "Notificaciones de todo lo que requiere tu atención." },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Hero */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <MeshGradient />
        <div className="grain pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay" />

        <div className="relative flex items-center gap-2">
          <img src={asset("brand/app-icon.svg")} alt="" width={36} height={36} className="h-9 w-9 rounded-xl shadow-glow" />
          <span className="text-xl font-semibold">Rivo</span>
        </div>

        <div className="relative space-y-7">
          <Reveal>
            <h1 className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl">
              Deudas claras entre amigos, sin malentendidos.
            </h1>
          </Reveal>
          <StaggerGroup className="space-y-3 text-white/90">
            {features.map((f) => (
              <StaggerItem key={f.text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <f.icon className="h-5 w-5" />
                </span>
                <span>{f.text}</span>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>

        <p className="relative text-sm text-white/70">Coordina pagos con confianza real.</p>
      </div>

      {/* Sign in */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <Reveal className="w-full max-w-sm" y={14}>
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <img src={asset("brand/app-icon.svg")} alt="" width={36} height={36} className="h-9 w-9 rounded-xl shadow-glow" />
              <span className="font-display text-xl font-semibold">Rivo</span>
            </div>
          </div>

          <h2 className="font-display text-2xl font-semibold sm:text-3xl">Entra a Rivo</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Inicia sesión o crea tu cuenta con Google. Sin contraseñas que recordar.
          </p>

          <div className="mt-8">
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <GoogleIcon className="h-5 w-5" />
              {loading ? "Conectando…" : "Continuar con Google"}
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Al continuar aceptas coordinar tus deudas de forma transparente con tus amigos.
          </p>
        </Reveal>
      </div>
    </div>
  );
}
