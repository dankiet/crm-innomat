import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

const ZALO_OA_URL = (import.meta.env.VITE_ZALO_OA_URL as string | undefined) ?? "";
const MESSENGER_PAGE_ID = (import.meta.env.VITE_MESSENGER_PAGE_ID as string | undefined) ?? "";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const hasAnyLink = Boolean(ZALO_OA_URL) || Boolean(MESSENGER_PAGE_ID);
  if (!hasAnyLink) return null;

  return (
    <div className="chat-widget">
      {open ? (
        <div className="chat-widget-menu" role="menu">
          {ZALO_OA_URL ? (
            <a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer" role="menuitem">
              <span className="chat-widget-dot" style={{ background: "#0068ff" }} />
              Chat Zalo OA
            </a>
          ) : null}
          {MESSENGER_PAGE_ID ? (
            <a
              href={`https://m.me/${MESSENGER_PAGE_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
            >
              <span className="chat-widget-dot" style={{ background: "#0084ff" }} />
              Chat Messenger
            </a>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="chat-widget-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Đóng menu liên hệ" : "Mở menu liên hệ"}
        aria-expanded={open}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
    </div>
  );
}
