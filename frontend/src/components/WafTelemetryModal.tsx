import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Terminal, 
  X, 
  Copy, 
  Check, 
  RefreshCw, 
  Sparkles,
  Cpu, 
  Monitor, 
  MousePointer, 
  Keyboard 
} from 'lucide-react';
import { wafIntegration } from '../services/wafIntegration';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const WafTelemetryModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [telemetryPayload, setTelemetryPayload] = useState<Record<string, any>>({});
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [consoleTriggered, setConsoleTriggered] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const data = wafIntegration.printTelemetryData();
      setTelemetryPayload(data);
      setConsoleTriggered(true);
      const timer = setTimeout(() => setConsoleTriggered(false), 2500);

      // Close on Escape key
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(telemetryPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintToConsole = () => {
    wafIntegration.printTelemetryData();
    setConsoleTriggered(true);
    setTimeout(() => setConsoleTriggered(false), 2000);
  };

  const handleRefreshToken = async () => {
    setIsRefreshing(true);
    await wafIntegration.acquireToken();
    setTimeout(() => {
      setTelemetryPayload(wafIntegration.printTelemetryData());
      setIsRefreshing(false);
    }, 600);
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-4 flex justify-center items-center animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative my-auto bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl shadow-cyan-950/70 flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header - Fixed & Never shrunk */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                AWS WAF JS SDK Telemetry Payload
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/60">
                  Token Exchange Data
                </span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Exact client telemetry passed by the SDK to AWS WAF edge endpoints to obtain tokens.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body Container */}
        <div className="py-3 overflow-y-auto flex-1 min-h-0 space-y-3 pr-1 scrollbar-thin">
          {/* Signal Categories Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">
                <MousePointer className="w-3 h-3 text-cyan-400" />
                <span>Mouse Jitter</span>
              </div>
              <span className="text-base sm:text-lg font-bold text-cyan-400 font-mono">{telemetryPayload.mouseMovements ?? 0}</span>
              <span className="text-[10px] text-slate-500 block">movement events</span>
            </div>

            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">
                <Keyboard className="w-3 h-3 text-indigo-400" />
                <span>Keystrokes</span>
              </div>
              <span className="text-base sm:text-lg font-bold text-indigo-400 font-mono">{telemetryPayload.keystrokes ?? 0}</span>
              <span className="text-[10px] text-slate-500 block">physical inputs</span>
            </div>

            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">
                <Monitor className="w-3 h-3 text-emerald-400" />
                <span>Resolution</span>
              </div>
              <span className="text-xs sm:text-sm font-bold text-emerald-400 font-mono">
                {telemetryPayload.screenW}x{telemetryPayload.screenH}
              </span>
              <span className="text-[10px] text-slate-500 block">{telemetryPayload.devicePixelRatio}x pixel ratio</span>
            </div>

            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">
                <Cpu className="w-3 h-3 text-rose-400" />
                <span>Automation</span>
              </div>
              <span className={`text-xs sm:text-sm font-bold font-mono ${telemetryPayload.webdriver ? 'text-rose-400' : 'text-emerald-400'}`}>
                {telemetryPayload.webdriver ? '⚠️ Webdriver' : '✅ Human Browser'}
              </span>
              <span className="text-[10px] text-slate-500 block">{telemetryPayload.hardwareConcurrency || 4} CPU Cores</span>
            </div>
          </div>

          {/* Advanced Fingerprints */}
          <div className="p-2.5 sm:p-3 bg-slate-950/90 border border-slate-800/80 rounded-xl space-y-1.5 text-xs font-mono">
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">Canvas Entropy Hash:</span>
              <span className="text-cyan-300 font-semibold">{telemetryPayload.canvasHash || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">GPU Hardware:</span>
              <span className="text-indigo-300 font-semibold truncate max-w-[240px] sm:max-w-[340px]" title={telemetryPayload.webglRenderer}>
                {telemetryPayload.webglRenderer || 'Generic / Integrated'}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">Timezone / Platform:</span>
              <span className="text-slate-200">{telemetryPayload.timezone} ({telemetryPayload.platform})</span>
            </div>
          </div>

          {/* JSON code block */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-300">Complete JSON Payload Transmitted</span>
              {consoleTriggered && (
                <span className="text-[11px] text-cyan-400 flex items-center gap-1 animate-pulse">
                  <Sparkles className="w-3 h-3" /> Printed to DevTools Console!
                </span>
              )}
            </div>
            <pre className="bg-slate-950 p-2.5 sm:p-3 rounded-xl border border-slate-800 text-cyan-300 text-[11px] font-mono overflow-x-auto max-h-36 sm:max-h-40 scrollbar-thin">
              {JSON.stringify(telemetryPayload, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer Action Buttons - Fixed & Never shrunk */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintToConsole}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 text-xs font-semibold transition-all"
            >
              <Terminal className="w-3.5 h-3.5" />
              Print to Browser Console
            </button>
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshToken}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Re-acquire Token Now
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
