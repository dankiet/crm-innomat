/**
 * Registry localStorage key — một nơi duy nhất để grep/đổi key.
 *
 * Quy ước đặt key: `<feature>.<field>` (VD `pipeline.viewMode`).
 * KHÔNG đổi VALUE của key cũ — đổi là mất dữ liệu người dùng đã lưu.
 */
export const STORAGE_KEYS = {
  pipelineViewMode: "pipeline.viewMode",
  pipelineHiddenStages: "pipeline.hiddenStages",
  customerStatusFilter: "khach-hang.statusFilter",
  customerViewMode: "khach-hang.viewMode",
  quoteStatusFilter: "bao-gia.quoteStatusFilter",
  orderStatusFilter: "bao-gia.orderStatusFilter",
  quoteExportProjectSite: "quote-export-project-site",
  architectShortlist: "ebg_architect_shortlist_ids_v1",
} as const;