import { ChangeEvent, FormEvent, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileImage,
  Paperclip,
  X,
  Sparkles,
  BookOpen,
  Send,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { submitLpLeadFn } from "@/api/lp";
import { trackEvent } from "@/lib/lp-tracking";
import { curatedMaterials, type Material } from "@/data/mockData";
type ProjectBriefFormProps = {
  shortlistCount: number;
  intent: string;
  shortlistMaterialIds?: string[];
  onRemoveShortlistId?: (id: string) => void;
};

const projectTypes = ["Nhà ở / Villa", "Hospitality / Resort", "F&B / Retail", "Văn phòng Studio", "Công trình khác"];
const projectStages = [
  "Đang lên concept",
  "Đang thiết kế 3D",
  "Chuẩn bị thi công",
  "Cần chốt vật liệu gấp",
];

type AttachedFile = {
  id: string;
  name: string;
  size: string;
  type: string;
  previewUrl?: string;
  progress: number;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 4;

export function ProjectBriefForm({
  shortlistCount,
  intent,
  shortlistMaterialIds = [],
  onRemoveShortlistId,
}: ProjectBriefFormProps) {
  const renderedAtRef = useRef(Date.now());
  const [fullName, setFullName] = useState("");
  const [studio, setStudio] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [selectedProjectType, setSelectedProjectType] = useState(projectTypes[0]);
  const [selectedStage, setSelectedStage] = useState(projectStages[0]);
  const [projectName, setProjectName] = useState("");
  const [area, setArea] = useState("");
  const [note, setNote] = useState("");

  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Find shortlisted materials details
  const shortlistedItems = curatedMaterials.filter((m) =>
    shortlistMaterialIds.includes(m.id)
  );

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputFiles = Array.from(e.target.files ?? []);
    if (!inputFiles.length) return;

    if (files.length + inputFiles.length > MAX_FILES) {
      setError(`Bạn chỉ có thể đính kèm tối đa ${MAX_FILES} file.`);
      return;
    }

    const invalid = inputFiles.find((f) => f.size > MAX_FILE_SIZE);
    if (invalid) {
      setError(`File "${invalid.name}" vượt quá dung lượng 10MB.`);
      return;
    }

    setError("");

    const newAttached: AttachedFile[] = inputFiles.map((file, idx) => {
      const isImg = file.type.startsWith("image/");
      return {
        id: `${Date.now()}-${idx}`,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        type: file.type,
        previewUrl: isImg ? URL.createObjectURL(file) : undefined,
        progress: 100,
      };
    });

    setFiles((prev) => [...prev, ...newAttached].slice(0, MAX_FILES));
    e.target.value = "";
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!fullName.trim()) {
      setError("Vui lòng nhập Họ tên hoặc Tên người liên hệ.");
      return;
    }
    if (!phone.trim()) {
      setError("Vui lòng nhập Số điện thoại hoặc Zalo để nhận đề xuất.");
      return;
    }

    setError("");
    setSubmitting(true);

    const renderedAt = renderedAtRef.current;
    let utm = {};
    let referrer = "";
    let landingPath = "";
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      utm = {
        source: q.get("utm_source") ?? undefined,
        medium: q.get("utm_medium") ?? undefined,
        campaign: q.get("utm_campaign") ?? undefined,
        content: q.get("utm_content") ?? undefined,
        term: q.get("utm_term") ?? undefined,
      };
      referrer = document.referrer || "";
      landingPath = window.location.pathname || "";
    }

    try {
      const res = await submitLpLeadFn({
        data: {
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          studio: studio.trim(),
          project_type: selectedProjectType,
          project_stage: selectedStage,
          project_name: projectName.trim(),
          area: area.trim(),
          note: note.trim(),
          need: intent || "Chưa rõ, cần tư vấn",
          lp_slug: "em-ban-gach",
          shortlist_codes: shortlistMaterialIds,
          attachment_names: files.map((f) => f.name),
          form_kind: "lp",
          rendered_at: renderedAt,
          utm,
          referrer,
          landing_path: landingPath,
        },
      });

      if (!res.ok) {
        setError(res.error || "Gửi brief thất bại, vui lòng thử lại.");
        setSubmitting(false);
        return;
      }

      trackEvent("Lead", {
        content_name: "Project Brief Form",
        shortlist_count: shortlistMaterialIds.length,
        project_type: selectedProjectType,
        has_files: files.length > 0,
      });

      setSubmitting(false);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gửi brief thất bại, vui lòng thử lại.");
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="brief-success-card" aria-live="polite">
        <div className="brief-success-badge">
          <CheckCircle2 size={32} className="text-[#657151]" />
        </div>
        <p className="text-[10px] font-bold tracking-[0.16em] text-[#B94A2E] uppercase m-0 mt-2">
          GỬI BRIEF THÀNH CÔNG
        </p>
        <h3 className="brief-success-title">Em đã tiếp nhận brief của bạn!</h3>
        <p className="brief-success-desc">
          Cảm ơn <b>{fullName}</b> {studio ? `(${studio})` : ""}. Đội ngũ chuyên gia vật liệu của{" "}
          <b>Em bán gạch</b> sẽ xem xét concept, chuẩn bị bảng moodboard PDF và liên hệ trao đổi qua Zalo số <b>{phone}</b> trong vòng <b>4 giờ làm việc</b>.
        </p>

        {shortlistedItems.length > 0 && (
          <div className="brief-success-summary">
            <span className="text-xs font-bold text-[#1F2B33] block mb-2">
              DANH SÁCH MÃ GẠCH ĐÍNH KÈM ({shortlistedItems.length}):
            </span>
            <div className="flex flex-wrap gap-2">
              {shortlistedItems.map((m) => (
                <span key={m.id} className="brief-summary-chip">
                  <span className="chip-dot" style={{ backgroundColor: m.tone }} />
                  <b>{m.code}</b> - {m.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="brief-success-commitments">
          <div className="flex items-center gap-2 text-xs text-[#697176]">
            <Clock size={15} className="text-[#B94A2E]" />
            <span>Phản hồi trong 4h làm việc</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#697176]">
            <ShieldCheck size={15} className="text-[#657151]" />
            <span>Gửi mẫu thực tế tận nơi</span>
          </div>
        </div>

        <button
          type="button"
          className="brief-reset-btn"
          onClick={() => {
            setSubmitted(false);
            setFullName("");
            setPhone("");
            setNote("");
            setFiles([]);
          }}
        >
          <span>Gửi thêm một dự án khác</span>
          <ArrowRight size={15} />
        </button>
      </div>
    );
  }

  return (
    <form className="brief-form" onSubmit={handleSubmit} noValidate>
      {/* Shortlist attached preview inside form */}
      {shortlistedItems.length > 0 && (
        <div className="brief-attached-shortlist">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-[#B94A2E]" />
              <span className="text-xs font-bold text-[#1F2B33] uppercase tracking-wider">
                MÃ GẠCH TRONG SHORTLIST CỦA BẠN ({shortlistedItems.length})
              </span>
            </div>
            <span className="text-[11px] text-[#788075]">Tự động đính kèm vào brief</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {shortlistedItems.map((mat) => (
              <div key={mat.id} className="brief-shortlist-pill">
                <img src={mat.image} alt={mat.name} className="pill-img" />
                <span className="pill-code">EBG / {mat.code}</span>
                <span className="pill-name">{mat.name}</span>
                {onRemoveShortlistId && (
                  <button
                    type="button"
                    onClick={() => onRemoveShortlistId(mat.id)}
                    className="pill-remove"
                    title="Bỏ mã này"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 1: Contact Info */}
      <div className="form-row-2">
        <label className="form-field">
          <span className="form-label">
            Họ tên của bạn <b className="text-[#B94A2E]">*</b>
          </span>
          <input
            type="text"
            className="form-input"
            placeholder="KTS Nguyễn Văn A"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </label>

        <label className="form-field">
          <span className="form-label">Tên Studio / Văn phòng thiết kế</span>
          <input
            type="text"
            className="form-input"
            placeholder="Studio Architecture..."
            value={studio}
            onChange={(e) => setStudio(e.target.value)}
          />
        </label>
      </div>

      {/* Row 2: Phone & Email */}
      <div className="form-row-2">
        <label className="form-field">
          <span className="form-label">
            Số điện thoại / Zalo <b className="text-[#B94A2E]">*</b>
          </span>
          <input
            type="tel"
            className="form-input"
            placeholder="090 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>

        <label className="form-field">
          <span className="form-label">Email (nhận file texture 3D)</span>
          <input
            type="email"
            className="form-input"
            placeholder="kts.example@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      </div>

      {/* Row 3: Project Type Selection */}
      <div className="form-field">
        <span className="form-label">Loại hình công trình</span>
        <div className="pill-group">
          {projectTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={`pill-option ${selectedProjectType === type ? "is-selected" : ""}`}
              onClick={() => setSelectedProjectType(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Row 4: Project Stage Selection */}
      <div className="form-field">
        <span className="form-label">Giai đoạn dự án hiện tại</span>
        <div className="pill-group">
          {projectStages.map((stage) => (
            <button
              key={stage}
              type="button"
              className={`pill-option ${selectedStage === stage ? "is-selected" : ""}`}
              onClick={() => setSelectedStage(stage)}
            >
              {stage}
            </button>
          ))}
        </div>
      </div>

      {/* Row 5: Project Name & Area */}
      <div className="form-row-2">
        <label className="form-field">
          <span className="form-label">Tên dự án / Địa điểm (tùy chọn)</span>
          <input
            type="text"
            className="form-input"
            placeholder="Villa Thảo Điền, Nhà phố Q2..."
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </label>

        <label className="form-field">
          <span className="form-label">Ước tính diện tích ốp lát (m²)</span>
          <input
            type="text"
            className="form-input"
            placeholder="VD: 150m2 tường, 80m2 sàn..."
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </label>
      </div>

      {/* Row 6: Concept Note */}
      <div className="form-field">
        <span className="form-label">Ghi chú về concept / Bề mặt bạn đang tìm</span>
        <textarea
          className="form-textarea"
          rows={3}
          placeholder="Mô tả ngắn về tông màu chủ đạo, cảm xúc không gian hoặc yêu cầu kỹ thuật đặc biệt..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* Row 7: File Attachment */}
      <div className="form-field">
        <span className="form-label">Đính kèm mặt bằng, phối cảnh hoặc moodboard (tối đa 4 file, &lt;10MB)</span>
        
        <div className="file-upload-box">
          <input
            type="file"
            id="brief-file-input"
            className="hidden-file-input"
            onChange={onFileChange}
            multiple
            accept="image/*,application/pdf"
          />
          <label htmlFor="brief-file-input" className="file-upload-label">
            <Paperclip size={18} className="text-[#B94A2E]" />
            <span>
              <b>Chọn file từ máy</b> hoặc kéo thả vào đây (PDF, JPG, PNG)
            </span>
          </label>
        </div>

        {/* Uploaded File List */}
        {files.length > 0 && (
          <div className="uploaded-files-list">
            {files.map((file) => (
              <div key={file.id} className="uploaded-file-item">
                <div className="flex items-center gap-2.5 min-w-0">
                  {file.previewUrl ? (
                    <img src={file.previewUrl} alt="" className="file-preview-thumb" />
                  ) : (
                    <FileImage size={18} className="text-[#697176] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <span className="file-item-name">{file.name}</span>
                    <span className="file-item-size">{file.size}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeFile(file.id)}
                  className="file-remove-btn"
                  title="Xóa file"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="form-error-alert">{error}</p>}

      {/* Submit Button */}
      <button type="submit" className="form-submit-cta" disabled={submitting}>
        {submitting ? (
          <span>Đang gửi hồ sơ brief...</span>
        ) : (
          <>
            <span>Nhận đề xuất vật liệu & Báo giá</span>
            <ArrowRight size={18} />
          </>
        )}
      </button>

      <p className="form-footer-promise">
        <Sparkles size={14} className="text-[#657151]" />
        <span>Em cam kết phản hồi đề xuất và hỗ trợ gửi mẫu thực tế trong vòng 4 giờ làm việc.</span>
      </p>
    </form>
  );
}
