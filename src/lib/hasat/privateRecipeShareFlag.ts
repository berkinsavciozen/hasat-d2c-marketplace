export function resolvePrivateRecipeShareEnabled(_requestedValue?: string): false {
  return false;
}

export const PRIVATE_RECIPE_SHARE_ENABLED = resolvePrivateRecipeShareEnabled();
