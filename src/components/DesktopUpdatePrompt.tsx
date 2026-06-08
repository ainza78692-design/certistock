import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getLocalApiUrl, isLocalBackend } from "@/lib/backendMode";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export default function DesktopUpdatePrompt() {
  const desktop = typeof window !== "undefined" ? window.certistockDesktop : undefined;
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [update, setUpdate] = useState<{
    currentVersion: string;
    updateAvailable: boolean;
    mandatory: boolean;
    manifest: CertiStockUpdateManifest;
  } | null>(null);

  const manifestUrl = useMemo(() => {
    if (!desktop || !isLocalBackend) return null;
    return `${getLocalApiUrl()}/updates/version.json`;
  }, [desktop]);

  const check = async (silent = true) => {
    if (!desktop || !manifestUrl || checking) return;
    setChecking(true);
    try {
      const result = await desktop.checkForUpdates(manifestUrl);
      if (result.updateAvailable) {
        setUpdate(result);
        setOpen(true);
      } else if (!silent) {
        toast.success("CertiStock is up to date");
      }
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "Could not check for updates");
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!desktop || !manifestUrl) return;
    check(true);
    const timer = window.setInterval(() => check(true), CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [desktop, manifestUrl]);

  if (!desktop || !update?.updateAvailable) return null;

  const install = async () => {
    setInstalling(true);
    try {
      const downloaded = await desktop.downloadUpdate(update.manifest);
      await desktop.installUpdate(downloaded.filePath);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
      setInstalling(false);
    }
  };

  const latest = update.manifest.latestVersion || "new";
  const releaseNotesUrl = update.manifest.releaseNotesUrl;

  return (
    <AlertDialog open={open} onOpenChange={(value) => {
      if (update.mandatory && !value) return;
      setOpen(value);
    }}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>New update available</AlertDialogTitle>
          <AlertDialogDescription>
            CertiStock {latest} is available. You are running {update.currentVersion}.
            {update.mandatory ? " This update is mandatory before you continue." : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {releaseNotesUrl && (
          <a
            href={releaseNotesUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            View release notes
          </a>
        )}
        <AlertDialogFooter>
          {!update.mandatory && (
            <AlertDialogCancel className="rounded-xl" disabled={installing}>
              Later
            </AlertDialogCancel>
          )}
          <AlertDialogAction asChild>
            <Button className="rounded-xl" onClick={install} disabled={installing}>
              {installing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download and install
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
        {!update.mandatory && (
          <Button type="button" variant="ghost" size="sm" className="w-fit rounded-xl" onClick={() => check(false)} disabled={checking || installing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            Check again
          </Button>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
