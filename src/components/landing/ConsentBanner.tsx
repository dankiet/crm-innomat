/**
 * Thanh đồng thuận cookie cho GTM — neo đáy, KHÔNG chặn.
 *
 * Khác hẳn bản cổng chặn trước đó: không khoá cuộn, không `inert`, không `aria-modal`.
 * Khách vẫn cuộn và dùng trang bình thường phía sau; thanh chỉ nằm ở đáy màn hình.
 *
 * Đánh đổi có chủ đích: không ai bị buộc phải bấm, nên khách bỏ qua thì GTM không
 * nạp và không có số liệu. Muốn chắc chắn có dữ liệu thì phải quay lại cổng chặn.
 *
 * Chỉ hiện khi khách CHƯA chọn (`undefined`). Bấm "Đồng ý" → ghi cookie + nạp GTM
 * ngay tại chỗ (không reload). Bấm "Từ chối" → ghi cookie, không bao giờ nạp GTM.
 * Hai lựa chọn giá trị như nhau — không lựa chọn nào bị phạt.
 *
 * Snapshot server CŨNG là `readConsent`: server đọc cookie của request y như `lpHead()`
 * đã đọc để quyết định chèn snippet GTM. Nhờ vậy khách đã chọn rồi không thấy thanh
 * này loé lên ở lần render đầu — HTML của server và lần hydrate đầu khớp nhau.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  loadGtm,
  readConsent,
  setConsent,
  stopGtm,
  subscribeConsent,
  type ConsentValue,
} from "@/lib/lp-consent";

export function ConsentBanner() {
  const consent = useSyncExternalStore(subscribeConsent, readConsent, readConsent);
  const barRef = useRef<HTMLElement>(null);

  // Chiều cao thanh phụ thuộc độ dài chữ và bề rộng viewport (mobile cao gấp đôi
  // desktop vì chữ xuống dòng). Shortlist tray cũng neo đáy, nên phải biết chiều cao
  // thật để nâng nó lên — dùng số cố định là đoán mò và vỡ ở màn hẹp.
  useEffect(() => {
    const el = barRef.current;
    if (!el || consent !== undefined) return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty("--consent-bar-h", `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--consent-bar-h");
    };
  }, [consent]);

  if (consent !== undefined) return null;

  const applyConsent = (value: ConsentValue) => {
    setConsent(value);
    if (value === "granted") loadGtm();
    else stopGtm();
  };

  return (
    <>
      {/* Khách tắt JS thì hai nút không làm gì được — để lại chỉ là thanh chết. */}
      <noscript>
        <style>{".consent-bar{display:none !important}"}</style>
      </noscript>
      <aside
        className="consent-bar"
        ref={barRef}
        role="region"
        aria-label="Đồng thuận cookie"
        aria-live="polite"
      >
        <div className="consent-bar-copy">
          <p className="consent-kicker">QUYỀN RIÊNG TƯ</p>
          <p className="consent-lead">
            Em dùng Google Tag Manager để ghi nhận lượt xem trang, những mã gạch bạn lưu vào
            shortlist, và lượt gửi brief — để biết phần nào của thư viện đang hữu ích. Chọn
            &ldquo;Từ chối&rdquo; thì trang vẫn dùng đủ như thường.
          </p>
        </div>
        <div className="consent-actions">
          <button
            type="button"
            className="consent-btn consent-accept"
            onClick={() => applyConsent("granted")}
          >
            Đồng ý
          </button>
          <button
            type="button"
            className="consent-btn consent-decline"
            onClick={() => applyConsent("denied")}
          >
            Từ chối
          </button>
        </div>
      </aside>
    </>
  );
}
