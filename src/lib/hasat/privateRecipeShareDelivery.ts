export type PrivateRecipeShareNavigator = Pick<Navigator, "share" | "clipboard">;

export type PrivateRecipeShareDeliveryResult = "shared" | "copied" | "aborted";

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "AbortError"
  );
}

export async function deliverPrivateRecipeShareUrl(
  url: string,
  navigatorObject: PrivateRecipeShareNavigator,
): Promise<PrivateRecipeShareDeliveryResult> {
  if (typeof navigatorObject.share === "function") {
    try {
      await navigatorObject.share({ title: "Özel tarifim", url });
      return "shared";
    } catch (error) {
      if (isAbortError(error)) return "aborted";
    }
  }

  try {
    if (typeof navigatorObject.clipboard?.writeText !== "function") throw new Error();
    await navigatorObject.clipboard.writeText(url);
    return "copied";
  } catch {
    // Do not attach the original errors: browser errors can include the capability URL.
    throw new Error("private_recipe_share_delivery_failed");
  }
}
