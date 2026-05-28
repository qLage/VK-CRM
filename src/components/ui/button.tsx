import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 md:gap-2 whitespace-nowrap rounded-xl md:rounded-[1.25rem] text-[10px] md:text-xs font-black uppercase tracking-widest ring-offset-background transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/40",
        destructive: "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/25 hover:bg-destructive/90",
        outline: "border border-white/10 bg-black/20 hover:bg-white/10 text-white",
        secondary: "bg-white/5 text-white hover:bg-white/10",
        ghost: "hover:bg-white/5 text-white/70 hover:text-white",
        link: "text-primary underline-offset-4 hover:underline",
        gradient: "bg-gradient-to-r from-primary to-indigo-500 text-white shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/50 border-0",
        success: "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/50 border-0",
        premium: "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/40 border border-white/10"
      },
      size: {
        default: "h-11 md:h-12 lg:h-14 px-4 md:px-6 lg:px-8",
        sm: "h-9 md:h-10 rounded-lg md:rounded-xl px-3 md:px-4 text-[9px] md:text-[10px]",
        lg: "h-14 md:h-16 rounded-[1.25rem] md:rounded-[1.5rem] px-8 md:px-10 text-xs md:text-sm",
        icon: "h-11 w-11 md:h-12 md:w-12 lg:h-14 lg:w-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
        {...(!asChild && { type: props.type || "button" })}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
