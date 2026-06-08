import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/[0.04] blur-[100px]" />
      </div>

      <div className="text-center relative z-10 animate-fadeInUp">
        <div className="text-[120px] font-extrabold tracking-tighter leading-none gradient-text mb-2">
          404
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
          The page at <code className="font-mono text-xs bg-muted/50 px-1.5 py-0.5 rounded">{location.pathname}</code> does not exist.
        </p>
        <Button asChild className="rounded-xl gap-2 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-300">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
