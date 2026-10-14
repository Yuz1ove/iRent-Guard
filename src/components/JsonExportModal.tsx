import { Clipboard, Download, X } from "lucide-react";
import React from "react";

interface JsonExportModalProps {
  json: string;
  onClose: () => void;
}

export function JsonExportModal({ json, onClose }: JsonExportModalProps) {
  const [copied, setCopied] = React.useState(false);
  const modalRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose]);

  async function copyJson() {
    try {
      await navigator.clipboard?.writeText(json);
    } catch {
      // Browser clipboard permission can be unavailable in demo environments.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function downloadJson() {
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "irent-guard-ai-assessment.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section
        aria-labelledby="json-modal-title"
        aria-modal="true"
        className="json-modal"
        ref={modalRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Backend-ready payload</p>
            <h2 id="json-modal-title">AI 判讀 JSON</h2>
          </div>
          <button aria-label="關閉" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <pre>{json}</pre>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            關閉
          </button>
          <button className="secondary-button" onClick={copyJson} type="button">
            <Clipboard size={18} />
            {copied ? "已複製 JSON" : "複製 JSON"}
          </button>
          <button className="primary-button" onClick={downloadJson} type="button">
            <Download size={18} />
            下載 JSON
          </button>
        </div>
      </section>
    </div>
  );
}
