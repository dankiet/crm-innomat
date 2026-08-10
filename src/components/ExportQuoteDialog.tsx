import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";

const DEFAULT_TERMS =
  "Tạm ứng 40% giá trị đơn hàng.\nThanh toán số tiền còn lại trong vòng 10 ngày kể từ ngày nhận đủ hàng.";
const FULL_TERMS = "Thanh toán 100% giá trị đơn hàng trước khi giao hàng.";
const DELIVERY_OPT1 =
  "Trong vòng 3-5 ngày kể từ ngày xác nhận đặt hàng và tạm ứng.";
const DELIVERY_OPT2 =
  "Trong vòng 7-10 ngày kể từ ngày xác nhận đặt hàng và tạm ứng.";

const STORAGE_KEY = "quote-export-project-site";
const HISTORY_LIMIT = 12;

type SiteMemory = {
  projectName: string;
  deliveryLocation: string;
};

/** Map theo customerId (string) hoặc "default" khi không có khách. */
type SiteMemoryMap = Record<string, SiteMemory>;

/** Lịch sử gợi ý (mới nhất trước) — dùng cho datalist. */
type SiteHistory = {
  projects: string[];
  locations: string[];
};

type StoredExportSites = {
  byCustomer: SiteMemoryMap;
  history: SiteHistory;
};

const EMPTY_STORED: StoredExportSites = {
  byCustomer: {},
  history: { projects: [], locations: [] },
};

function storageKeyFor(customerId?: number) {
  return customerId != null ? String(customerId) : "default";
}

function pushUnique(list: string[], value: string, limit: number): string[] {
  const v = value.trim();
  if (!v) return list;
  const next = [v, ...list.filter((x) => x !== v)];
  return next.slice(0, limit);
}

export type QuotePrintOptions = {
  paymentTerms: string;
  deliveryTerms: string;
  hideVat: boolean;
  showOrigin: boolean;
  showColorVariance: boolean;
  projectName: string;
  deliveryLocation: string;
};

export function ExportQuoteDialog({
  open,
  onOpenChange,
  onExport,
  isExporting,
  customerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: QuotePrintOptions) => void;
  isExporting: boolean;
  /** Lưu Công trình / Địa điểm giao theo khách hàng. */
  customerId?: number;
}) {
  const [stored, setStored] = useLocalStorageState<StoredExportSites>(
    STORAGE_KEY,
    EMPTY_STORED,
  );

  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [delivery, setDelivery] = useState(DELIVERY_OPT1);
  const [hideVat, setHideVat] = useState(false);
  const [showOrigin, setShowOrigin] = useState(false);
  const [showColorVariance, setShowColorVariance] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");

  const projectListId = "quote-export-project-suggestions";
  const locationListId = "quote-export-location-suggestions";

  const history = useMemo(() => {
    const h = stored.history ?? EMPTY_STORED.history;
    return {
      projects: Array.isArray(h.projects) ? h.projects : [],
      locations: Array.isArray(h.locations) ? h.locations : [],
    };
  }, [stored.history]);

  // Mở dialog: reset option in; nạp Công trình / Địa điểm đã lưu theo khách.
  useEffect(() => {
    if (!open) return;
    setTerms(DEFAULT_TERMS);
    setDelivery(DELIVERY_OPT1);
    setHideVat(false);
    setShowOrigin(false);
    setShowColorVariance(false);

    const key = storageKeyFor(customerId);
    // Ưu tiên state đã hydrate; fallback đọc localStorage trực tiếp
    // (tránh race lần mở đầu trước khi useLocalStorageState kịp load).
    let mem = stored.byCustomer?.[key];
    if (!mem && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as StoredExportSites;
          mem = parsed.byCustomer?.[key];
        }
      } catch {
        // ignore
      }
    }
    setProjectName(mem?.projectName ?? "");
    setDeliveryLocation(mem?.deliveryLocation ?? "");
    // Chỉ re-run khi mở dialog / đổi khách — không phụ thuộc `stored` để
    // tránh ghi đè input đang gõ khi localStorage sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId]);

  function handleExport() {
    const key = storageKeyFor(customerId);
    setStored((prev) => {
      const byCustomer = { ...(prev.byCustomer ?? {}) };
      byCustomer[key] = {
        projectName,
        deliveryLocation,
      };
      return {
        byCustomer,
        history: {
          projects: pushUnique(
            prev.history?.projects ?? [],
            projectName,
            HISTORY_LIMIT,
          ),
          locations: pushUnique(
            prev.history?.locations ?? [],
            deliveryLocation,
            HISTORY_LIMIT,
          ),
        },
      };
    });

    onExport({
      paymentTerms: terms,
      deliveryTerms: delivery,
      hideVat,
      showOrigin,
      showColorVariance,
      projectName,
      deliveryLocation,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Tùy chọn in báo giá A4 ngang</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Phương thức thanh toán:</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTerms(DEFAULT_TERMS)}
                className="px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
              >
                Mẫu 40%
              </button>
              <button
                type="button"
                onClick={() => setTerms(FULL_TERMS)}
                className="px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
              >
                Mẫu 100%
              </button>
            </div>
            <textarea
              className="w-full h-24 p-3 mt-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Nhập phương thức thanh toán..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Thời gian giao hàng:</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDelivery(DELIVERY_OPT1)}
                className="px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
              >
                Mẫu 3-5 ngày
              </button>
              <button
                type="button"
                onClick={() => setDelivery(DELIVERY_OPT2)}
                className="px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
              >
                Mẫu 7-10 ngày
              </button>
            </div>
            <textarea
              className="w-full h-20 p-3 mt-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={delivery}
              onChange={(e) => setDelivery(e.target.value)}
              placeholder="Nhập thời gian giao hàng..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Công trình:</label>
            <input
              type="text"
              list={projectListId}
              className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="VD: Công trình ABC"
              autoComplete="off"
            />
            <datalist id={projectListId}>
              {history.projects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <p className="text-[11px] text-muted-foreground">
              Tự nhớ theo khách hàng sau khi xuất báo giá.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Địa điểm giao:</label>
            <input
              type="text"
              list={locationListId}
              className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={deliveryLocation}
              onChange={(e) => setDeliveryLocation(e.target.value)}
              placeholder="VD: 123 Nguyễn Văn A, Quận 1, TP.HCM"
              autoComplete="off"
            />
            <datalist id={locationListId}>
              {history.locations.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </div>

          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Cột hiển thị</legend>
            <p className="text-xs text-muted-foreground">
              Hình ảnh sản phẩm luôn được hiển thị trong báo giá.
            </p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showOrigin}
                onChange={(e) => setShowOrigin(e.target.checked)}
                className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Hiển thị cột xuất xứ
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showColorVariance}
                onChange={(e) => setShowColorVariance(e.target.checked)}
                className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Hiển thị cột độ lệch màu
            </label>
          </fieldset>

          <label className="flex items-center gap-2 px-1 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={hideVat}
              onChange={(e) => setHideVat(e.target.checked)}
              className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Báo giá không bao gồm VAT (ẩn dòng thuế)
          </label>
        </div>

        <DialogFooter>
          <button
            type="button"
            className="h-9 px-4 rounded-lg font-medium text-sm border hover:bg-muted"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Hủy
          </button>
          <button
            type="button"
            className="h-9 px-4 rounded-lg font-medium text-sm bg-moss-soft text-moss hover:bg-moss-soft/80"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? "Đang mở..." : "Xem trước / In A4 ngang"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
