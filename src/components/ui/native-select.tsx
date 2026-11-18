import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A styled native `<select>`. On a phone it opens the system picker, which is
 * the best picker there is for a list of names, and it needs no portal or
 * scroll-locking to sit inside a sheet.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "h-9 w-full appearance-none rounded-xl border border-border bg-card pr-9 pl-3 text-base shadow-card transition-colors outline-none pointer-coarse:h-11 md:text-sm",
          "hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
          "disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-xl border border-border bg-card px-3 py-2 text-base shadow-card transition-colors outline-none md:text-sm",
        "placeholder:text-muted-foreground hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
        className
      )}
      {...props}
    />
  );
}

export { NativeSelect, Textarea };
