import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/mau-trang-chu")({
  beforeLoad: () => {
    throw redirect({
      to: "/luu-tru",
    });
  },
  component: () => null,
});
