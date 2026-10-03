/**
 * Thanh đồng thuận cookie cho GTM — neo đáy, KHÔNG chặn.
 *
 * Khác hẳn bản cổng chặn trước đó: không khoá cuộn, không `inert`, không `aria-modal`.
 * Khách vẫn cuộn và dùng trang bình thường phía sau; thanh chỉ nằm ở đáy màn hình.
 *
 * GTM nạp cho MỌI khách (snippet ở `head()`) — kể cả người bấm "Từ chối". Đánh đổi
 * có chủ đích: giữ được số liệu của nhóm không bấm, đổi lại phải tự loại trừ nhóm
 * từ chối bằng audience trong GTM. Lựa chọn đi vào `dataLayer` qua
 * `pushConsentToDataLayer` để GTM đọc được.
 *
 * Chỉ hiện khi khách CHƯA chọn (`undefined`). Bấm nút nào cũng chỉ ghi cookie +
 * cập nhật cờ `dataLayer`; không reload, không dừng container.
 *
 * Snapshot server CŨNG là `readConsent`: server đọc cookie của request y như `lpHead()`
 * đã đọc để ghi cờ vào snippet. Nhờ vậy khách đã chọn rồi không thấy thanh này loé
 * lên ở lần render đầu — HTML của server và lần hydrate đầu khớp nhau.
 *
 * LÀ `<div>` chứ KHÔNG phải `<aside>`: `src/styles.css` (CSS app CRM, cũng được nạp ở
 * landing) có `aside{…!important}` + `aside button{color:…!important}` cho sidebar, và
 * `!important` đè hết màu nút của thanh này (chữ "Đồng ý" thành xám đậm trên nền cam).
 * Đổi thẻ là cách sửa gốc; thêm `!important` ngược lại chỉ đẩy cuộc chiến specificity đi xa.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  loadGtm,
  pushConsentToDataLayer,
  readConsent,
  setConsent,
  subscribeConsent,
  type ConsentValue,
} from "@/lib/lp-consent";

export function ConsentBanner() {
  const consent = useSyncExternalStore(subscribeConsent, readConsent, readConsent);
  const barRef = useRef<HTMLDivElement>(null);

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
    // GTM đã nạp sẵn cho mọi khách (snippet ở `head()`), nên KHÔNG nạp lại và
    // cũng KHÔNG dừng. Việc duy nhất cần làm là cập nhật cờ trong `dataLayer`
    // để GTM biết khách vừa chọn gì — nền tảng cho tệp loại trừ.
    pushConsentToDataLayer(value);
    // Chưa có container (khách chọn trước khi snippet kịp chạy, hoặc bị chặn):
    // nạp bù để không mất phiên này.
    loadGtm();
  };

  return (
    <>
      {/* Khách tắt JS thì hai nút không làm gì được — để lại chỉ là thanh chết. */}
      <noscript>
        <style>{".consent-bar{display:none !important}"}</style>
      </noscript>
      <div
        className="consent-bar"
        ref={barRef}
        role="region"
        aria-label="Đồng thuận cookie"
        aria-live="polite"
      >
        <div className="consent-bar-copy">
          <p className="consent-kicker">QUYỀN RIÊNG TƯ</p>
          <p className="consent-lead">
            Em dùng cookie để ghi nhớ những mã gạch bạn lưu và hoàn thiện trải nghiệm trên
            trang. Nếu chọn &ldquo;Từ chối&rdquo;, em hoàn toàn{" "}
            <b>tôn trọng quyền riêng tư và sẽ không làm phiền bạn bằng quảng cáo</b> về sau.
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
      </div>
    </>
  );
}
