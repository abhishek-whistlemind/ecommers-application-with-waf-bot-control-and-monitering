import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, ShieldCheck, X, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onSuccess: (token: string) => void;
  onCancel: () => void;
}

type Phase = 'initializing' | 'rendered' | 'verifying' | 'error';

// Retrieve the AWS WAF API key from environment variables
const AWS_WAF_API_KEY =
  (import.meta as any).env?.VITE_AWS_WAF_API_KEY ||
  (import.meta as any).env?.AWS_WAF_API_KEY ||
  '';

export const WafCaptchaModal: React.FC<Props> = ({ isOpen, onSuccess, onCancel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('initializing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    setPhase('initializing');
    setErrorMessage('');

    let isCancelled = false;
    let pollInterval: number;
    let timeoutTimer: number;

    const renderOfficialAwsCaptcha = () => {
      const awsCaptcha = (window as any).AwsWafCaptcha;

      if (!awsCaptcha || typeof awsCaptcha.renderCaptcha !== 'function') {
        return false;
      }

      if (!containerRef.current) return false;

      // Clear any previous child elements inside container
      containerRef.current.innerHTML = '';

      try {
        console.log('[AWS WAF] Rendering official AWS WAF CAPTCHA into container...');
        awsCaptcha.renderCaptcha(containerRef.current, {
          apiKey: AWS_WAF_API_KEY,
          onSuccess: (wafToken: string) => {
            if (isCancelled) return;
            console.log('[AWS WAF] ✅ Challenge verified by AWS WAF edge. Token acquired:', wafToken);
            setPhase('verifying');
            setTimeout(() => {
              onSuccess(wafToken);
            }, 400);
          },
          onError: (err: any) => {
            if (isCancelled) return;
            console.error('[AWS WAF] ❌ CAPTCHA verification error from AWS WAF:', err);
            setPhase('error');
            setErrorMessage(
              typeof err === 'string'
                ? err
                : err?.message || 'Verification failed. Please try again.'
            );
          },
        });

        setPhase('rendered');
        return true;
      } catch (err: any) {
        console.error('[AWS WAF] Failed to invoke AwsWafCaptcha.renderCaptcha:', err);
        setPhase('error');
        setErrorMessage(err?.message || 'Failed to render AWS WAF CAPTCHA widget.');
        return false;
      }
    };

    // If SDK is already available, render immediately
    if (!renderOfficialAwsCaptcha()) {
      // Poll every 250ms for the SDK to finish initializing
      pollInterval = window.setInterval(() => {
        if (renderOfficialAwsCaptcha()) {
          clearInterval(pollInterval);
          clearTimeout(timeoutTimer);
        }
      }, 250);

      // Timeout if the script hasn't defined AwsWafCaptcha
      timeoutTimer = window.setTimeout(() => {
        clearInterval(pollInterval);
        if (phase === 'initializing' && !isCancelled) {
          setPhase('error');
          setErrorMessage(
            'AWS WAF CAPTCHA JavaScript API not detected. Please verify that the AWS WAF script (jsapi.js) from the Application Integration tab is present in index.html.'
          );
        }
      }, 6000);
    }

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
      clearTimeout(timeoutTimer);
    };
  }, [isOpen, onSuccess]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || typeof document === 'undefined') return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/85 backdrop-blur-md p-3 sm:p-4 flex items-center justify-center animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="relative my-auto bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        style={{ animation: 'wafModalIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        {/* Ambient glows */}
        <div className="absolute -top-24 -right-24 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-3 border-b border-slate-800 pb-3 flex-shrink-0 relative">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border flex items-center justify-center transition-colors duration-500 ${
                phase === 'verifying'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : phase === 'error'
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
              }`}
            >
              {phase === 'verifying' ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              ) : phase === 'error' ? (
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-cyan-400 animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60 font-mono">
                  AWS WAF CAPTCHA
                </span>
                <span className="text-[11px] text-slate-400 font-mono">Edge Verification</span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                {phase === 'verifying'
                  ? 'Verified by AWS WAF'
                  : 'Security Verification Required'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 min-h-0 pr-1 scrollbar-thin">
          <p className="text-xs text-slate-300 mb-3 leading-relaxed">
            AWS WAF Bot Control detected an unverified or rate-limited action on this endpoint.
            Please complete the security puzzle below to continue.
          </p>

          {/* Initializing Spinner */}
          {phase === 'initializing' && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center min-h-[280px] gap-3">
              <div className="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-xs text-slate-400 font-medium">
                Loading official AWS WAF CAPTCHA challenge…
              </p>
            </div>
          )}

          {/* Success State */}
          {phase === 'verifying' && (
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-6 flex flex-col items-center justify-center min-h-[240px] gap-3 text-center">
              <ShieldCheck className="w-10 h-10 text-emerald-400 animate-bounce" />
              <p className="text-sm font-semibold text-white">Challenge Solved Successfully</p>
              <p className="text-xs text-emerald-300">
                AWS WAF action token issued. Continuing your request…
              </p>
            </div>
          )}

          {/* Error State */}
          {phase === 'error' && (
            <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-5 mb-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-rose-300 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>Verification Error</span>
              </div>
              <p className="text-xs text-rose-200/90 leading-relaxed">{errorMessage}</p>
              <button
                type="button"
                onClick={() => {
                  setPhase('initializing');
                  setErrorMessage('');
                }}
                className="self-start mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 transition-colors"
              >
                Retry Challenge
              </button>
            </div>
          )}

          {/* High-contrast container card for AWS WAF CAPTCHA (AWS outputs dark text by default) */}
          <div
            className={`w-full bg-white rounded-xl p-3 sm:p-4 shadow-lg border border-slate-200 text-slate-900 my-2 transition-all duration-200 ${
              phase === 'rendered' ? 'block' : phase === 'initializing' ? 'hidden' : 'block'
            }`}
          >
            <div
              ref={containerRef}
              id="aws-waf-captcha-container"
              className="w-full flex justify-center items-center min-h-[460px] text-slate-900"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800/60 flex-shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-rose-400 transition-colors px-1 py-0.5"
          >
            Cancel Request
          </button>
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-mono">
            <span>Powered by</span>
            <span className="text-cyan-400 font-semibold">AWS WAF Bot Control</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wafModalIn {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        #aws-waf-captcha-container {
          color: #16191f !important;
          background-color: transparent !important;
        }
        #aws-waf-captcha-container * {
          box-sizing: border-box;
        }
        #aws-waf-captcha-container iframe {
          max-width: 100% !important;
          border-radius: 8px;
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
};
