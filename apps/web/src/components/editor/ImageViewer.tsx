import { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Image as ImageIcon, ExternalLink, Download } from "lucide-react";

export function isImageFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif", "tiff"].includes(ext ?? "");
}

interface ImageViewerProps {
  filePath: string;
  size?: number;
}

export default function ImageViewer({ filePath, size }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const rawUrl = `/api/raw?path=${encodeURIComponent(filePath)}`;
  const ext = filePath.split(".").pop()?.toUpperCase() ?? "IMAGE";
  const fileName = filePath.split("/").pop() ?? filePath;

  useEffect(() => {
    setZoom(1);
    setNaturalSize(null);
    setError(false);
  }, [filePath]);

  const handleZoomIn = () => setZoom((z) => Math.min(5, Math.round((z + 0.25) * 100) / 100));
  const handleZoomOut = () => setZoom((z) => Math.max(0.1, Math.round((z - 0.25) * 100) / 100));
  const handleResetZoom = () => setZoom(1);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="h-full flex flex-col bg-[#141414] text-[#F1ECEC] select-none relative overflow-hidden">
      {/* Top Controls Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#333333] bg-[#1c1c1c] shrink-0 text-xs">
        <div className="flex items-center gap-2 text-[#B7B1B1] truncate">
          <ImageIcon size={14} className="text-[#F1ECEC] shrink-0" />
          <span className="font-medium text-[#F1ECEC] truncate">{fileName}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#4B4646] border border-[#B7B1B1]/30 text-[#F1ECEC]">
            {ext}
          </span>
          {naturalSize && (
            <span className="text-[11px] text-[#B7B1B1]">
              {naturalSize.width} × {naturalSize.height} px
            </span>
          )}
          {size ? <span className="text-[11px] text-[#B7B1B1]">• {formatBytes(size)}</span> : null}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC] transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>
          <span className="px-2 py-0.5 text-xs font-mono min-w-[50px] text-center text-[#F1ECEC]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC] transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={13} />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC] transition-colors ml-1"
            title="Reset Zoom (100%)"
          >
            <RotateCcw size={13} />
          </button>
          <a
            href={rawUrl}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC] transition-colors ml-1"
            title="Open Raw Image in New Tab"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Main Image Stage */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-[#0e0e0e] relative">
        {/* Checkerboard Pattern for Transparency */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#4B4646 1px, transparent 1px)`,
            backgroundSize: "16px 16px",
          }}
        />

        {error ? (
          <div className="text-center p-6 bg-[#222222] border border-[#333333] rounded-lg max-w-sm">
            <ImageIcon size={32} className="mx-auto text-red-400 mb-2" />
            <div className="font-semibold text-red-300 text-sm">Failed to load image</div>
            <div className="text-xs text-[#B7B1B1] mt-1">The image file may be corrupt or inaccessible.</div>
          </div>
        ) : (
          <div className="relative transition-transform duration-100 ease-out flex items-center justify-center">
            <img
              ref={imgRef}
              src={rawUrl}
              alt={fileName}
              onLoad={(e) => {
                const target = e.currentTarget;
                setNaturalSize({ width: target.naturalWidth, height: target.naturalHeight });
              }}
              onError={() => setError(true)}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                maxHeight: zoom === 1 ? "80vh" : "none",
                maxWidth: zoom === 1 ? "100%" : "none",
              }}
              className="object-contain shadow-2xl rounded border border-[#333333]/60 transition-transform"
            />
          </div>
        )}
      </div>
    </div>
  );
}
