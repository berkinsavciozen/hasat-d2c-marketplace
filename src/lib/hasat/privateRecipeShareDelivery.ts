export type PrivateRecipeShareNavigator = Pick<Navigator, "share" | "clipboard">;

export type PrivateRecipeShareDeliveryResult = "shared" | "copied" | "aborted";
export type PrivateRecipeShareAttemptResult = PrivateRecipeShareDeliveryResult | "failed";
export type PendingPrivateRecipeShareDelivery = {
  actionKey: string;
  token: string;
} | null;

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

export async function runPrivateRecipeShareAction({
  actionKey,
  pendingDelivery,
  grantAction,
  deliverToken,
}: {
  actionKey: string;
  pendingDelivery: PendingPrivateRecipeShareDelivery;
  grantAction: () => Promise<{ token: string }>;
  deliverToken: (token: string) => Promise<PrivateRecipeShareAttemptResult>;
}): Promise<{
  result: PrivateRecipeShareAttemptResult;
  pendingDelivery: PendingPrivateRecipeShareDelivery;
}> {
  const token =
    pendingDelivery?.actionKey === actionKey ? pendingDelivery.token : (await grantAction()).token;
  const result = await deliverToken(token);

  return {
    result,
    pendingDelivery: result === "shared" || result === "copied" ? null : { actionKey, token },
  };
}
