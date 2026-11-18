"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A side panel.
 *
 * Built on Radix's Dialog rather than a bespoke overlay, so focus trapping,
 * scroll locking, `Esc`, and the `aria-modal` wiring all come for free — the
 * parts that are tedious to get right and invisible when you don't.
 *
 * On phones it anchors to the bottom instead of the side: a right-anchored
 * panel on a 390px screen is just a full-screen dialog with a pointless slide,
 * and the bottom edge is the reachable one.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close

function SheetContent({
  className,
  children,
  side = "adaptive",
  showClose = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  /** `adaptive` is the default: a bottom sheet on phones, a side panel above
   *  `sm`. The fixed values stay for the rare panel that must pick one. */
  side?: "adaptive" | "right" | "bottom"
  showClose?: boolean
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        // A light scrim: dark enough to say "the page is behind this", light
        // enough that the drawer's glass still has colour to show through.
        className="backdrop-motion fixed inset-0 z-50 bg-foreground/12 backdrop-blur-[2px]"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "glass-panel glass-sheet fixed z-50 flex flex-col overflow-hidden shadow-pop outline-none",
          side === "right" &&
            "panel-right inset-y-0 right-0 h-dvh w-full max-w-[26rem] border-l pt-[env(safe-area-inset-top)] [--sheet-top:env(safe-area-inset-top)] sm:rounded-l-[1.75rem]",
          // `max-h-[92dvh]` leaves a strip of the page visible above the panel,
          // which is what tells someone on a phone that this is an overlay they
          // can dismiss rather than a screen they navigated to.
          side === "bottom" &&
            "panel-bottom inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.75rem] border-t",
          // Bottom-anchored first, then re-anchored to the right at `sm`.
          // `max-h-[92dvh]` leaves a strip of page visible above the sheet,
          // which is what says "this is dismissible" rather than "you have
          // navigated somewhere".
          side === "adaptive" && [
            "panel-adaptive inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.75rem] border-t",
            "sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:max-h-none sm:w-full sm:max-w-[26rem]",
            "sm:rounded-t-none sm:rounded-l-[1.75rem] sm:border-t-0 sm:border-l",
            // Only once it is a full-height side panel does it touch the top
            // edge; as a bottom sheet on a phone it never reaches the status
            // bar, and padding it there would push the form down for nothing.
            "sm:pt-[env(safe-area-inset-top)] sm:[--sheet-top:env(safe-area-inset-top)]",
          ],
          className
        )}
        {...props}
      >
        {/* A grabber, on phones only. Bottom sheets are dragged shut on every
            other app people use, and even though this one closes by tap rather
            than drag, the bar is what says "this pulls down" — without it the
            sheet reads as a screen. */}
        {side === "adaptive" ? (
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden"
          />
        ) : null}

        {children}
        {showClose ? (
          <SheetPrimitive.Close className="absolute right-4 top-[calc(1rem+var(--sheet-top,0px))] flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("shrink-0 border-b border-border/60 px-5 py-4 pr-14", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn("font-display text-base font-bold tracking-tight", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn("text-[0.8125rem] text-muted-foreground", className)}
      {...props}
    />
  )
}

/**
 * The scrolling middle of a sheet.
 *
 * `content-start` is the load-bearing part. Every form in here is a `grid`,
 * and a grid's `align-content` resolves to `stretch` — so on a short form the
 * auto-sized rows grew to fill the panel and the fields drifted apart into an
 * evenly-spaced column, with the gaps changing size depending on how many
 * fields a particular drawer had. Packing the rows to the top keeps the
 * spacing identical in every drawer and lets the leftover room collect at the
 * bottom, where empty space is supposed to go.
 *
 * The generous `pb-6` is part of the same idea: a form that ends flush against
 * the footer reads as cut off, and the last field is the one most likely to
 * sit under a phone keyboard.
 *
 * `flex-auto`, not `flex-1`. On a phone the panel has only a `max-height`, no
 * height, and a zero flex-basis in a column that tall is where engines
 * disagree — Safari's never constrained the body, so a long receipt ran off
 * the bottom of the sheet instead of scrolling inside it. Sized from its
 * content and allowed to shrink (`min-h-0`), the body fits the space the
 * header and footer leave in every engine. `overscroll-contain` keeps a fling
 * at either end from scrolling the locked page underneath.
 */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("min-h-0 flex-auto content-start overflow-y-auto overscroll-contain px-5 pt-4 pb-6", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "shrink-0 border-t border-border/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className
      )}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
}
