"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-4 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

/**
 * `pill` is the default and matches the reference design: each tab is its own
 * rounded chip on a transparent track, the selected one lifting to white with
 * a hairline while the rest sit in a flat wash.
 *
 * There is no shared track behind them. A segmented control implies the
 * options are alternatives of equal weight; these are more like filters over
 * one page, and separating them lets the selected chip read as raised rather
 * than as a slider position.
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center gap-1.5 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        pill: "bg-transparent",
        segmented: "rounded-full border border-border bg-card p-1 shadow-card",
        line: "gap-4 border-b border-border",
      },
    },
    defaultVariants: { variant: "pill" },
  }
)

function TabsList({
  className,
  variant = "pill",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap",
        "text-[0.8125rem] font-medium text-muted-foreground",
        "transition-[background-color,color,border-color,box-shadow] duration-150 ease-[var(--ease-out)]",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",

        // Pill: flat wash at rest, white + hairline when selected.
        "group-data-[variant=pill]/tabs-list:h-9 group-data-[variant=pill]/tabs-list:rounded-full",
        "group-data-[variant=pill]/tabs-list:border group-data-[variant=pill]/tabs-list:border-transparent",
        "group-data-[variant=pill]/tabs-list:bg-muted group-data-[variant=pill]/tabs-list:px-4",
        "group-data-[variant=pill]/tabs-list:hover:text-foreground",
        "group-data-[variant=pill]/tabs-list:data-active:border-border",
        "group-data-[variant=pill]/tabs-list:data-active:bg-card",
        "group-data-[variant=pill]/tabs-list:data-active:text-foreground",
        "group-data-[variant=pill]/tabs-list:data-active:shadow-card",

        // Segmented: the dark selected pill used by the primary nav.
        "group-data-[variant=segmented]/tabs-list:h-9 group-data-[variant=segmented]/tabs-list:rounded-full",
        "group-data-[variant=segmented]/tabs-list:px-4",
        "group-data-[variant=segmented]/tabs-list:hover:bg-muted group-data-[variant=segmented]/tabs-list:hover:text-foreground",
        "group-data-[variant=segmented]/tabs-list:data-active:bg-inverted",
        "group-data-[variant=segmented]/tabs-list:data-active:text-inverted-foreground",

        // Line: an underline that slides in.
        "group-data-[variant=line]/tabs-list:h-10 group-data-[variant=line]/tabs-list:px-1",
        "group-data-[variant=line]/tabs-list:hover:text-foreground",
        "group-data-[variant=line]/tabs-list:data-active:text-foreground",
        "group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-0",
        "group-data-[variant=line]/tabs-list:after:-bottom-px group-data-[variant=line]/tabs-list:after:h-0.5",
        "group-data-[variant=line]/tabs-list:after:scale-x-0 group-data-[variant=line]/tabs-list:after:rounded-full",
        "group-data-[variant=line]/tabs-list:after:bg-primary",
        "group-data-[variant=line]/tabs-list:after:transition-transform group-data-[variant=line]/tabs-list:after:duration-200",
        "group-data-[variant=line]/tabs-list:data-active:after:scale-x-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-sm outline-none data-active:animate-[rise_360ms_var(--ease-out)_both]",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
