import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldAlert, ShieldCheck, RefreshCw, CheckSquare } from 'lucide-react';
import { getApiBase } from '../services/config';

interface Props {
  isOpen: boolean;
  onSuccess: (token: string) => void;
  onCancel: () => void;
}

// ─── Demo puzzle data ──────────────────────────────────────────────────────────
// Each puzzle asks the user to click all tiles matching a category.
// Emojis are used so the grid works without any image assets.
const PUZZLES = [
  {
    prompt: 'Select all squares with a 🚗 car',
    grid: ['🚗','🏠','🚗','🌳','🚗','🐶','🏠','🚗','🌳'],
    answer: [0, 2, 4, 7],
  },
  {
    prompt: 'Select all squares with a 🌳 tree',
    grid: ['🚗','🌳','🏠','🌳','🐶','🌳','🚗','🏠','🌳'],
    answer: [1, 3, 5, 8],
  },
  {
    prompt: 'Select all squares with a 🐶 dog',
    grid: ['🐶','🏠','🌳','🐶','🚗','🐶','🏠','🐶','🌳'],
    answer: [0, 3, 5, 7],
  },
  {
    prompt: 'Select all squares with a 🏠 house',
    grid: ['🌳','🏠','🐶','🚗','🏠','🌳','🏠','🚗','🏠'],
    answer: [1, 4, 6, 8],
  },
];

type Phase = 'loading' | 'real-sdk' | 'demo-puzzle' | 'verifying';

/**
 * Calls the backend /api/waf/solve-challenge endpoint which returns a real
 * HMAC-signed waf_tok_ token that passes backend verify_token() checks.
 * This is the demo equivalent of the real AWS WAF CAPTCHA SDK token.
 */
async function fetchSolvedChallengeToken(): Promise<string> {
  try {
    const res = await fetch(`${getApiBase()}/api/waf/solve-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solution: 'valid_human_verification' }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.token as string;
    }
  } catch (e) {
    console.error('[WAF] Failed to fetch solved challenge token:', e);
  }
  return '';
}

export const WafCaptchaModal: React.FC<Props> = ({ isOpen, onSuccess, onCancel }) => {
  const captchaContainerRef = useRef<HTMLDivElement>(null);

  // Phase state machine
  const [phase, setPhase] = useState<Phase>('loading');
  const [sdkErrorMsg, setSdkErrorMsg] = useState('');

  // Demo puzzle state
  const [puzzleIdx, setPuzzleIdx] = useState(() => Math.floor(Math.random() * PUZZLES.length));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [shake, setShake] = useState(false);
  const [wrongCells, setWrongCells] = useState<Set<number>>(new Set());
  const [verifyProgress, setVerifyProgress] = useState(0);

  const puzzle = PUZZLES[puzzleIdx];

  // ─── Reset when modal opens ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setPhase('loading');
    setSdkErrorMsg('');
    setSelected(new Set());
    setWrongCells(new Set());
    setShake(false);
    setVerifyProgress(0);
    setPuzzleIdx(Math.floor(Math.random() * PUZZLES.length));

    let sdkCheckInterval: number;
    let sdkTimeout: number;

    const tryRenderRealSdk = () => {
      if (!(window as any).AwsWafCaptcha) return;
      clearInterval(sdkCheckInterval);
      clearTimeout(sdkTimeout);
      setPhase('real-sdk');
      setSdkErrorMsg('');
      try {
        const scriptTag = document.querySelector('script[src*="captcha.js"]');
        const apiKey = scriptTag
          ? scriptTag.getAttribute('src')?.split('/')[3]
          : 'DEMO_API_KEY';

        (window as any).AwsWafCaptcha.renderCaptcha(captchaContainerRef.current!, {
          apiKey,
          onSuccess: (token: string) => onSuccess(token),
          onError: (err: any) => {
            console.error('AWS WAF Captcha SDK error:', err);
            setPhase('demo-puzzle');
          },
        });
      } catch {
        setPhase('demo-puzzle');
      }
    };

    if ((window as any).AwsWafCaptcha) {
      tryRenderRealSdk();
    } else {
      sdkCheckInterval = window.setInterval(tryRenderRealSdk, 300);
      // After 5 s, give up on the real SDK and show the demo puzzle
      sdkTimeout = window.setTimeout(() => {
        clearInterval(sdkCheckInterval);
        if (!(window as any).AwsWafCaptcha) {
          console.warn('[WAF] captcha.js not loaded – showing demo puzzle fallback');
          setPhase('demo-puzzle');
        }
      }, 5000);
    }

    return () => {
      clearInterval(sdkCheckInterval);
      clearTimeout(sdkTimeout);
    };
  }, [isOpen, onSuccess]);

  // ─── Demo puzzle logic ────────────────────────────────────────────────────
  const toggleCell = useCallback((idx: number) => {
    if (phase !== 'demo-puzzle') return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
    setWrongCells(new Set());
  }, [phase]);

  const refreshPuzzle = useCallback(() => {
    setSelected(new Set());
    setWrongCells(new Set());
    setShake(false);
    setPuzzleIdx(i => (i + 1) % PUZZLES.length);
  }, []);

  const verifyPuzzle = useCallback(async () => {
    if (phase !== 'demo-puzzle') return;

    const correct = new Set(puzzle.answer);
    const sel = selected;

    const hasAll = puzzle.answer.every(i => sel.has(i));
    const noExtra = [...sel].every(i => correct.has(i));

    if (hasAll && noExtra) {
      // Correct – animate progress ring, fetch a real signed token, then call onSuccess
      setPhase('verifying');
      let p = 0;

      // Animate progress ring up to ~80% while the API call is in flight
      const interval = setInterval(() => {
        p = Math.min(p + Math.random() * 12 + 5, 80);
        setVerifyProgress(p);
      }, 80);

      // Fetch a real backend-signed waf_tok_ that passes HMAC verify_token()
      const signedToken = await fetchSolvedChallengeToken();

      clearInterval(interval);
      setVerifyProgress(100);
      setTimeout(() => onSuccess(signedToken), 350);
    } else {
      // Wrong – highlight incorrect cells and shake
      const wrong = new Set([...sel].filter(i => !correct.has(i)));
      setWrongCells(wrong);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }, [phase, puzzle, selected, onSuccess]);

  if (!isOpen) return null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div
        className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden"
        style={{ animation: 'wafModalIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        {/* Ambient glows */}
        <div className="absolute -top-24 -right-24 w-56 h-56 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 border-b border-slate-800 pb-4 relative">
          <div className={`p-2.5 rounded-xl border flex items-center justify-center transition-colors duration-500 ${
            phase === 'verifying'
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
          }`}>
            {phase === 'verifying'
              ? <ShieldCheck className="w-6 h-6" />
              : <ShieldAlert className="w-6 h-6 animate-pulse" />
            }
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                AWS WAF Challenge
              </span>
              <span className="text-xs text-slate-400">Rule: BotControl-Targeted</span>
            </div>
            <h3 className="text-lg font-bold text-white mt-0.5">
              {phase === 'verifying' ? 'Verifying…' : 'Interactive Verification'}
            </h3>
          </div>
        </div>

        {/* Description */}
        {phase !== 'verifying' && (
          <p className="text-sm text-slate-300 mb-5 leading-relaxed">
            AWS WAF Bot Control detected high-frequency traffic on this sensitive endpoint.
            Complete the verification below to prove you are human and unlock your request.
          </p>
        )}

        {/* ── LOADING phase ── */}
        {phase === 'loading' && (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 mb-5 flex flex-col items-center justify-center min-h-[180px] gap-3">
            <div className="w-8 h-8 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Loading AWS WAF Captcha SDK…</p>
          </div>
        )}

        {/* ── REAL SDK phase ── */}
        {phase === 'real-sdk' && (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 mb-5 flex flex-col items-center justify-center min-h-[180px]">
            <div ref={captchaContainerRef} className="w-full flex justify-center items-center" />
            {sdkErrorMsg && (
              <p className="text-xs text-rose-400 mt-3 font-medium">{sdkErrorMsg}</p>
            )}
          </div>
        )}

        {/* ── DEMO PUZZLE phase ── */}
        {phase === 'demo-puzzle' && (
          <>
            {/* Demo badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700">
                Demo Simulation
              </span>
              <span className="text-[10px] text-slate-600">Real SDK not detected in this environment</span>
            </div>

            {/* Puzzle prompt */}
            <p className="text-sm font-semibold text-slate-200 mb-3">{puzzle.prompt}</p>

            {/* 3x3 grid */}
            <div
              className="grid grid-cols-3 gap-2 mb-4"
              style={{ animation: shake ? 'wafShake 0.45s ease' : undefined }}
            >
              {puzzle.grid.map((emoji, idx) => {
                const isSel = selected.has(idx);
                const isWrong = wrongCells.has(idx);
                return (
                  <button
                    key={idx}
                    id={`waf-captcha-cell-${idx}`}
                    type="button"
                    onClick={() => toggleCell(idx)}
                    className={[
                      'relative aspect-square rounded-xl text-3xl flex items-center justify-center',
                      'border-2 transition-all duration-150 select-none cursor-pointer focus:outline-none',
                      isWrong
                        ? 'bg-rose-950/60 border-rose-500/70 scale-95'
                        : isSel
                          ? 'bg-amber-500/20 border-amber-400/70 scale-105 shadow-lg shadow-amber-500/10'
                          : 'bg-slate-800/70 border-slate-700/50 hover:border-slate-500/70 hover:bg-slate-700/60',
                    ].join(' ')}
                    aria-pressed={isSel}
                    aria-label={`Cell ${idx + 1}: ${emoji}`}
                  >
                    {emoji}
                    {isSel && !isWrong && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center shadow-sm">
                        <CheckSquare className="w-2.5 h-2.5 text-amber-900" />
                      </span>
                    )}
                    {isWrong && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white">
                        ✕
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {wrongCells.size > 0 && (
              <p className="text-xs text-rose-400 mb-3 -mt-1 font-medium">
                ✗ Some selected tiles are incorrect — try again.
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                id="waf-captcha-refresh"
                type="button"
                onClick={refreshPuzzle}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700 px-3 py-2 rounded-lg transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                New puzzle
              </button>
              <button
                id="waf-captcha-verify"
                type="button"
                onClick={verifyPuzzle}
                disabled={selected.size === 0}
                className="flex-1 text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-all shadow-md shadow-amber-500/20 active:scale-95"
              >
                Verify
              </button>
            </div>
          </>
        )}

        {/* ── VERIFYING phase ── */}
        {phase === 'verifying' && (
          <div className="flex flex-col items-center justify-center py-6 gap-4">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" className="text-slate-800" />
                <circle
                  cx="32" cy="32" r="28"
                  stroke="currentColor" strokeWidth="4" fill="none"
                  strokeDasharray={`${2 * Math.PI * 28}`}
                  strokeDashoffset={`${2 * Math.PI * 28 * (1 - verifyProgress / 100)}`}
                  strokeLinecap="round"
                  className="text-emerald-400 transition-all duration-100"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-400">
                {Math.round(verifyProgress)}%
              </span>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-white">Issuing WAF Action Token…</p>
              <p className="text-xs text-slate-400 mt-1">Verifying challenge response with AWS WAF</p>
            </div>
            <div className="w-full bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full transition-all duration-100"
                style={{ width: `${verifyProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        {phase !== 'verifying' && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800/60">
            <button
              id="waf-captcha-cancel"
              type="button"
              onClick={onCancel}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1"
            >
              Cancel Request
            </button>
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              Protected by <span className="text-slate-400 font-medium">AWS WAF Bot Control</span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes wafModalIn {
          from { opacity: 0; transform: scale(0.88) translateY(16px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes wafShake {
          0%,100% { transform: translateX(0); }
          18%      { transform: translateX(-6px); }
          36%      { transform: translateX(6px); }
          54%      { transform: translateX(-4px); }
          72%      { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
};
