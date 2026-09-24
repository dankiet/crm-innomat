/**
 * Banner xin đồng thuận cookie cho GTM.
 *
 * Chỉ hiện khi khách CHƯA chọn (`undefined`). Bấm "Đồng ý" → ghi cookie + nạp GTM
 * ngay tại chỗ (không reload). Bấm "Từ chối" → ghi cookie, không bao giờ nạp GTM.
 *
 * Đặt ở góc dưới-trái để không đè lên shortlist tray / chat widget (đều ở góc phải).
 */
import { useSyncExternalStore } from "react";
import { loadGtm, readConsent, setConsent, stopGtm, subscribeConsent, type ConsentValue } from "@/lib/lp-consent";

export function ConsentBanner({ raised = false }: { raised?: boolean } = {}) {
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => undefined);

  if (consent !== undefined) return null;

  const choose = (value: ConsentValue) => {
    setConsent(value);
    if (value === "granted") loadGtm();
    else stopGtm();
  };

  return (
    <aside
      className={raised ? "consent-banner is-raised" : "consent-banner"}
      role="dialog"
      aria-live="polite"
      aria-label="Đồng thuận cookie"
    >
      <div className="consent-body">
        <p className="consent-kicker">QUYỀN RIÊNG TƯ</p>
        <p>
          Trang dùng cookie đo lường (Google Tag Manager) để hiểu cách khách xem mẫu và hoàn
          thiện trải nghiệm tra cứu. Em chỉ bật theo dõi nếu bạn đồng ý.
        </p>
      </div>
      <div className="consent-actions">
        <button type="button" className="consent-btn consent-accept" onClick={() => choose("granted")}>
          Đồng ý
        </button>
        <button type="button" className="consent-btn consent-decline" onClick={() => choose("denied")}>
          Từ chối
        </button>
      </div>
    </aside>
  );
}
