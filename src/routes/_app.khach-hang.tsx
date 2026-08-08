import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout path `/khach-hang` + child `/khach-hang/$customerId`.
 * List ở index; chi tiết ở $customerId — bắt buộc Outlet.
 */
export const Route = createFileRoute("/_app/khach-hang")({
  component: () => <Outlet />,
});
