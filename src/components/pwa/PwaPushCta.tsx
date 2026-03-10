import { BellOff, BellRing, Smartphone, X } from "lucide-react";

import { useBleupPwa } from "@/components/pwa/BleupPwaRuntime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type PwaPushCtaProps = {
  className?: string;
  compact?: boolean;
  surface?: "default" | "bell";
};

export function PwaPushCta({ className, compact = false, surface = "default" }: PwaPushCtaProps) {
  const { push } = useBleupPwa();
  const quietModeActive = push.deliveryMode === "quiet_ios";
  const showQuietModeControls = push.canUseQuietMode || quietModeActive;
  const isBellSurface = surface === "bell";

  const shouldRender =
    push.isAvailable && (push.isSubscribed || push.permissionState === "denied" || push.canShowEnableCta);

  if (!shouldRender) return null;

  if (isBellSurface) {
    const selectedValue = push.isSubscribed
      ? quietModeActive
        ? "badge"
        : "alarm"
      : "off";

    async function handleBellModeChange(nextValue: string) {
      if (nextValue === "off") {
        await push.disable();
        return;
      }

      if (nextValue === "badge") {
        if (push.isSubscribed) {
          if (showQuietModeControls) {
            await push.setDeliveryMode("quiet_ios");
          }
          return;
        }
        await push.enableWithMode("quiet_ios");
        return;
      }

      if (push.isSubscribed) {
        await push.setDeliveryMode("normal");
        return;
      }
      await push.enableWithMode("normal");
    }

    return (
      <div className={cn("flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2", className)}>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">Notification mode</p>
          <p className="text-[11px] text-muted-foreground">
            {showQuietModeControls
              ? "Choose badge-only, alerts, or turn notifications off."
              : "Choose alerts or turn notifications off."}
          </p>
        </div>
        <Select value={selectedValue} onValueChange={(value) => void handleBellModeChange(value)} disabled={push.isBusy}>
          <SelectTrigger className="h-8 w-[112px] shrink-0 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {showQuietModeControls ? <SelectItem value="badge">Badge</SelectItem> : null}
            <SelectItem value="alarm">Alarm</SelectItem>
            <SelectItem value="off">Off</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  const isBlocked = push.permissionState === "denied" && !push.isSubscribed;
  const title = push.isSubscribed
      ? quietModeActive
        ? "Quiet notifications are on"
        : "Push notifications are on"
    : isBlocked
      ? "Push notifications are blocked"
      : "Enable push notifications";
  const description = push.isSubscribed
    ? quietModeActive
      ? "Bleup updates the app icon badge without showing visible alerts. You can switch back to alerts anytime."
      : "Get replies and generation results even when Bleup is closed."
    : isBlocked
      ? "Re-enable notifications in your browser or device settings, then return here to turn them back on."
      : push.canUseQuietMode
        ? "Get replies and generation results from the installed Bleup app. On iPhone, Bleup starts in Quiet notifications by default."
        : "Get replies and generation results from the installed Bleup app.";

  return (
    <Card className={cn("border-primary/20 bg-primary/5 shadow-none", compact ? "rounded-xl" : "", className)}>
      <CardHeader className={compact ? "px-3 pb-2 pt-3" : "pb-3"}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className={compact ? "text-sm" : "text-base"}>{title}</CardTitle>
            <CardDescription className={compact ? "text-xs" : "text-sm"}>{description}</CardDescription>
          </div>
          {!push.isSubscribed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={push.dismissEnableCta}
              aria-label="Dismiss push notifications prompt"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={cn("pt-0", compact ? "flex flex-col gap-2" : "flex flex-wrap gap-2")}>
        {push.isSubscribed ? (
          <div className={cn("flex flex-wrap gap-2", compact ? "w-full" : "")}>
            {showQuietModeControls ? (
              <>
                <Button
                  type="button"
                  variant={quietModeActive ? "default" : "outline"}
                  size={compact ? "sm" : "default"}
                  onClick={() => push.setDeliveryMode("quiet_ios")}
                  disabled={push.isBusy || quietModeActive || !push.canUseQuietMode}
                >
                  Quiet notifications
                </Button>
                <Button
                  type="button"
                  variant={!quietModeActive ? "default" : "outline"}
                  size={compact ? "sm" : "default"}
                  onClick={() => push.setDeliveryMode("normal")}
                  disabled={push.isBusy || !quietModeActive}
                >
                  Alerts
                </Button>
              </>
            ) : null}
            <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={push.disable} disabled={push.isBusy}>
              <BellOff className="mr-2 h-4 w-4" />
              Turn off
            </Button>
          </div>
        ) : isBlocked ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size={compact ? "sm" : "default"} disabled>
              <Smartphone className="mr-2 h-4 w-4" />
              Check browser settings
            </Button>
            <Button type="button" variant="ghost" size={compact ? "sm" : "default"} onClick={push.dismissEnableCta}>
              Hide for now
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size={compact ? "sm" : "default"} onClick={push.enable} disabled={push.isBusy}>
              <BellRing className="mr-2 h-4 w-4" />
              Enable push notifications
            </Button>
            {!compact ? (
              <Button type="button" variant="outline" size="default" onClick={push.dismissEnableCta}>
                Maybe later
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
