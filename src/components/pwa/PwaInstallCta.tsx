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
import type { InstallCtaKind } from "@/pwa/installUtils";

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

  const isIosInstall = installCtaKind === "ios";
  const isAndroidManualInstall = installCtaKind === "android-manual";
  const title = isIosInstall ? "Add Bleup to Home Screen" : "Install Bleup";
  const description = isIosInstall
    ? "Open Bleup from your iPhone home screen for faster return access."
    : isAndroidManualInstall
      ? "Add Bleup from your Android browser menu to launch it like an app."
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
              {isIosInstall ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {isIosInstall ? "Add to Home Screen" : "Install Bleup"}
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
  installCtaKind: Exclude<InstallCtaKind, null>;
  title: string;
  description: string;
  dismissInstallCta: () => void;
  openInstallExperience: () => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const isManualInstall = installCtaKind === "ios" || installCtaKind === "android-manual";

  async function handlePrimaryAction() {
    if (isManualInstall) {
      setOpen(true);
      return;
    }
    await openInstallExperience();
  }

  return (
    <>
      {children(handlePrimaryAction)}
      {isManualInstall ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="pb-[calc(1rem+var(--bleup-app-safe-bottom))]">
            <DrawerHeader>
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <div className="space-y-3 px-4 pb-2 text-sm text-muted-foreground">
              {installCtaKind === "ios" ? (
                <>
                  <InstallStep number={1}>
                    Tap the <span className="font-medium text-foreground">Share</span> button in Safari.
                  </InstallStep>
                  <InstallStep number={2}>
                    Choose <span className="font-medium text-foreground">Add to Home Screen</span>.
                  </InstallStep>
                  <InstallStep number={3}>Confirm to install Bleup and launch it like an app.</InstallStep>
                </>
              ) : (
                <>
                  <InstallStep number={1}>
                    Tap the <span className="font-medium text-foreground">Chrome menu</span> button.
                  </InstallStep>
                  <InstallStep number={2}>
                    Choose <span className="font-medium text-foreground">Install app</span> or{" "}
                    <span className="font-medium text-foreground">Add to Home screen</span>.
                  </InstallStep>
                  <InstallStep number={3}>Confirm to install Bleup and launch it like an app.</InstallStep>
                </>
              )}
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

function InstallStep({ children, number }: { children: React.ReactNode; number: number }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {number}
      </span>
      <p className="leading-6">{children}</p>
    </div>
  );
}
