/**
 * Resolver TS cho script chạy bằng Node trực tiếp (node --import).
 * - Map `@/<x>` → <cwd>/src/<x>.ts
 * - Fallback: relative import thiếu extension (vd "./index.server") → thử +".ts"
 *   — giúp chạy module src/* dưới Node (Vite khác Node: cần extension tường minh).
 * Yêu cầu Node ≥ 22.15 (registerHooks).
 *
 * Dùng: node --import ./scripts/ts-alias.mjs ./scripts/<entry>.ts
 */
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const srcUrl = pathToFileURL(path.join(process.cwd(), "src") + path.sep).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const rest = specifier.slice(2).replace(/\.(ts|tsx)$/, "");
      return { url: `${srcUrl}${rest}.ts`, shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".")) {
        try {
          return nextResolve(specifier + ".ts", context);
        } catch {
          throw err;
        }
      }
      throw err;
    }
  },
});
