import { X } from "lucide-react";
import { useEffect } from "react";

/** Full-screen image viewer: dimmed backdrop, tap anywhere (or Esc) to close. */
export default function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-text"
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full rounded-card object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
