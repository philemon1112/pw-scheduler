import { Fragment } from "react";

import { cn } from "@/lib/utils";

/** WhatsApp's own formatting — *bold* and _italic_ — shown the way the chat will show it. */
export function WaText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-2xl rounded-tl-sm bg-[#e7f6dc] px-3.5 py-3 [overflow-wrap:anywhere] text-[0.875rem] leading-relaxed text-[#111b21] shadow-[0_1px_1px_rgb(0_0_0/0.08)]", className)}>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i ? <br /> : null}
          {line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, j) =>
            part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
              <strong key={j}>{part.slice(1, -1)}</strong>
            ) : part.startsWith("_") && part.endsWith("_") && part.length > 2 ? (
              <em key={j}>{part.slice(1, -1)}</em>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            )
          )}
        </Fragment>
      ))}
    </div>
  );
}
