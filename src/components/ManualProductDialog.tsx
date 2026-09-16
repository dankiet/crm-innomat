import { useState, useRef, useEffect } from "react";
import { FileImage, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type CustomProduct = {
  code: string;
  name: string;
  size: string;
  surface: string;
  material: string;
  retailPrice: string;
  imagePath: string;
  imageDataUrl: string | null;
  imageName: string;
};

const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Vui lòng chọn tệp hình ảnh"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1600;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/webp", 0.85);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(String(reader.result));
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-medium text-muted-foreground">{children}</span>;
}

export function ManualProductDialog({
  open,
  value,
  onClose,
  onSave,
  title = "Sản phẩm ngoài danh mục",
  description = "Lưu riêng trong báo giá này, không thêm vào database sản phẩm.",
}: {
  open: boolean;
  value?: CustomProduct | null;
  onClose: () => void;
  onSave: (value: CustomProduct) => void;
  title?: string;
  description?: string;
}) {
  const [draft, setDraft] = useState<CustomProduct>(() =>
    value ?? {
      code: "",
      name: "",
      size: "",
      surface: "",
      material: "",
      retailPrice: "",
      imagePath: "",
      imageDataUrl: null,
      imageName: "",
    },
  );

  // Đồng bộ draft khi mở modal hoặc value thay đổi
  useEffect(() => {
    if (open) {
      setDraft(
        value ?? {
          code: "",
          name: "",
          size: "",
          surface: "",
          material: "",
          retailPrice: "",
          imagePath: "",
          imageDataUrl: null,
          imageName: "",
        },
      );
    }
  }, [open, value]);

  const inputClass =
    "w-full h-10 rounded-lg bg-background px-3 text-sm ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-terracotta/35";
  const imageSource = draft.imageDataUrl || draft.imagePath;
  const productImageInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full sm:max-w-xl max-h-[90dvh] bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col safe-pb">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate">{title}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-surface-strong text-muted-foreground hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-4">
            {/* Ảnh sản phẩm */}
            <div className="space-y-2">
              <div>
                <FieldLabel>Ảnh mẫu sản phẩm</FieldLabel>
                <button
                  type="button"
                  onClick={() => productImageInputRef.current?.click()}
                  className="block w-full cursor-pointer group text-left mt-1"
                >
                  <div className="aspect-square rounded-xl overflow-hidden bg-[#f3f1ed] ring-1 ring-black/5 relative">
                    {imageSource ? (
                      <img
                        src={imageSource}
                        alt={draft.name || "Sản phẩm ngoài danh mục"}
                        className="size-full object-contain"
                      />
                    ) : (
                      <div className="size-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <FileImage className="size-7 opacity-45" />
                        <span className="text-[10px] font-medium">Chọn ảnh</span>
                      </div>
                    )}
                    <span className="absolute inset-x-2 bottom-2 h-7 rounded-md bg-black/65 text-white text-[10px] font-medium grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {imageSource ? "Thay ảnh" : "Chọn ảnh"}
                    </span>
                  </div>
                </button>
                <input
                  ref={productImageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > MAX_IMAGE_BYTES) {
                      toast.error(`${file.name} vượt quá 12 MB`);
                    } else {
                      void fileToDataUrl(file).then((imageDataUrl) =>
                        setDraft((current) => ({
                          ...current,
                          imageDataUrl,
                          imageName: file.name,
                        })),
                      );
                    }
                    event.target.value = "";
                  }}
                />
              </div>
              {imageSource ? (
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      imagePath: "",
                      imageDataUrl: null,
                      imageName: "",
                    }))
                  }
                  className="w-full h-8 rounded-lg text-[10px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  Xóa ảnh
                </button>
              ) : null}
            </div>

            {/* Các trường thông tin */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
              <label className="sm:col-span-2">
                <FieldLabel>Tên sản phẩm *</FieldLabel>
                <input
                  className={cn(inputClass, "mt-1")}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="VD: Gạch Mosaic Gốm Men Rạn"
                  autoFocus
                />
              </label>
              <label>
                <FieldLabel>Mã sản phẩm</FieldLabel>
                <input
                  className={cn(inputClass, "mt-1")}
                  value={draft.code}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, code: event.target.value }))
                  }
                  placeholder="VD: KDM-001"
                />
              </label>
              <label>
                <FieldLabel>Kích thước</FieldLabel>
                <input
                  className={cn(inputClass, "mt-1")}
                  value={draft.size}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, size: event.target.value }))
                  }
                  placeholder="VD: 300x300, 75x300 mm"
                />
              </label>
              <label>
                <FieldLabel>Bề mặt</FieldLabel>
                <input
                  className={cn(inputClass, "mt-1")}
                  value={draft.surface}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, surface: event.target.value }))
                  }
                  placeholder="VD: Men rạn, Matt, Bóng"
                />
              </label>
              <label>
                <FieldLabel>Chất liệu</FieldLabel>
                <input
                  className={cn(inputClass, "mt-1")}
                  value={draft.material}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, material: event.target.value }))
                  }
                  placeholder="VD: Gốm, Porcelain, Granite"
                />
              </label>
              <label>
                <FieldLabel>Đơn giá đề xuất (đ/m²)</FieldLabel>
                <input
                  inputMode="numeric"
                  className={cn(inputClass, "mt-1 tabular-nums")}
                  value={
                    draft.retailPrice
                      ? Number(String(draft.retailPrice).replace(/\D/g, "")).toLocaleString("vi-VN")
                      : ""
                  }
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      retailPrice: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder="VD: 450.000"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 sm:px-5 py-3 flex justify-end gap-2 bg-surface-strong/30">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-lg ring-1 ring-border text-xs font-medium hover:bg-surface-strong"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              if (!draft.name.trim()) {
                toast.error("Vui lòng nhập tên sản phẩm ngoài danh mục");
                return;
              }
              const cleanPrice = String(draft.retailPrice || "").replace(/\D/g, "");
              onSave({ ...draft, name: draft.name.trim(), retailPrice: cleanPrice });
            }}
            className="h-9 px-4 rounded-lg bg-terracotta hover:opacity-90 text-primary-foreground text-xs font-medium shadow-xs"
          >
            Dùng sản phẩm này
          </button>
        </div>
      </div>
    </div>
  );
}
