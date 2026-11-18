import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Small status pills.
 *
 * Every badge carries a word, never colour alone: "Repeat", "Same day",
 * "Locked", "Couple". `outline` is the workhorse; the tinted variants are for
 * the cases where the badge is itself the alert, and `police` / `mtn` tag a
 * location.
 */
const badgeVariants = cva(
  [
    "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1.5",
    "rounded-full border border-transparent px-2.5 py-1 text-xs font-medium whitespace-nowrap",
    "transition-colors duration-150 ease-[var(--ease-out)]",
    "focus-visible:ring-[3px] focus-visible:ring-ring/40",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-muted text-secondary-foreground",
        outline: "border-border bg-card text-foreground [a]:hover:border-border-strong",
        positive: "bg-primary-soft text-accent-foreground",
        warning: "border-warning-border bg-warning text-warning-foreground",
        danger: "border-danger-border bg-danger text-danger-foreground",
        police: "bg-police-soft text-[#1d5c3e]",
        mtn: "bg-mtn-soft text-[#1f4f8f]",
        destructive: "bg-destructive/12 text-destructive",
        accent: "bg-accent text-accent-foreground",
        ghost: "text-muted-foreground hover:bg-muted",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-6",
        sm: "h-5 px-2 text-[0.6875rem]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
