import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type ProfileLike = {
  id: string;
  company_id: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url?: string | null;
};

export const ensureCompanyForUser = async (user: User, profile: ProfileLike | null) => {
  if (profile?.company_id) return profile;

  const companyName = user.user_metadata?.company_name
    || (user.user_metadata?.full_name ? `${user.user_metadata.full_name}'s Company` : "My Company");

  const { data: companyId, error } = await supabase.rpc("ensure_user_company", {
    _company_name: companyName,
  });
  if (error || !companyId) throw error || new Error("Could not create company");

  return {
    id: user.id,
    company_id: companyId,
    full_name: user.user_metadata?.full_name ?? profile?.full_name ?? null,
    email: user.email ?? profile?.email ?? null,
    avatar_url: profile?.avatar_url ?? null,
  };
};
