import * as React from "react";
import { Download, PlusSquare, Share2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useBleupPwa } from "@/components/pwa/BleupPwaRuntime";
import { cn } from "@/lib/utils";

type PwaInstallCtaProps = {
  className?: string;
  compact?: boolean;
  dismissMode?: "cooldown" | "permanent";
  dismissStorageKey?: string;
};

export function PwaInstallCta({
  className,
  compact = false,
  dismissMode = "cooldown",
  dismissStorageKey,
}: PwaInstallCtaProps) {
  const { canShowInstallCta, installCtaKind, dismissInstallCta, openInstallExperience } = useBleupPwa();
  const [isPermanentlyDismissed, setIsPermanentlyDismissed] = React.useState(() => {
    if (dismissMode !== "permanent" || !dismissStorageKey || typeof window === "undefined") return false;
    return window.localStorage.getItem(dismissStorageKey) === "1";
  });

  const dismiss = React.useCallback(() => {
    if (dismissMode === "permanent" && dismissStorageKey && typeof window !== "undefined") {
      window.localStorage.setItem(dismissStorageKey, "1");
      setIsPermanentlyDismissed(true);
      return;
    }
    dismissInstallCta();
  }, [dismissInstallCta, dismissMode, dismissStorageKey]);

  if (!canShowInstallCta || !installCtaKind || isPermanentlyDismissed) {
    return null;
  }

  const title = installCtaKind === "ios" ? "Add Bleup to Home Screen" : "Install Bleup";
  const description =
    installCtaKind === "ios"
      ? "Open Bleup from your iPhone home screen for faster return access."
      : "Install Bleup to launch it like an app and get back faster.";

  return (
    <PwaInstallDrawerBridge
      installCtaKind={installCtaKind}
      title={title}
      description={description}
      dismissInstallCta={dismiss}
      openInstallExperience={openInstallExperience}
    >
      {(openDrawer) => (
        <Card
          className={cn(
            "border-primary/20 bg-primary/5 shadow-none",
            compact ? "rounded-2xl" : "",
            className,
          )}
        >
          <CardHeader className={compact ? "pb-2" : "pb-3"}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className={compact ? "text-sm" : "text-base"}>{title}</CardTitle>
                <CardDescription className={compact ? "text-xs" : "text-sm"}>{description}</CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground"
                onClick={dismiss}
                aria-label="Dismiss install prompt"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className={cn("pt-0", compact ? "flex flex-col gap-2 sm:flex-row" : "flex flex-wrap gap-2")}>
            <Button type="button" size={compact ? "sm" : "default"} onClick={openDrawer} className="gap-2">
              {installCtaKind === "ios" ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {installCtaKind === "ios" ? "Add to Home Screen" : "Install Bleup"}
            </Button>
            {!compact ? (
              <Button type="button" variant="outline" size="default" onClick={dismiss}>
                {dismissMode === "permanent" ? "Dismiss" : "Maybe later"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}
    </PwaInstallDrawerBridge>
  );
}

function PwaInstallDrawerBridge({
  children,
  installCtaKind,
  title,
  description,
  dismissInstallCta,
  openInstallExperience,
}: {
  children: (openDrawer: () => void) => React.ReactNode;
  installCtaKind: "ios" | "chromium";
  title: string;
  description: string;
  dismissInstallCta: () => void;
  openInstallExperience: () => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);

  async function handlePrimaryAction() {
    if (installCtaKind === "ios") {
      setOpen(true);
      return;
    }
    await openInstallExperience();
  }

  return (
    <>
      {children(handlePrimaryAction)}
      {installCtaKind === "ios" ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="pb-[calc(1rem+var(--bleup-app-safe-bottom))]">
            <DrawerHeader>
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <div className="space-y-3 px-4 pb-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  1
                </span>
                <p className="leading-6">
                  Tap the <span className="font-medium text-foreground">Share</span> button in Safari.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  2
                </span>
                <p className="leading-6">
                  Choose <span className="font-medium text-foreground">Add to Home Screen</span>.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  3
                </span>
                <p className="leading-6">Confirm to install Bleup and launch it like an app.</p>
              </div>
            </div>
            <DrawerFooter>
              <Button type="button" className="gap-2" onClick={() => setOpen(false)}>
                <PlusSquare className="h-4 w-4" />
                Got it
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  dismissInstallCta();
                  setOpen(false);
                }}
              >
                Dismiss for now
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : null}
    </>
  );
}
