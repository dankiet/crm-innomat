/**
 * Brief dự án — form dài theo prototype `ProjectBriefForm.tsx`.
 *
 * Khác form ads ngắn (`LpLeadForm`): dành cho kiến trúc sư/studio đã xem
 * vật liệu, chấp nhận điền nhiều field để nhận đề xuất đúng concept.
 *
 * Hai chỗ cố ý KHÁC prototype:
 *   1. Prototype bọc `fetch("/api/leads")` trong `try/catch {}` rỗng rồi
 *      luôn `setSubmitted(true)` — endpoint chết là mất lead mà khách vẫn
 *      thấy thành công. Ở đây submit thật, lỗi thì hiện lỗi.
 *   2. File: prototype nhận file rồi bỏ đi (không có endpoint upload).
 *      Ở đây chỉ giữ TÊN file và nói rõ với khách là sales sẽ xin lại —
 *      không hứa điều mình không làm được.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileImage,
  Paperclip,
  ShieldCheck,
  X,
} from "lucide-react";
import { submitLpLeadFn } from "@/api/lp";
import { trackEvent } from "@/lib/lp-tracking";
import { LP_PROJECT_STAGES, LP_PROJECT_TYPES, type LpUtm } from "@/lib/lp-types";

const MAX_FILES = 4;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type Props = {
  slug: string;
  id?: string;
  /** Mã gạch khách đã lưu — đính kèm brief. */
  shortlistCodes?: string[];
  onRemoveCode?: (code: string) => void;
  /** Dòng gạch preset theo biến thể LP. */
  defaultNeed?: string | null;
};

type Picked = { id: string; name: string; size: string };

function readAttribution(): { utm: LpUtm; referrer: string; path: string } {
  if (typeof window === "undefined") return { utm: {}, referrer: "", path: "" };
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

export function LpBriefForm({ slug, id, shortlistCodes = [], onRemoveCode, defaultNeed }: Props) {
  const [fullName, setFullName] = useState("");
  const [studio, setStudio] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [projectType, setProjectType] = useState("");
  const [stage, setStage] = useState("");
  const [projectName, setProjectName] = useState("");
  const [area, setArea] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const renderedAt = useRef(Date.now());
  useEffect(() => {
    renderedAt.current = Date.now();
  }, []);

  const types = useMemo(() => LP_PROJECT_TYPES, []);
  const stages = useMemo(() => LP_PROJECT_STAGES, []);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    if (files.length + picked.length > MAX_FILES) {
      setError(`Chỉ đính kèm tối đa ${MAX_FILES} file.`);
      e.target.value = "";
      return;
    }
    const tooBig = picked.find((f) => f.size > MAX_FILE_SIZE);
    if (tooBig) {
      setError(`File "${tooBig.name}" vượt quá 10 MB.`);
      e.target.value = "";
      return;
    }
    setError("");
    setFiles((prev) =>
      [
        ...prev,
        ...picked.map((f, i) => ({
          id: `${Date.now()}-${i}`,
          name: f.name,
          size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
        })),
      ].slice(0, MAX_FILES),
    );
    e.target.value = "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!fullName.trim()) {
      setError("Vui lòng nhập họ tên hoặc tên người liên hệ.");
      return;
    }
    if (!phone.trim()) {
      setError("Vui lòng nhập số điện thoại hoặc Zalo để em gửi đề xuất.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const attr = readAttribution();
      const res = await submitLpLeadFn({
        data: {
          full_name: fullName,
          phone,
          email,
          need: defaultNeed ?? "",
          note,
          lp_slug: slug,
          studio,
          project_type: projectType,
          project_stage: stage,
          project_name: projectName,
          area,
          attachment_names: files.map((f) => f.name),
          form_kind: "lp",
          shortlist_codes: shortlistCodes,
          consent_marketing: consent,
          utm: attr.utm,
          referrer: attr.referrer,
          landing_path: attr.path,
          hp,
          rendered_at: renderedAt.current,
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      trackEvent("Lead", {
        content_name: "Project Brief Form",
        shortlist_count: shortlistCodes.length,
        project_type: projectType,
        has_files: files.length > 0,
      });
      setDone(true);
    } catch {
      setError("Gửi chưa thành công. Anh/chị thử lại hoặc gọi trực tiếp giúp em.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="lp-brief-success" id={id} role="status" aria-live="polite">
        <CheckCircle2 size={34} strokeWidth={1.6} />
        <p className="lp-eyebrow">Gửi brief thành công</p>
        <h3>Em đã tiếp nhận brief của anh/chị</h3>
        <p className="lp-brief-success-desc">
          Cảm ơn <strong>{fullName}</strong>
          {studio ? ` (${studio})` : ""}. Em xem concept rồi liên hệ số <strong>{phone}</strong>{" "}
          trong giờ làm việc để trao đổi và gửi đề xuất vật liệu.
        </p>
        {shortlistCodes.length ? (
          <div className="lp-brief-success-codes">
            <span>Mã gạch đã đính kèm ({shortlistCodes.length})</span>
            <p>{shortlistCodes.join(", ")}</p>
          </div>
        ) : null}
        {files.length ? (
          <p className="lp-brief-success-files">
            Em đã ghi nhận {files.length} file anh/chị muốn gửi. Em sẽ xin lại qua Zalo/email vì
            trang này chưa nhận file trực tiếp.
          </p>
        ) : null}
        <div className="lp-brief-promises">
          <span>
            <Clock size={15} /> Phản hồi trong giờ làm việc
          </span>
          <span>
            <ShieldCheck size={15} /> Gửi mẫu thật tận nơi
          </span>
        </div>
      </div>
    );
  }

  return (
    <form className="lp-brief" onSubmit={onSubmit} id={id} noValidate>
      {shortlistCodes.length ? (
        <div className="lp-brief-attached" aria-live="polite">
          <div className="lp-brief-attached-head">
            <span>Mã gạch trong shortlist ({shortlistCodes.length})</span>
            <span className="lp-brief-attached-hint">Tự động đính kèm vào brief</span>
          </div>
          <div className="lp-brief-pills">
            {shortlistCodes.map((c) => (
              <span className="lp-brief-pill" key={c}>
                <strong>EBG / {c}</strong>
                {onRemoveCode ? (
                  <button type="button" onClick={() => onRemoveCode(c)} aria-label={`Bỏ mã ${c}`}>
                    <X size={12} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="lp-brief-empty">
          Chưa chọn mã nào — anh/chị vẫn gửi được brief, em sẽ đề xuất theo concept.
        </p>
      )}

      <div className="lp-brief-row">
        <label className="lp-field">
          <span>Họ tên của anh/chị *</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="KTS Nguyễn Văn A"
            autoComplete="name"
            maxLength={120}
            required
          />
        </label>
        <label className="lp-field">
          <span>Studio / văn phòng thiết kế</span>
          <input
            value={studio}
            onChange={(e) => setStudio(e.target.value)}
            placeholder="Studio Architecture…"
            autoComplete="organization"
            maxLength={160}
          />
        </label>
      </div>

      <div className="lp-brief-row">
        <label className="lp-field">
          <span>Số điện thoại / Zalo *</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            placeholder="090 123 4567"
            autoComplete="tel"
            maxLength={32}
            required
          />
        </label>
        <label className="lp-field">
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="kts.example@gmail.com"
            autoComplete="email"
            maxLength={160}
          />
        </label>
      </div>

      <fieldset className="lp-brief-fieldset">
        <legend>Loại hình công trình</legend>
        <div className="lp-pill-group">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              className={`lp-pill${projectType === t ? " is-selected" : ""}`}
              aria-pressed={projectType === t}
              onClick={() => setProjectType(projectType === t ? "" : t)}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="lp-brief-fieldset">
        <legend>Giai đoạn dự án</legend>
        <div className="lp-pill-group">
          {stages.map((st) => (
            <button
              key={st}
              type="button"
              className={`lp-pill${stage === st ? " is-selected" : ""}`}
              aria-pressed={stage === st}
              onClick={() => setStage(stage === st ? "" : st)}
            >
              {st}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="lp-brief-row">
        <label className="lp-field">
          <span>Tên dự án / địa điểm</span>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Villa Thảo Điền, nhà phố Q2…"
            maxLength={200}
          />
        </label>
        <label className="lp-field">
          <span>Ước tính diện tích (m²)</span>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="150 m² tường, 80 m² sàn…"
            maxLength={120}
          />
        </label>
      </div>

      <label className="lp-field">
        <span>Ghi chú về concept / bề mặt đang tìm</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Tông màu chủ đạo, cảm xúc không gian, yêu cầu kỹ thuật…"
        />
      </label>

      <div className="lp-field">
        <span className="lp-field-label">
          Mặt bằng / phối cảnh / moodboard (tối đa 4 file, &lt;10 MB)
        </span>
        <div className="lp-upload">
          <input
            type="file"
            id={`${id ?? "brief"}-files`}
            className="lp-upload-input"
            onChange={onPick}
            multiple
            accept="image/*,application/pdf"
          />
          <label htmlFor={`${id ?? "brief"}-files`}>
            <Paperclip size={17} />
            <span>
              <strong>Chọn file từ máy</strong> — PDF, JPG, PNG
            </span>
          </label>
        </div>
        {/* Nói thật với khách: trang chưa nhận file, chỉ ghi tên. */}
        <p className="lp-upload-note">
          Trang này chưa nhận file trực tiếp — em ghi lại tên file và xin qua Zalo/email khi liên
          hệ.
        </p>
        {files.length ? (
          <ul className="lp-upload-list">
            {files.map((f) => (
              <li key={f.id}>
                <FileImage size={16} />
                <span className="lp-upload-name">{f.name}</span>
                <span className="lp-upload-size">{f.size}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                  aria-label={`Bỏ file ${f.name}`}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Honeypot — bot điền, người thật không thấy. */}
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

      <label className="lp-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Em muốn nhận thêm mẫu gạch mới và bảng giá cập nhật.</span>
      </label>

      {error ? (
        <p className="lp-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="lp-submit" type="submit" disabled={busy}>
        {busy ? "Đang gửi brief…" : "Nhận đề xuất vật liệu & báo giá"}
        {busy ? null : <ArrowRight size={17} />}
      </button>
    </form>
  );
}
