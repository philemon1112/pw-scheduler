"use client";

import * as React from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog once the print font has loaded, so the PDF is never set in a fallback font. */
export function AutoPrint() {
  React.useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      window.print();
    };
    document.fonts.ready.then(() => window.setTimeout(go, 150));
    const fallback = window.setTimeout(go, 2500);
    return () => window.clearTimeout(fallback);
  }, []);
  return null;
}

export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer />
      Print or save as PDF
    </Button>
  );
}
