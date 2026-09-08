import { useEffect, useRef, useState } from "react";
import { Terminal, Cpu, Zap } from "lucide-react";

const STAGES = [
  "Resolving binary…",
  "Spawning PTY…",
  "Probing terminal capabilities…",
  "Handshaking…",
  "Launching OpenCode…",
];

export default function StartupVisualization({ bin }: { bin?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stageIdx, setStageIdx] = useState(0);

  // Cycle through stage messages while starting
  useEffect(() => {
    const id = setInterval(() => setStageIdx((i) => (i + 1) % STAGES.length), 700);
    return () => clearInterval(id);
  }, []);

  // Animated waveform / particles on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      t += 0.015;
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      ctx.clearRect(0, 0, w, h);

      // subtle grid
      ctx.strokeStyle = "rgba(201,122,50,0.06)";
      ctx.lineWidth = 1;
      const grid = 28;
      for (let x = 0; x < w; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // waveform - two layered sine waves
      const mid = h / 2;
      const amp = h * 0.18;
      const drawWave = (phase: number, color: string, width: number, alpha: number) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.globalAlpha = alpha;
        for (let x = 0; x < w; x++) {
          const nx = x / w;
          // combine sine + small noise
          const y =
            mid +
            Math.sin(nx * Math.PI * 4 + t * 2 + phase) * amp * Math.sin(t * 0.7 + nx * 2) +
            Math.sin(nx * Math.PI * 8 - t * 3) * (amp * 0.3) +
            Math.sin(nx * 12 + t * 5) * 2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // glow
        ctx.globalAlpha = alpha * 0.15;
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      };

      drawWave(0, "#f59e0b", 1.6, 0.9);
      drawWave(1.2, "#e58e26", 1.1, 0.45);
      drawWave(2.4, "#5eb3a6", 1, 0.25);

      // moving dots along wave
      for (let i = 0; i < 3; i++) {
        const nx = ((t * 0.25 + i * 0.33) % 1);
        const x = nx * w;
        const y =
          mid +
          Math.sin(nx * Math.PI * 4 + t * 2) * amp * Math.sin(t * 0.7 + nx * 2) +
          Math.sin(nx * Math.PI * 8 - t * 3) * (amp * 0.3);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#fbbf24";
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="absolute inset-0 bg-[#141414]/90 backdrop-blur-[1px] flex flex-col items-center justify-center z-10 p-4 overflow-hidden">
      {/* canvas waveform background */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60" style={{ width: "100%", height: "100%" }} />

      {/* subtle vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#141414]/40 via-transparent to-transparent pointer-events-none" />

      {/* center content */}
      <div className="relative flex flex-col items-center gap-4 w-full max-w-[320px]">
        {/* pulsing logo */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          {/* outer rings */}
          <div className="absolute inset-0 rounded-full border border-[#B7B1B1]/20 animate-ping" style={{ animationDuration: "2s" }} />
          <div className="absolute inset-1 rounded-full border border-[#B7B1B1]/15 animate-ping" style={{ animationDuration: "2.5s", animationDelay: "0.4s" }} />
          <div className="absolute inset-2 rounded-full border border-[#B7B1B1]/10 animate-ping" style={{ animationDuration: "3s", animationDelay: "0.8s" }} />
          {/* core */}
          <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4B4646] to-[#262626] border border-[#B7B1B1]/30 flex items-center justify-center shadow-[0_0_30px_rgba(183,177,177,0.15)]">
            <Terminal size={22} className="text-[#F1ECEC]" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#141414] animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          </div>
        </div>

        {/* title */}
        <div className="text-center">
          <div className="text-[11px] tracking-[0.2em] text-[#B7B1B1] font-medium uppercase flex items-center gap-1.5 justify-center">
            <Zap size={10} className="text-[#B7B1B1]" /> Cockpit
          </div>
          <h3 className="text-sm font-semibold text-[#F1ECEC] mt-1 tracking-wide">Starting OpenCode</h3>
          <p className="text-xs text-[#B7B1B1] mt-1 font-mono h-4">
            <span className="inline-flex items-center gap-1">
              <Cpu size={11} className="text-[#B7B1B1]" />
              <span className="tabular-nums">{STAGES[stageIdx]}</span>
            </span>
          </p>
          {bin && <p className="text-[10px] text-[#B7B1B1] font-mono mt-1 truncate max-w-[260px]">{bin}</p>}
        </div>

        {/* progress bar */}
        <div className="w-full">
          <div className="h-1 w-full bg-[#262626] rounded-full overflow-hidden border border-[#333333]/50">
            <div className="h-full w-1/3 bg-gradient-to-r from-[#4B4646] via-[#B7B1B1] to-[#F1ECEC] rounded-full animate-[shimmer_1.2s_ease-in-out_infinite]" style={{ animationName: "shimmer-slide" }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-[#B7B1B1] font-mono">PTY  •  xterm-256color</span>
            <span className="text-[10px] text-[#B7B1B1] font-mono flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-[#F1ECEC] animate-pulse" />
              connecting
            </span>
          </div>
        </div>

        {/* dots */}
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F1ECEC] animate-bounce" style={{ animationDelay: "0s" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[#B7B1B1] animate-bounce" style={{ animationDelay: "0.15s" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[#4B4646] animate-bounce" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>

      {/* bottom hint */}
      <div className="absolute bottom-3 text-[10px] text-[#B7B1B1] font-mono tracking-wide">
        <span className="opacity-60">TUI probes answered automatically</span>
      </div>

      <style>{`
        @keyframes shimmer-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
