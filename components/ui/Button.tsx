import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "ghost", className = "", ...rest },
  ref,
) {
  const cls = `btn btn-${variant} ${className}`;
  return <button ref={ref} className={cls} {...rest} />;
});
