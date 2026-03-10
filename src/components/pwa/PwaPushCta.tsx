import { BellRing, BellOff, Smartphone, X } from "lucide-react";

import { useBleupPwa } from "@/components/pwa/BleupPwaRuntime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PwaPushCtaProps = {
  className?: string;
  compact?: boolean;
};

export function PwaPushCta({ className, compact = false }: PwaPushCtaProps) {
  const { push } = useBleupPwa();
  const quietModeActive = push.canUseQuietMode && push.deliveryMode === "quiet_ios";

  const shouldRender =
    push.isAvailable && (push.isSubscribed || push.permissionState === "denied" || push.canShowEnableCta);

  if (!shouldRender) return null;

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
            {push.canUseQuietMode ? (
              <>
                <Button
                  type="button"
                  variant={quietModeActive ? "default" : "outline"}
                  size={compact ? "sm" : "default"}
                  onClick={() => push.setDeliveryMode("quiet_ios")}
                  disabled={push.isBusy || quietModeActive}
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
