import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A surface, defined by its hairline.
 *
 * `border` rather than `ring`: a ring paints outside the box, so two cards in
 * a tight grid overlap their outlines and the seam between them renders at
 * double weight. On a dashboard this dense that reads as a misalignment.
 *
 * `interactive` opts into the hover lift. It is not the default — most cards
 * on this page are read, not clicked, and a surface that reacts to the pointer
 * is making a promise about being actionable.
 */
function Card({
  className,
  size = "default",
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  interactive?: boolean
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card py-5 text-sm text-card-foreground shadow-card",
        "data-[size=sm]:gap-3 data-[size=sm]:rounded-xl data-[size=sm]:py-4",
        "has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0",
        "*:[img:first-child]:rounded-t-2xl *:[img:last-child]:rounded-b-2xl",
        interactive && "lift",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 px-5 group-data-[size=sm]/card:px-4",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        "[.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-display text-[0.9375rem] leading-snug font-semibold tracking-tight group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[0.8125rem] text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-5 group-data-[size=sm]/card:px-4", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-border p-5 group-data-[size=sm]/card:p-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * The small bordered square that sits before a card's label.
 *
 * It appears on every tile in the reference design and is the main reason the
 * headers read as a set. Bordered rather than filled — a filled plate on every
 * card would put eleven blocks of colour on the page before any data does.
 */
function CardIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="card-icon"
      className={cn(
        // A soft filled plate rather than an outlined one. Outlined plates put
        // a second hairline inside a card that is already defined by one, and
        // the two weights fight at this size.
        "flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/70",
        "[&_svg]:size-[1.0625rem] [&_svg]:stroke-[1.75]",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  CardIcon,
}
