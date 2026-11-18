import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Buttons.
 *
 * Pill-shaped, with Budgeteer's press feedback: a 1px downward nudge rather
 * than a scale — scaling a pill with text in it resamples the glyphs, and at
 * these sizes that reads as a blur rather than a press.
 *
 * On a touch screen every size grows to at least 44px (`pointer-coarse:`),
 * so the compact desktop controls are still easy to hit on a phone.
 *
 * `aria-haspopup` buttons are excluded from the nudge — a trigger that sinks
 * while its menu opens looks like the menu pushed it.
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full",
    "border border-transparent text-sm font-medium whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out)]",
    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
    "active:not-aria-[haspopup]:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        /* The one filled action per screen — Generate, Publish, Save. */
        default:
          "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover hover:shadow-lift",
        /* Dark, for actions that sit on the sidebar or need weight without
           competing with the green. */
        inverted:
          "bg-inverted text-inverted-foreground shadow-card hover:bg-inverted-hover hover:shadow-lift",
        /* Secondary actions. A soft grey fill, matching the reference — an
           outline here would read as equal in weight to the dark primary, and
           the row of three would have no obvious first move. */
        outline:
          "bg-muted text-foreground hover:bg-secondary",
        /* The genuinely bordered variant, for controls that sit on a card and
           need to look like inputs (date pickers, range selectors). */
        bordered:
          "border-border bg-card text-foreground shadow-card hover:border-border-strong hover:bg-muted",
        primary:
          "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover hover:shadow-lift",
        secondary:
          "bg-muted text-secondary-foreground hover:bg-secondary",
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/16 focus-visible:ring-destructive/25",
        link: "rounded-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 pointer-coarse:h-11",
        xs: "h-7 gap-1 px-2.5 text-xs pointer-coarse:h-11 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[0.8125rem] pointer-coarse:h-11 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 px-5",
        icon: "size-9 pointer-coarse:size-11",
        "icon-xs": "size-7 pointer-coarse:size-11 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 pointer-coarse:size-11",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
