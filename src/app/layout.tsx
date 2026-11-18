import type { Metadata, Viewport } from "next";
import NextTopLoader from "nextjs-toploader";

import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: { default: "PW Scheduler", template: "%s · PW Scheduler" },
  description: "Public witnessing rota for Westlands English Congregation.",
  // Nothing in this app is meant for search engines; public member pages add
  // their own noindex too.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#17201b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>
        {/* The thin bar on navigation, in the accent — Budgeteer's answer to
            "did my tap register?" on a slow connection. */}
        <NextTopLoader color="#1f6f4a" height={2} showSpinner={false} shadow={false} />
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
