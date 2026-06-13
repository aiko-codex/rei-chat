import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-text": "var(--popover-foreground)",
          "--border-radius": "1rem",
          "--width": "320px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // iOS-style "liquid glass": translucent, blurred, hairline border
          toast:
            "cn-toast group !min-h-0 !gap-2 !rounded-2xl !border !border-foreground/10 " +
            "!bg-background/65 !backdrop-blur-xl !backdrop-saturate-150 !shadow-lg " +
            "!px-3.5 !py-2.5 !text-[13px]",
          title: "!text-[13px] !font-medium",
          description: "!text-xs !text-muted-foreground",
          actionButton: "!h-7 !px-2.5 !text-xs !rounded-lg",
          cancelButton: "!h-7 !px-2.5 !text-xs !rounded-lg",
          icon: "!size-4",
          closeButton:
            "!border-foreground/10 !bg-background/80 !backdrop-blur-md !text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
