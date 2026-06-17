import { useEffect, useRef, useState } from "react";
import { AtSign, Bell, Check, Plus, Trash2, Upload } from "lucide-react";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import Avatar from "../components/ui/Avatar";
import { Reveal } from "../components/ui/motion";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../providers/ToastProvider";
import { updateProfile, uploadAvatar, updateAvatar, updateNudgePhrases, USERNAME_TAKEN } from "../lib/api";

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_PHRASES = 5;
const PHRASE_MAX = 80;

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [phrases, setPhrases] = useState<string[]>(profile?.nudge_phrases ?? []);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [phrasesBusy, setPhrasesBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const googlePhoto = (user?.user_metadata?.avatar_url || user?.user_metadata?.picture) as
    | string
    | undefined;

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setUsername(profile.username);
    setAvatarUrl(profile.avatar_url ?? null);
    setPhrases(profile.nudge_phrases ?? []);
  }, [profile]);

  const cleanPhrases = phrases.map((p) => p.trim()).filter(Boolean);
  const phrasesDirty =
    JSON.stringify(cleanPhrases) !== JSON.stringify(profile?.nudge_phrases ?? []);

  const savePhrases = async () => {
    setPhrasesBusy(true);
    try {
      await updateNudgePhrases(phrases);
      await refreshProfile();
      toast.success("Frases guardadas.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPhrasesBusy(false);
    }
  };

  const cleanName = name.trim();
  const cleanUsername = username.trim().toLowerCase();
  const usernameValid = USERNAME_RE.test(cleanUsername);
  const dirty = cleanName !== (profile?.name || "") || cleanUsername !== (profile?.username || "");
  const canSave = Boolean(cleanName) && usernameValid && dirty && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateProfile({ name: cleanName, username: cleanUsername });
      await refreshProfile();
      toast.success("Perfil actualizado.");
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(msg === USERNAME_TAKEN ? "Ese usuario ya está en uso, prueba otro." : msg);
    } finally {
      setSaving(false);
    }
  };

  const setPhoto = async (work: () => Promise<string | null>, ok: string) => {
    setPhotoBusy(true);
    try {
      const url = await work();
      setAvatarUrl(url);
      await refreshProfile();
      toast.success(ok);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Elige un archivo de imagen.");
    if (file.size > MAX_AVATAR_BYTES) return toast.error("La imagen supera 3 MB.");
    await setPhoto(async () => {
      const url = await uploadAvatar(file);
      await updateAvatar(url);
      return url;
    }, "Foto actualizada.");
  };

  return (
    <Reveal className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Tu perfil</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Actualiza cómo te ven tus amigos en Rivo.
      </p>

      <Card className="mt-6">
        {/* Photo */}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <Avatar id={user?.id || ""} name={cleanName || "?"} src={avatarUrl} size="xl" />
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <Button
                variant="secondary"
                size="sm"
                disabled={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" /> Cambiar foto
              </Button>
              {googlePhoto && avatarUrl !== googlePhoto ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={photoBusy}
                  onClick={() => setPhoto(async () => (await updateAvatar(googlePhoto), googlePhoto), "Foto de Google aplicada.")}
                >
                  Usar la de Google
                </Button>
              ) : null}
              {avatarUrl ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={photoBusy}
                  onClick={() => setPhoto(async () => (await updateAvatar(null), null), "Foto quitada.")}
                >
                  <Trash2 className="h-4 w-4" /> Quitar
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-slate-400">JPG, PNG o GIF · máx. 3 MB</p>
          </div>
        </div>

        <div className="my-5 h-px bg-slate-100 dark:bg-slate-800" />

        <div className="space-y-4">
          <div>
            <label className="field-label">Nombre</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          </div>

          <div>
            <label className="field-label">Usuario</label>
            <div className="relative">
              <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                style={{ paddingLeft: "2.25rem" }}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="tu_usuario"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave) handleSave();
                }}
              />
            </div>
            {username && !usernameValid ? (
              <p className="mt-1 text-xs text-rose-500">3-24 caracteres: letras, números o guion bajo.</p>
            ) : null}
          </div>

          <div>
            <label className="field-label">Correo</label>
            <Input value={user?.email || ""} disabled readOnly />
            <p className="mt-1 text-xs text-slate-400">Vinculado a tu cuenta de Google. No se puede cambiar aquí.</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button loading={saving} disabled={!canSave} onClick={handleSave}>
            <Check className="h-4 w-4" /> Guardar cambios
          </Button>
        </div>
      </Card>

      {/* Reminder phrases for the "timbre" (nudge) button */}
      <Card className="mt-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-brand-500" />
          <h2 className="text-base font-semibold">Frases del timbre</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cuando toques el timbre 🔔 en una deuda donde eres acreedor, se enviará una de estas frases al deudor.
          Define hasta {MAX_PHRASES} (máx. {PHRASE_MAX} caracteres). Si no defines ninguna, se envía un recordatorio por defecto.
        </p>

        <div className="mt-4 space-y-2">
          {phrases.map((phrase, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={phrase}
                maxLength={PHRASE_MAX}
                placeholder="Ej. ¿Te acuerdas de la deuda? 🙂"
                onChange={(e) =>
                  setPhrases((prev) => prev.map((p, idx) => (idx === i ? e.target.value.slice(0, PHRASE_MAX) : p)))
                }
              />
              <button
                type="button"
                aria-label="Quitar frase"
                onClick={() => setPhrases((prev) => prev.filter((_, idx) => idx !== i))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15 dark:hover:text-rose-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {phrases.length === 0 ? (
            <p className="text-xs text-slate-400">Aún no tienes frases. Se enviará un recordatorio por defecto.</p>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={phrases.length >= MAX_PHRASES}
            onClick={() => setPhrases((prev) => [...prev, ""])}
          >
            <Plus className="h-4 w-4" /> Añadir frase
          </Button>
          <Button size="sm" loading={phrasesBusy} disabled={!phrasesDirty} onClick={savePhrases}>
            <Check className="h-4 w-4" /> Guardar frases
          </Button>
        </div>
      </Card>
    </Reveal>
  );
}
