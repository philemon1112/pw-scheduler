"use client";

import * as React from "react";
import { Toaster as Sonner } from "sonner";

/**
 * The app's toasts: small, quiet, and at the top.
 *
 * Top-centre rather than the bottom corner — on a phone the bottom is the tab
 * bar and the keyboard, and a toast there covers the very button that was
 * just pressed. The offset clears the notch and Dynamic Island.
 *
 * Colours come from the app's own tokens through Sonner's variables, so a
 * toast is a popover like any other rather than Sonner's
 * default white card.
 */
export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      duration={3200}
      offset={16}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "0.875rem",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "text-[0.8125rem] shadow-lg", description: "text-muted-foreground" } }}
      {...props}
    />
  );
}
