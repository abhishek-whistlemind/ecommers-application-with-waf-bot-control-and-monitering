import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  ShoppingBag, 
  Activity, 
  RefreshCw, 
  KeyRound, 
  User, 
  LogOut, 
  Terminal 
} from 'lucide-react';
import { wafIntegration } from '../services/wafIntegration';
import { WafTelemetryModal } from './WafTelemetryModal';

interface Props {
  activeTab: 'store' | 'monitoring';
  setActiveTab: (tab: 'store' | 'monitoring') => void;
  cartCount: number;
  openCart: () => void;
  currentUser: string | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<Props> = ({
  activeTab,
  setActiveTab,
  cartCount,
  openCart,
  currentUser,
  onOpenAuth,
  onSignOut
}) => {
  const [token, setToken] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);

  useEffect(() => {
    const unsubscribe = wafIntegration.subscribeTokenChange((t) => setToken(t));
    return () => {
      unsubscribe();
    };
  }, []);

  const handleOpenTelemetry = () => {
    setShowTelemetryModal(true);
  };

  const handleRefreshToken = async () => {
    setIsRefreshing(true);
    await wafIntegration.acquireToken();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleDropToken = () => {
    wafIntegration.invalidateToken();
  };


  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('store')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-black text-xl">
            N
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Nexus<span className="text-cyan-400">Commerce</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                AWS WAF
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Bot Control & Fraud Shield</p>
          </div>
        </div>

        {/* View Switcher Navigation */}
        <div className="hidden md:flex items-center gap-1 bg-slate-900/90 border border-slate-800/80 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('store')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'store'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> Storefront
          </button>
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'monitoring'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-4 h-4" /> WAF SOC & Monitoring
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </button>
        </div>

        {/* Right side controls: Token status + User Auth + Cart */}
        <div className="flex items-center gap-3">
          {/* AWS WAF Token Diagnostics Badge & SDK Telemetry Inspector */}
          <div className="hidden lg:flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
            {token ? (
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-slate-400 text-[10px] block font-mono">AWS WAF TOKEN</span>
                  <span className="text-emerald-400 font-mono font-medium">{token.slice(0, 16)}...</span>
                </div>

                {/* Inspect SDK Telemetry Data */}
                <button
                  title="Inspect SDK Telemetry: View and print data the SDK passes to WAF"
                  onClick={handleOpenTelemetry}
                  className="ml-1 p-1 hover:bg-cyan-950/60 rounded text-cyan-400 hover:text-cyan-300 border border-cyan-800/40 transition-colors flex items-center gap-1"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-mono font-semibold">SDK Data</span>
                </button>

                <button
                  title="Drop token (Simulate missing token to trigger WAF Bot Control challenge/block)"
                  onClick={handleDropToken}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse" />
                <span className="text-amber-400 font-medium">No WAF Token</span>

                <button
                  title="Inspect SDK Telemetry Data"
                  onClick={handleOpenTelemetry}
                  className="ml-1 p-1 hover:bg-cyan-950/60 rounded text-cyan-400 hover:text-cyan-300 border border-cyan-800/40 transition-colors flex items-center gap-1"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-mono font-semibold">SDK Data</span>
                </button>

                <button
                  title="Acquire Token via JS SDK"
                  onClick={handleRefreshToken}
                  className="p-1 hover:bg-slate-800 rounded text-amber-300 hover:text-white transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}
          </div>

          {/* User Profile / Sign In Button */}
          {currentUser ? (
            <div className="flex items-center gap-2 bg-slate-900 border border-indigo-500/30 rounded-xl px-3 py-1.5 text-xs">
              <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                {currentUser[0].toUpperCase()}
              </div>
              <span className="text-white font-medium truncate max-w-[100px]">{currentUser}</span>
              <button
                onClick={onSignOut}
                title="Sign Out"
                className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold transition-all hover:scale-105"
            >
              <User className="w-4 h-4 text-cyan-400" />
              <span>Sign In</span>
            </button>
          )}

          {/* Cart Trigger */}
          <button
            onClick={openCart}
            className="relative p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-200 transition-all hover:scale-105"
            aria-label="View Cart"
          >
            <ShoppingBag className="w-5 h-5 text-cyan-400" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-950 shadow-md">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Telemetry Inspector Portal Modal */}
      <WafTelemetryModal
        isOpen={showTelemetryModal}
        onClose={() => setShowTelemetryModal(false)}
      />
    </header>
  );
};
