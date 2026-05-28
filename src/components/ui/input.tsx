import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || `input-${generatedId}`;
    const errorId = error ? `${inputId}-error` : undefined;

    const isInvalid = error ? true : false;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            {label}
            {props.required && <span className="text-destructive ml-1" aria-label="обязательное поле">*</span>}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          className={cn(
            "flex h-11 md:h-12 lg:h-14 w-full rounded-xl md:rounded-[1.25rem] border border-white/5 bg-black/40 px-4 lg:px-6 py-2 text-[10px] md:text-sm font-black uppercase tracking-wider ring-offset-background file:border-0 file:bg-transparent file:text-[10px] file:md:text-sm file:font-black file:uppercase file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-300 shadow-inner",
            error && "border-destructive focus-visible:ring-destructive",
            className,
          )}
          ref={ref}
          aria-invalid={isInvalid}
          aria-describedby={errorId}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-sm text-destructive mt-1.5" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
