import { RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PwaUpdatePromptProps = {
  isRefreshing: boolean;
  onRefreshNow: () => void | Promise<void>;
  onLater: () => void;
};

export function PwaUpdatePrompt({ isRefreshing, onRefreshNow, onLater }: PwaUpdatePromptProps) {
  return (
    <div className="fixed inset-x-0 top-[var(--bleup-header-offset)] z-[70] px-[calc(0.75rem+var(--bleup-app-safe-left))] pr-[calc(0.75rem+var(--bleup-app-safe-right))] sm:px-[calc(1rem+var(--bleup-app-safe-left))] sm:pr-[calc(1rem+var(--bleup-app-safe-right))]">
      <div className="mx-auto max-w-3xl">
        <Alert className="border-primary/25 bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/90">
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <AlertTitle>Update available</AlertTitle>
              <AlertDescription>
                Refresh to get the latest Bleup update.
              </AlertDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onLater} disabled={isRefreshing}>
                Later
              </Button>
              <Button type="button" size="sm" onClick={() => void onRefreshNow()} disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh now"}
              </Button>
            </div>
          </div>
        </Alert>
      </div>
    </div>
  );
}
