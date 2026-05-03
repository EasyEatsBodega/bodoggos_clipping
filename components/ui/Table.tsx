export function Table({ children }: { children: React.ReactNode }) {
  return <table className="w-full border-collapse">{children}</table>;
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border">
      <tr className="text-left">{children}</tr>
    </thead>
  );
}

export function TH({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`label py-3 px-3 font-normal ${className}`}>{children}</th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <tr className={`row-hover border-b border-border ${className}`}>{children}</tr>
  );
}

export function TD({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`py-3 px-3 ${className}`}>{children}</td>;
}
