import "./lib/error-capture";

import fs from "node:fs";
import path from "node:path";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Serve files from /public (including nested /images/*).
 * TanStack Start SSR was returning SPA 404 HTML for nested public paths
 * while top-level public files still worked via Vite.
 */
function tryServePublicFile(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return null;
  }

  // Only static asset-looking paths (avoid stealing app routes)
  if (!pathname.includes(".") || pathname.includes("..")) return null;
  if (pathname.startsWith("/@") || pathname.startsWith("/src/") || pathname.startsWith("/node_modules/")) {
    return null;
  }

  const publicRoot = path.resolve(process.cwd(), "public");
  // Support both /images/x.jpg and accidental /public/images/x.jpg.
  const rel =
    pathname.startsWith("/public/")
      ? pathname.slice("/public/".length)
      : pathname.replace(/^\//, "");
  const filePath = path.resolve(publicRoot, rel);

  // Path traversal guard
  if (!filePath.startsWith(publicRoot + path.sep) && filePath !== publicRoot) {
    return null;
  }

  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return null;
  } catch {
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=86400",
  };

  if (request.method === "HEAD") {
    headers["Content-Length"] = String(fs.statSync(filePath).size);
    return new Response(null, { status: 200, headers });
  }

  const buf = fs.readFileSync(filePath);
  headers["Content-Length"] = String(buf.byteLength);
  return new Response(buf, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/_health" && request.method === "GET") {
        try {
          const { getDb } = await import("./db/index.server");
          const row = await getDb()
            .prepare("SELECT COUNT(*) AS total FROM products")
            .get<{ total: number }>();
          return new Response(
            JSON.stringify({ ok: true, products: row?.total ?? -1, provider: "pg" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, message: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      }
      const staticRes = tryServePublicFile(request);
      if (staticRes) return staticRes;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
