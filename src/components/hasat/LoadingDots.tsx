import { useEffect, useState } from "react";
import { ProgressDots } from "./ProgressDots";

export function LoadingDots({ className }: { className?: string }) {
  const [i, setI] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p % 3) + 1), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={className ?? "py-12"}>
      <ProgressDots current={i} total={3} />
    </div>
  );
}
