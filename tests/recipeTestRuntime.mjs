import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export function installRuntime() {
  const root = new URL("../", import.meta.url);
  const mocks = {
    react: "export const useEffect=()=>{}, useMemo=f=>f(), useRef=()=>({});",
    "@tanstack/react-query": "export const useQuery=options=>options;",
    "@/integrations/supabase/client": "export const supabase=globalThis.__recipeClient;",
    "@/lib/supabase/client": "export const supabase=globalThis.__recipeClient;",
    "@/lib/hasat/queries": "export const useAuthUserId=()=>null;",
    "@/lib/hasat/session": "export const getOrCreateSessionId=()=>null;",
    "@/lib/net/useIsOffline": "export const useIsOffline=()=>globalThis.__offline ?? false;",
    "expo-sqlite": "export const openDatabaseAsync=async()=>globalThis.__recipeDb;",
  };
  return registerHooks({
    resolve(specifier, context, next) {
      if (mocks[specifier])
        return {
          url: "data:text/javascript," + encodeURIComponent(mocks[specifier]),
          shortCircuit: true,
        };
      if (specifier.startsWith("@/")) specifier = new URL("src/" + specifier.slice(2), root).href;
      if ((specifier.startsWith(".") || specifier.startsWith("file:")) && context.parentURL) {
        const url = new URL(specifier, context.parentURL);
        if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + ".ts"))
          return next(pathToFileURL(fileURLToPath(url) + ".ts").href, context);
      }
      return next(specifier, context);
    },
  });
}
