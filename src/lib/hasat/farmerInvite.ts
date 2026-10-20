export function loadStoredFarmerInvite(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("hasat_ref")?.trim().toUpperCase() ?? "";
}

export function storeFarmerInvite(code: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("hasat_ref", code.trim().toUpperCase());
}

export function clearStoredFarmerInvite(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("hasat_ref");
}
