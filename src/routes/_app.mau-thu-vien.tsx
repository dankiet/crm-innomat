import { createFileRoute, redirect } from "@tanstack/react-router";
import { ALL_PRODUCTS_SLUG } from "@/lib/product-categories";

export const Route = createFileRoute("/_app/mau-thu-vien")({
  beforeLoad: () => {
    throw redirect({
      to: "/san-pham",
      search: { nhom: ALL_PRODUCTS_SLUG, web: "public" },
    });
  },
  component: () => null,
});
