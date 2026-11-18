import { cn } from "@/lib/utils";

/**
 * The title block every page opens with. One component, because the rhythm
 * between title, subtitle and the first card is what makes seven screens feel
 * like one app.
 */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-4 pt-2", className)}>
      <div className="min-w-0 grow">
        <h1 className="font-display text-[1.625rem] font-bold tracking-tight sm:text-[2rem] lg:leading-[1.1]">
          {title}
        </h1>
        {description ? <div className="mt-1.5 text-[0.875rem] text-muted-foreground">{description}</div> : null}
      </div>
      {action ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
