/**
 * Cổng đồng thuận cookie cho GTM.
 *
 * Là cổng CHẶN toàn màn hình: khách phải chọn "Đồng ý" hoặc "Từ chối" mới xem được
 * nội dung. Hai lựa chọn mở cổng như nhau — không lựa chọn nào bị phạt.
 *
 * Chỉ hiện khi khách CHƯA chọn (`undefined`). Bấm "Đồng ý" → ghi cookie + nạp GTM
 * ngay tại chỗ (không reload). Bấm "Từ chối" → ghi cookie, không bao giờ nạp GTM.
 *
 * Snapshot server CŨNG là `readConsent`: server đọc cookie của request y như `lpHead()`
 * đã đọc để quyết định chèn snippet GTM. Nhờ vậy khách đã chọn rồi không thấy cổng này
 * loé lên ở lần render đầu — HTML của server và lần hydrate đầu khớp nhau.
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

  if (consent !== undefined) return null;
  return <ConsentGate />;
}

/**
 * Tách riêng để hiệu ứng khoá trang gắn liền vòng đời của cổng: `ConsentBanner` vẫn
 * nằm trong cây sau khi khách chọn (nó chỉ render `null`), nên nếu để hiệu ứng ở đó
 * thì phần dọn dẹp không bao giờ chạy và trang kẹt ở trạng thái bị chặn.
 */
function ConsentGate() {
  const gateRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Cổng đang mở = trang phía sau bị vô hiệu: khoá cuộn, và đánh dấu `inert` mọi
  // phần tử anh em để bàn phím/trình đọc màn hình cũng không lách qua được.
  useEffect(() => {
    const gate = gateRef.current;
    const parent = gate?.parentElement;
    if (!gate || !parent) return;

    const behind = Array.from(parent.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== gate,
    );
    const wasInert = behind.map((el) => el.hasAttribute("inert"));
    behind.forEach((el) => el.setAttribute("inert", ""));

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.focus();

    return () => {
      behind.forEach((el, i) => {
        if (!wasInert[i]) el.removeAttribute("inert");
      });
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const applyConsent = (value: ConsentValue) => {
    setConsent(value);
    if (value === "granted") loadGtm();
    else stopGtm();
  };

  return (
    <>
      {/* Khách tắt JS thì hai nút không làm gì được — cổng sẽ chặn vĩnh viễn. Cổng là
          thứ chỉ có nghĩa khi JS chạy, nên tắt JS là ẩn nó đi. */}
      <noscript>
        <style>{".consent-gate{display:none !important}"}</style>
      </noscript>
      <div
        className="consent-gate"
        ref={gateRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-gate-title"
        aria-describedby="consent-gate-lead"
      >
        <div className="consent-card" ref={cardRef} tabIndex={-1}>
          <p className="consent-kicker">QUYỀN RIÊNG TƯ</p>
          <h2 className="consent-title" id="consent-gate-title">
            Em xin phép đo lường truy cập
          </h2>
          <p className="consent-lead" id="consent-gate-lead">
            Em dùng Google Tag Manager để ghi nhận lượt xem trang, những mã gạch bạn lưu vào
            shortlist, và lượt gửi brief. Nhìn vào đó em biết phần nào của thư viện đang hữu ích để
            xếp lại cho dễ tra hơn.
          </p>
          <p className="consent-note">
            Chọn &ldquo;Đồng ý&rdquo; hay &ldquo;Từ chối&rdquo; thì nội dung vẫn mở đầy đủ như nhau
            — em chỉ cần biết ý bạn trước khi xem tiếp. Đổi ý bất cứ lúc nào bằng nút &ldquo;Đổi lựa
            chọn cookie&rdquo; ở chân trang.
          </p>
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
      </div>
    </>
  );
}
