import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { Leaf, Loader2, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { isLocalBackend } from "@/lib/backendMode";
import { localLogin, localSignup } from "@/lib/localApi";
import LocalServerUrlControl from "@/components/LocalServerUrlControl";

export default function Auth() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  if (user) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (isLocalBackend) {
      try {
        await localLogin(email, password);
        toast.success("Welcome back");
        navigate("/");
        window.location.reload();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not sign in");
      } finally {
        setLoading(false);
      }
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("Welcome back"); navigate("/"); }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (isLocalBackend) {
      try {
        await localSignup({ email, password, fullName: name, companyName: company });
        toast.success("Account created");
        navigate("/");
        window.location.reload();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create account");
      } finally {
        setLoading(false);
      }
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: name, company_name: company },
      },
    });
    if (error) { setLoading(false); toast.error(error.message); return; }
    setLoading(false);
    toast.success("Account created");
    navigate("/");
  };

  const inputClasses = "rounded-xl h-10 bg-background border-border focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/15 transition-all duration-300";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-background">
      {/* ─── Ambient blurs ─── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -left-[20%] w-[60%] h-[60%] rounded-full bg-primary/[0.06] blur-[100px]" />
        <div className="absolute -bottom-[30%] -right-[15%] w-[50%] h-[50%] rounded-full bg-primary/[0.04] blur-[80px]" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] rounded-full bg-success/[0.03] blur-[60px]" />
      </div>

      {/* ─── Dot grid ─── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035] dark:opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(hsl(var(--foreground)) 0.8px, transparent 0.8px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="absolute top-4 right-4 z-20 rounded-full text-muted-foreground hover:text-foreground"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <div className="w-full max-w-[420px] relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8 animate-fadeInUp">
          <div className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
            <Leaf className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight">CertiStock</div>
            <div className="text-xs text-muted-foreground">Certified stock and consumption tracking</div>
          </div>
        </div>

        {/* Auth card */}
        <div
          className="surface p-7 animate-fadeInUp"
          style={{ animationDelay: "80ms", boxShadow: "var(--shadow-lg)" }}
        >
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full mb-6 bg-muted/60 p-1 rounded-xl h-10">
              <TabsTrigger
                value="login"
                className="rounded-lg text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm transition-all duration-300"
              >
                Sign in
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="rounded-lg text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm transition-all duration-300"
              >
                Create account
              </TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Email</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClasses} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Password</Label>
                  <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClasses} />
                </div>
                <Button type="submit" className="w-full rounded-xl h-10 font-medium shadow-sm hover:shadow-md transition-all duration-300 mt-1" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Sign in
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Full name</Label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Company name</Label>
                  <Input required value={company} onChange={(e) => setCompany(e.target.value)} className={inputClasses} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Email</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClasses} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Password</Label>
                  <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClasses} />
                </div>
                <Button type="submit" className="w-full rounded-xl h-10 font-medium shadow-sm hover:shadow-md transition-all duration-300 mt-1" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <LocalServerUrlControl variant="compact" />

        <p className="text-xs text-center text-muted-foreground mt-6 animate-fadeIn" style={{ animationDelay: "250ms" }}>
          Certified stock, shipment, and consumption tracking made precise.
        </p>
      </div>
    </div>
  );
}
