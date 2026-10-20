import { useCallback, useEffect, useState } from "react";
import { DemoExperienceCard } from "@/components/hasat/DemoExperienceCard";
import {
  readDemoDismissed,
  shouldShowDemoExperience,
  writeDemoDismissed,
  type DemoRole,
} from "@/lib/hasat/demo-experience";

export function DemoExperienceGate({
  userId,
  role,
  hasActiveListing = false,
  onOpen,
}: {
  userId: string | null | undefined;
  role: DemoRole;
  hasActiveListing?: boolean;
  onOpen?: () => void;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      setDismissed(true);
      return;
    }
    setDismissed(readDemoDismissed(window.localStorage, userId, role));
  }, [role, userId]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (userId && typeof window !== "undefined") {
      writeDemoDismissed(window.localStorage, userId, role);
    }
  }, [role, userId]);

  if (!userId || !shouldShowDemoExperience({ role, dismissed, hasActiveListing })) return null;

  return <DemoExperienceCard role={role} onDismiss={dismiss} onOpen={onOpen} />;
}
