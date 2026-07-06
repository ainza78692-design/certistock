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

// Default company for single-user mode (no authentication)
const DEFAULT_COMPANY_ID = "single-user-company";
const DEFAULT_USER_ID = "single-user";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | LocalUser | null>(null);
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

      const cachedUser = localAuth.getUser();
      if (cachedUser) {
        setUser(cachedUser);
        setProfile(toLocalProfile(cachedUser));
      }

      localMe()
        .then(({ user }) => {
          localAuth.setUser(user);
          setUser(user as LocalUser);
          setSession(null);
          setProfile(toLocalProfile(user));
        })
        .catch((error) => {
          if (error?.status === 401) {
            localAuth.clearToken();
            setUser(null);
            setSession(null);
            setProfile(null);
          }
        })
        .finally(() => setLoading(false));
      return;
    }

    // Auto-login with default user (no authentication required)
    const defaultUser: any = {
      id: DEFAULT_USER_ID,
      email: "system@certistock.local",
    };
    
    const defaultProfile: Profile = {
      id: DEFAULT_USER_ID,
      company_id: DEFAULT_COMPANY_ID,
      full_name: "System User",
      email: "system@certistock.local",
      avatar_url: null,
    };

    setUser(defaultUser);
    setProfile(defaultProfile);
    setSession(null);
    setLoading(false);
  }, []);

  const refreshProfile = async () => {
    if (isLocalBackend) {
      const current = await localMe();
      localAuth.setUser(current.user);
      setUser(current.user);
      setProfile(toLocalProfile(current.user));
      return;
    }
    // No-op for single-user mode
  };

  const signOut = async () => {
    if (isLocalBackend) {
      localAuth.clearToken();
      setUser(null);
      setSession(null);
      setProfile(null);
      return;
    }
    // No-op for single-user mode
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
