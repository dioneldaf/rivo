import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { Profile } from "../lib/types";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {}
});

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId?: string | null) => {
    const targetId = userId || user?.id;
    if (!targetId) {
      setProfile(null);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("id,name,username,avatar_url,onboarded,created_at")
      .eq("id", targetId)
      .maybeSingle();

    setProfile(data || null);
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session || null);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        fetchProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        // Keep `loading` true until the profile resolves. Otherwise, right after
        // sign-in the user is set but the profile is still null for a moment, and
        // RequireProfile would bounce to /onboarding even though a profile exists.
        setLoading(true);
        fetchProfile(nextSession.user.id).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Seed the profile photo from Google the first time (when none is set yet).
  // Once the user uploads/changes their own, avatar_url is non-null and we leave it.
  useEffect(() => {
    if (!user || !profile || profile.avatar_url) return;
    const googlePic = (user.user_metadata?.avatar_url || user.user_metadata?.picture) as
      | string
      | undefined;
    if (!googlePic) return;
    supabase
      .from("profiles")
      .update({ avatar_url: googlePic })
      .eq("id", user.id)
      .then(({ error }) => {
        if (!error) setProfile((p) => (p ? { ...p, avatar_url: googlePic } : p));
      });
  }, [user, profile]);

  const refreshProfile = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, user, profile, loading, refreshProfile, signOut }),
    [session, user, profile, loading, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
