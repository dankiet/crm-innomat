import { createFileRoute, redirect } from "@tanstack/react-router";
import { fetchMe } from "@/api/functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const me = await fetchMe();
    throw redirect({ to: me ? "/tong-quan" : "/login" });
  },
});
