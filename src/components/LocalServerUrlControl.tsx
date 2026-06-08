import { useState } from "react";
import { CheckCircle2, Loader2, Server, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getLocalApiUrl,
  isLocalBackend,
  setLocalApiUrl,
  testLocalApiUrl,
  type LocalApiHealth,
} from "@/lib/backendMode";

type LocalServerUrlControlProps = {
  variant?: "compact" | "full";
  className?: string;
};

const formatHealth = (health: LocalApiHealth) => {
  const parts = [
    health.service ? String(health.service) : null,
    health.database ? `database ${health.database}` : null,
    health.parserVersion ? String(health.parserVersion) : null,
  ].filter(Boolean);
  return parts.join(" · ") || "connected";
};

export default function LocalServerUrlControl({
  variant = "compact",
  className = "",
}: LocalServerUrlControlProps) {
  if (!isLocalBackend) return null;

  const [expanded, setExpanded] = useState(variant === "full");
  const [savedUrl, setSavedUrl] = useState(() => getLocalApiUrl());
  const [draftUrl, setDraftUrl] = useState(() => getLocalApiUrl());
  const [testing, setTesting] = useState(false);
  const [lastHealth, setLastHealth] = useState<LocalApiHealth | null>(null);

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await testLocalApiUrl(draftUrl);
      setDraftUrl(result.url);
      setLastHealth(result.health);
      toast.success(`Connected to ${result.url}`);
    } catch (error) {
      setLastHealth(null);
      toast.error(error instanceof Error ? error.message : "Could not reach local server");
    } finally {
      setTesting(false);
    }
  };

  const saveUrl = () => {
    try {
      const normalized = setLocalApiUrl(draftUrl);
      setDraftUrl(normalized);
      setSavedUrl(normalized);
      toast.success("Local server URL saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid server URL");
    }
  };

  const shellClass =
    variant === "full"
      ? "surface p-6 animate-fadeInUp"
      : "mt-4 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm animate-fadeIn";

  return (
    <div className={`${shellClass} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {variant === "full" ? <Server className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Local server</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{savedUrl}</div>
          </div>
        </div>
        {variant === "compact" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 rounded-lg text-xs"
            onClick={() => setExpanded((value) => !value)}
          >
            Change server
          </Button>
        )}
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Server URL or IP</Label>
            <Input
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
              placeholder="10.43.139.233"
              className="h-10 rounded-xl bg-background"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={runTest}
              disabled={testing}
            >
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Test connection
            </Button>
            <Button type="button" className="rounded-xl" onClick={saveUrl}>
              Save
            </Button>
          </div>
          {lastHealth && (
            <div className="rounded-xl bg-success/10 px-3 py-2 text-xs text-success">
              {formatHealth(lastHealth)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
