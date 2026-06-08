import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ensureCompanyForUser } from "@/lib/ensureCompany";
import { isLocalBackend } from "@/lib/backendMode";
import { localAuth, localMe, LocalUser, toLocalProfile } from "@/lib/localApi";

type Profile = {
  id: string;
  company_id: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type AuthCtx = {
  user: User | LocalUser | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (authUser: User) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
    try {
      const repairedProfile = await ensureCompanyForUser(authUser, data as Profile | null);
      setProfile(repairedProfile as Profile);
    } catch {
      setProfile(data as Profile | null);
    }
  };

  useEffect(() => {
    if (isLocalBackend) {
      const token = localAuth.getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      localMe()
        .then(({ user }) => {
          setUser(user as LocalUser);
          setSession(null);
          setProfile(toLocalProfile(user));
        })
        .catch(() => {
          localAuth.clearToken();
          setUser(null);
          setSession(null);
          setProfile(null);
        })
        .finally(() => setLoading(false));
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) setTimeout(() => loadProfile(s.user), 0);
      else setProfile(null);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfile(s.user);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (isLocalBackend) {
      const current = await localMe();
      setUser(current.user);
      setProfile(toLocalProfile(current.user));
      return;
    }
    if (user) await loadProfile(user as User);
  };
  const signOut = async () => {
    if (isLocalBackend) {
      localAuth.clearToken();
      setUser(null);
      setSession(null);
      setProfile(null);
      return;
    }
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user, session, profile, loading, refreshProfile, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
};
