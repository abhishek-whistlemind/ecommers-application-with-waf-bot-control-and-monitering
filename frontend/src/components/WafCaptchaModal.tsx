import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, RotateCw, Lock } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onSuccess: (token: string) => void;
  onCancel: () => void;
}

export const WafCaptchaModal: React.FC<Props> = ({ isOpen, onSuccess, onCancel }) => {
  const [sliderVal, setSliderVal] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSolved, setIsSolved] = useState(false);

  if (!isOpen) return null;

  const handleSliderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setSliderVal(val);

    if (val >= 95 && !isVerifying && !isSolved) {
      setIsVerifying(true);
      setErrorMsg('');

      try {
        // Contact backend challenge solver
        const res = await fetch('http://127.0.0.1:8000/api/waf/solve-challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ solution: 'valid_human_verification' })
        });

        if (res.ok) {
          const data = await res.json();
          setIsSolved(true);
          setTimeout(() => {
            onSuccess(data.token);
            setIsSolved(false);
            setSliderVal(0);
            setIsVerifying(false);
          }, 800);
        } else {
          setErrorMsg('Verification failed. Please retry.');
          setSliderVal(0);
          setIsVerifying(false);
        }
      } catch (err) {
        setErrorMsg('Network error while validating challenge.');
        setSliderVal(0);
        setIsVerifying(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden animate-fadeIn">
        {/* Glow ambient background */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* AWS Security Badge */}
        <div className="flex items-center gap-3 mb-4 border-b border-slate-800 pb-4">
          <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                AWS WAF Challenge
              </span>
              <span className="text-xs text-slate-400">Rule: BotControl-Targeted</span>
            </div>
            <h3 className="text-lg font-bold text-white mt-0.5">Interactive Verification</h3>
          </div>
        </div>

        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          AWS WAF Bot Control detected high-frequency traffic on this sensitive endpoint. 
          Slide the verification bar to prove you are human and unlock your request.
        </p>

        {/* Interactive Puzzle Container */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 mb-5 text-center relative">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
            <span className="flex items-center gap-1.5 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-400" /> Human Proof-of-Work
            </span>
            <span className="text-slate-500">Token Domain: waf.nexuscommerce</span>
          </div>

          {/* Slider track visual */}
          <div className="relative py-4">
            <div className="h-12 bg-slate-900 rounded-xl border border-slate-800 relative flex items-center px-4 overflow-hidden">
              <div 
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-amber-600/40 to-emerald-600/40 transition-all duration-75"
                style={{ width: `${sliderVal}%` }}
              />
              <span className="relative z-10 w-full text-xs font-medium text-slate-400 select-none pointer-events-none">
                {isSolved ? (
                  <span className="text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Challenge Cleared! Resuming request...
                  </span>
                ) : isVerifying ? (
                  <span className="text-amber-300 font-semibold flex items-center justify-center gap-1.5">
                    <RotateCw className="w-4 h-4 animate-spin" /> Verifying Telemetry Token...
                  </span>
                ) : (
                  'Slide right to verify'
                )}
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={sliderVal}
              disabled={isVerifying || isSolved}
              onChange={handleSliderChange}
              className="absolute inset-0 opacity-0 cursor-ew-resize w-full h-full z-20"
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-400 mt-2 font-medium">{errorMsg}</p>
          )}
        </div>

        {/* Action footer */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            disabled={isVerifying || isSolved}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-3 py-2"
          >
            Cancel Request
          </button>
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            Protected by <span className="text-slate-400 font-medium">AWS WAF Bot Control</span>
          </div>
        </div>
      </div>
    </div>
  );
};
