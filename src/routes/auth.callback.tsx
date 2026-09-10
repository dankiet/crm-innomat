import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { authGoogleCallback } from "@/api/functions";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function parseHashParams(hash: string): Record<string, string> {
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const params: Record<string, string> = {};
  if (!cleanHash) return params;

  for (const part of cleanHash.split("&")) {
    const [k, v] = part.split("=");
    if (k) {
      params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }
  return params;
}

function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed) return "/";

  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) {
    return trimmed;
  }

  try {
    if (typeof window !== "undefined") {
      const parsed = new URL(trimmed);
      const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (relative.startsWith("/") && !relative.startsWith("//") && !relative.startsWith("/\\")) {
        return relative;
      }
    }
  } catch {}

  return "/";
}

function AuthCallbackPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("/");

  useEffect(() => {
    let active = true;

    async function processAuth() {
      if (typeof window === "undefined") return;

      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = parseHashParams(window.location.hash);

      const rawReturnTo = searchParams.get("returnTo") || hashParams.returnTo || "/";
      const returnTo = sanitizeReturnTo(rawReturnTo);
      setFallbackUrl(returnTo);

      // Check if error returned by provider
      const errorDesc =
        searchParams.get("error_description") ||
        hashParams.error_description ||
        searchParams.get("error") ||
        hashParams.error;

      if (errorDesc) {
        if (active) {
          setStatus("error");
          setErrorMessage(errorDesc);
        }
        return;
      }

      const code = searchParams.get("code") || undefined;
      const accessToken = hashParams.access_token || undefined;

      if (!code && !accessToken) {
        if (active) {
          setStatus("error");
          setErrorMessage("Không tìm thấy mã xác thực hoặc access token.");
        }
        return;
      }

      try {
        const result = await authGoogleCallback({
          data: {
            code,
            accessToken,
            returnTo,
          },
        });

        if (!active) return;

        if (result && result.ok) {
          setStatus("success");
          const destination = sanitizeReturnTo(result.returnTo || returnTo);
          window.location.replace(destination);
        } else {
          setStatus("error");
          setErrorMessage(result?.error || "Đăng nhập Google không thành công.");
        }
      } catch (err) {
        if (!active) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Đã xảy ra lỗi khi hoàn tất đăng nhập.",
        );
      }
    }

    processAuth();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#FAF8F5] px-4 font-sans text-[#1D1917]">
      <div className="w-full max-w-md rounded-2xl border border-[#E7E2DA] bg-white p-8 shadow-sm text-center">
        {status === "loading" && (
          <div className="space-y-4">
            <div className="inline-block size-10 animate-spin rounded-full border-3 border-[#B94A2E] border-t-transparent" />
            <h2 className="text-lg font-semibold text-[#1D1917]">Đang xác thực Google...</h2>
            <p className="text-sm text-[#78716C]">
              Vui lòng đợi giây lát trong khi chúng tôi hoàn tất phiên đăng nhập của bạn.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="inline-flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 font-bold text-xl">
              ✓
            </div>
            <h2 className="text-lg font-semibold text-[#1D1917]">Đăng nhập thành công!</h2>
            <p className="text-sm text-[#78716C]">Đang chuyển hướng bạn trở lại nội dung...</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="inline-flex size-12 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold text-xl">
              ✕
            </div>
            <h2 className="text-lg font-semibold text-red-700">Xác thực không thành công</h2>
            <p className="text-sm text-[#78716C]">{errorMessage}</p>
            <div className="pt-2">
              <a
                href={fallbackUrl}
                className="inline-block rounded-xl bg-[#B94A2E] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#A33F25] transition-colors"
              >
                Quay lại trang trước
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
