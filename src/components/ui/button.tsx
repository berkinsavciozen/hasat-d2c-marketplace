import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:translate-y-px aria-pressed:bg-accent aria-pressed:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-11 rounded-md px-3 text-xs",
        lg: "h-12 rounded-md px-8",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonBaseProps = VariantProps<typeof buttonVariants> & {
  className?: string;
  children?: React.ReactNode;
};

type NativeButtonProps = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & {
    asChild?: false;
    loading?: boolean;
    loadingLabel?: string;
  };

type SlottedButtonProps = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "disabled"> & {
    asChild: true;
    disabled?: never;
    loading?: never;
    loadingLabel?: never;
  };

export type ButtonProps = NativeButtonProps;

type ButtonImplementationProps = NativeButtonProps | SlottedButtonProps;

interface ButtonComponent {
  (props: SlottedButtonProps & React.RefAttributes<HTMLElement>): React.ReactElement | null;
  (props: NativeButtonProps & React.RefAttributes<HTMLButtonElement>): React.ReactElement | null;
  displayName?: string;
}

const Button = React.forwardRef<HTMLElement, ButtonImplementationProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingLabel = "İşleniyor",
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref as React.Ref<HTMLButtonElement>}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
          </span>
        )}
        <span
          className={cn("inline-flex items-center gap-2", loading && "invisible")}
          aria-hidden={loading || undefined}
        >
          {children}
        </span>
        {loading && (
          <span className="sr-only" role="status">
            {loadingLabel}
          </span>
        )}
      </button>
    );
  },
) as ButtonComponent;
Button.displayName = "Button";

export { Button, buttonVariants };
