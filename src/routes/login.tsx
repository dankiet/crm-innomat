import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { loginFn, fetchMe } from "@/api/functions";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const me = await fetchMe();
    if (me) {
      throw redirect({ to: "/tong-quan" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await loginFn({
        data: { username: username.trim(), password },
      });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      await navigate({ to: "/tong-quan" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/logo.png"
            alt="Innomat"
            width={56}
            height={56}
            className="size-14 rounded-xl object-contain bg-white ring-1 ring-black/5 p-1 shadow-sm"
          />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
            Innomat CRM
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đăng nhập để tiếp tục
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="username"
              className="text-xs font-medium text-muted-foreground"
            >
              Tên đăng nhập
            </label>
            <input
              id="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-xs font-medium text-muted-foreground"
            >
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta"
              required
            />
          </div>

          {error ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-terracotta text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {loading ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
