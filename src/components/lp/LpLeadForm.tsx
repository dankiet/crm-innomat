/**
 * Form lead cho landing page (ads).
 *
 * Chỉ 3 field bắt buộc — Tên, SĐT, Nhu cầu. Mỗi field thêm vào là một
 * lý do nữa để khách rời trang, nên phần còn lại (email, ghi chú) là
 * tuỳ chọn và note dùng `<details>` để mặc định không chiếm chỗ.
 *
 * Chống bot phía client: honeypot `hp` + `rendered_at` (time-trap).
 * Cả hai được server kiểm lại — client chỉ gửi dữ liệu, không tự phán.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { submitLpLeadFn } from "@/api/lp";
import { LP_NEEDS, type LpUtm } from "@/lib/lp-types";

type Props = {
  slug: string;
  title: string;
  note: string;
  /** Preset dòng gạch theo biến thể LP đang chạy. */
  defaultNeed?: string | null;
  id?: string;
  /** Mã gạch khách đã lưu — gửi kèm lead để sales biết trước khách thích gì. */
  shortlistCodes?: string[];
};

/** Đọc UTM + referrer từ URL hiện tại. Chạy client-side, SSR trả rỗng. */
function readAttribution(): { utm: LpUtm; referrer: string; path: string } {
  if (typeof window === "undefined") {
    return { utm: {}, referrer: "", path: "" };
  }
  const q = new URLSearchParams(window.location.search);
  return {
    utm: {
      source: q.get("utm_source") ?? undefined,
      medium: q.get("utm_medium") ?? undefined,
      campaign: q.get("utm_campaign") ?? undefined,
      content: q.get("utm_content") ?? undefined,
      term: q.get("utm_term") ?? undefined,
    },
    referrer: document.referrer ?? "",
    path: window.location.pathname + window.location.search,
  };
}

export function LpLeadForm({ slug, title, note, defaultNeed, id, shortlistCodes }: Props) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [need, setNeed] = useState(defaultNeed ?? "");
  const [noteText, setNoteText] = useState("");
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Mốc thời gian render — server dùng để loại submit dưới 2 giây.
  const renderedAt = useRef(Date.now());
  useEffect(() => {
    renderedAt.current = Date.now();
  }, []);

  const needOptions = useMemo(() => LP_NEEDS, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const attr = readAttribution();
      const res = await submitLpLeadFn({
        data: {
          full_name: fullName,
          phone,
          email,
          need,
          note: noteText,
          lp_slug: slug,
          consent_marketing: consent,
          utm: attr.utm,
          referrer: attr.referrer,
          landing_path: attr.path,
          shortlist_codes: shortlistCodes,
          hp,
          rendered_at: renderedAt.current,
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? "Gửi chưa thành công. Anh/chị thử lại hoặc gọi trực tiếp giúp em."
          : "Gửi chưa thành công.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="lp-form-card" id={id}>
        <div className="lp-success" role="status" aria-live="polite">
          <Check size={38} strokeWidth={1.6} />
          <h2>Em đã nhận được thông tin</h2>
          <p>
            Em sẽ gọi lại trong giờ làm việc để gửi bảng giá và tư vấn mã phù hợp. Nếu cần gấp,
            anh/chị gọi trực tiếp số ở đầu trang giúp em.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form className="lp-form-card" onSubmit={onSubmit} id={id} noValidate>
      <h2>{title}</h2>
      <p className="lp-form-note">{note}</p>

      {/* Spec §4.8: summary shortlist — trống vẫn gửi được brief. */}
      <p className="lp-form-shortlist" aria-live="polite">
        {shortlistCodes?.length
          ? `Đã chọn ${shortlistCodes.length} mã: ${shortlistCodes.join(", ")}`
          : "Chưa chọn mã nào — anh/chị vẫn gửi được, em sẽ gợi ý mã phù hợp."}
      </p>

      <label className="lp-field">
        <span>Tên anh/chị *</span>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          required
          maxLength={120}
        />
      </label>

      <label className="lp-field">
        <span>Số điện thoại *</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          maxLength={32}
        />
      </label>

      <label className="lp-field">
        <span>Đang cần dòng gạch nào?</span>
        <select value={need} onChange={(e) => setNeed(e.target.value)}>
          <option value="">— Chọn giúp em —</option>
          {needOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {/* Honeypot — ẩn khỏi người thật bằng CSS, vẫn nằm trong DOM cho bot. */}
      <div className="lp-hp" aria-hidden="true">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
        </label>
      </div>

      <details style={{ marginTop: 14 }}>
        <summary
          style={{
            cursor: "pointer",
            fontSize: "0.8rem",
            color: "var(--grey)",
          }}
        >
          Thêm email / ghi chú về dự án (không bắt buộc)
        </summary>
        <label className="lp-field">
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            maxLength={160}
          />
        </label>
        <label className="lp-field">
          <span>Ghi chú</span>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            maxLength={1000}
            placeholder="Hạng mục, diện tích, tiến độ mong muốn…"
          />
        </label>
      </details>

      {/* Consent marketing tách riêng khỏi việc xử lý yêu cầu — theo
          khuyến nghị trong tài liệu kiến trúc nội dung. Không mặc định tick. */}
      <label className="lp-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Em muốn nhận thêm mẫu gạch mới và bảng giá cập nhật. Có thể dừng nhận bất cứ lúc nào.
        </span>
      </label>

      {error ? (
        <p className="lp-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="lp-submit" type="submit" disabled={busy}>
        {busy ? (
          <>
            <Loader2 size={17} className="lp-spin" /> Đang gửi…
          </>
        ) : (
          <>
            <Send size={16} /> Gửi thông tin
          </>
        )}
      </button>
    </form>
  );
}
