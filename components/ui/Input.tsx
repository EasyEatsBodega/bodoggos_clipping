import { InputHTMLAttributes, forwardRef } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { label?: string };

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, className = "", id, ...rest },
  ref,
) {
  return (
    <label htmlFor={id} className="flex flex-col gap-2">
      {label && <span className="label">{label}</span>}
      <input ref={ref} id={id} className={`input-bare ${className}`} {...rest} />
    </label>
  );
});
