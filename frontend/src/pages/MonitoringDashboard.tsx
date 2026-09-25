import React, { useState, useEffect, useRef } from 'react';
import type { WafEvent, WafStats } from '../types';
import { api } from '../services/api';
import {
  ShieldCheck,
  Activity,
  Bot,
  UserCheck,
  Terminal,
  Zap,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Flame,
  Key
} from 'lucide-react';

export const MonitoringDashboard: React.FC = () => {
  const [stats, setStats] = useState<WafStats>({
    total_requests: 0,
    allowed_count: 0,
    blocked_count: 0,
    challenged_count: 0,
    human_count: 0,
    bot_count: 0,
    top_rules: {},
    bot_breakdown: {},
    recent_events: []
  });

  const [events, setEvents] = useState<WafEvent[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ALLOW' | 'BLOCK' | 'CHALLENGE'>('ALL');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<WafEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Initialize WebSocket and polling fallback
  useEffect(() => {
    const connectWebSocket = () => {
      const wsUrl = 'ws://127.0.0.1:8000/ws/telemetry';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        console.log('Connected to AWS WAF Telemetry Stream');
      };

      ws.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data);
          if (payload.type === 'SNAPSHOT') {
            setStats(payload.data);
            setEvents(payload.data.recent_events || []);
          } else if (payload.type === 'NEW_EVENT') {
            const newEvent: WafEvent = payload.event;
            setEvents((prev) => [newEvent, ...prev.filter((e) => e.id !== newEvent.id)].slice(0, 200));
            if (payload.stats) {
              setStats((prev) => ({
                ...prev,
                ...payload.stats
              }));
            }
          }
        } catch (e) {
          console.error('Failed to parse WAF telemetry event:', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        // Reconnect after 3s
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    };

    connectWebSocket();

    // Initial HTTP fetch
    api.getWafStats().then((data) => {
      setStats(data);
      setEvents(data.recent_events || []);
    }).catch(console.error);

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handleLaunchAttack = async (type: string, count: number = 15, delayMs: number = 120) => {
    setIsSimulating(true);
    setSimMessage(`Launching ${type} simulation (${count} requests)...`);
    try {
      await api.launchAttackSimulation(type, count, delayMs);
      setSimMessage(`Attack simulation active. Monitoring live telemetry events...`);
      setTimeout(() => {
        setIsSimulating(false);
        setSimMessage('');
      }, 4000);
    } catch (err: any) {
      setSimMessage(`Error: ${err.message}`);
      setIsSimulating(false);
    }
  };

  const handleClearLogs = async () => {
    await api.clearStats();
    setEvents([]);
    setStats({
      total_requests: 0,
      allowed_count: 0,
      blocked_count: 0,
      challenged_count: 0,
      human_count: 0,
      bot_count: 0,
      top_rules: {},
      bot_breakdown: {},
      recent_events: []
    });
  };

  const filteredEvents = events.filter((e) => {
    if (activeFilter === 'ALL') return true;
    return e.waf_action === activeFilter;
  });

  const blockPercentage = stats.total_requests > 0
    ? Math.round((stats.blocked_count / stats.total_requests) * 100)
    : 0;

  const humanPercentage = stats.total_requests > 0
    ? Math.round((stats.human_count / stats.total_requests) * 100)
    : 100;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Header & Connection Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-3xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 text-cyan-400">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white">AWS WAF Bot Control SOC</h1>
                <span className="text-[10px] font-mono uppercase bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800">
                  Targeted Tier
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time edge telemetry, automated threat mitigation & JavaScript SDK protection monitor
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* WebSocket indicator */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="flex h-2 w-2 relative">
              {wsConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${wsConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <span className="text-slate-300 font-mono text-[11px]">
              {wsConnected ? 'LIVE STREAM' : 'OFFLINE'}
            </span>
          </div>

          <button
            onClick={handleClearLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Telemetry
          </button>
        </div>
      </div>

      {/* ATTACK SIMULATION LAUNCHPAD */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Zap className="w-4 h-4 fill-indigo-400" /> Interactive Threat Simulator
            </div>
            <h2 className="text-lg font-bold text-white">
              Simulate Attacks & Verify AWS WAF SDK Defenses
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
              Trigger automated attack vectors against the e-commerce endpoints. Observe how the 
              AWS WAF Bot Control engine detects missing or invalid telemetry tokens and blocks or challenges malicious traffic in real time.
            </p>
          </div>

          {/* Simulation Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Scraper Attack */}
            <button
              disabled={isSimulating}
              onClick={() => handleLaunchAttack('scraper', 15, 100)}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/40 text-left transition-all hover:scale-105 group disabled:opacity-50"
            >
              <Bot className="w-5 h-5 text-rose-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-white">Scraper Bot</span>
              <span className="text-[10px] text-slate-400">15 reqs / burst</span>
            </button>

            {/* Scalper Snipe Bot */}
            <button
              disabled={isSimulating}
              onClick={() => handleLaunchAttack('scalper', 10, 150)}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-950 hover:bg-amber-950/40 border border-slate-800 hover:border-amber-500/40 text-left transition-all hover:scale-105 group disabled:opacity-50"
            >
              <Flame className="w-5 h-5 text-amber-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-white">Scalper Bot</span>
              <span className="text-[10px] text-slate-400">10 checkout snipes</span>
            </button>

            {/* Credential Stuffer */}
            <button
              disabled={isSimulating}
              onClick={() => handleLaunchAttack('credential_stuffing', 12, 120)}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-950 hover:bg-purple-950/40 border border-slate-800 hover:border-purple-500/40 text-left transition-all hover:scale-105 group disabled:opacity-50"
            >
              <Key className="w-5 h-5 text-purple-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-white">Auth Stuffer</span>
              <span className="text-[10px] text-slate-400">12 brute logins</span>
            </button>

            {/* Legitimate Human */}
            <button
              disabled={isSimulating}
              onClick={() => handleLaunchAttack('human_with_sdk', 10, 150)}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-950 hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-500/40 text-left transition-all hover:scale-105 group disabled:opacity-50"
            >
              <UserCheck className="w-5 h-5 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-white">Human + SDK</span>
              <span className="text-[10px] text-slate-400">Verified Token</span>
            </button>
          </div>
        </div>

        {simMessage && (
          <div className="mt-4 p-3 bg-indigo-950/80 border border-indigo-800 rounded-xl text-xs text-indigo-300 flex items-center gap-2 animate-fadeIn">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>{simMessage}</span>
          </div>
        )}
      </div>

      {/* KPI METRICS OVERVIEW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Inspected */}
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Inspected</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-black text-white mt-2 font-mono">
            {stats.total_requests}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Edge Evaluated Requests</span>
        </div>

        {/* Blocked Threats */}
        <div className="bg-slate-900/80 border border-rose-900/30 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-400">Blocked Bots</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-3xl font-black text-rose-400 mt-2 font-mono">
            {stats.blocked_count}
          </div>
          <span className="text-[11px] text-rose-300/70 mt-1 block font-medium">
            {blockPercentage}% Threat Mitigation Rate
          </span>
        </div>

        {/* Challenged / CAPTCHA */}
        <div className="bg-slate-900/80 border border-amber-900/30 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400">CAPTCHA Challenges</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-400 mt-2 font-mono">
            {stats.challenged_count}
          </div>
          <span className="text-[11px] text-amber-300/70 mt-1 block font-medium">
            Proof-of-work Puzzles Issued
          </span>
        </div>

        {/* Verified Humans */}
        <div className="bg-slate-900/80 border border-emerald-900/30 p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400">Verified Humans</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400 mt-2 font-mono">
            {stats.allowed_count}
          </div>
          <span className="text-[11px] text-emerald-300/70 mt-1 block font-medium">
            {humanPercentage}% Clean Traffic Rate
          </span>
        </div>
      </div>

      {/* THREAT ANALYSIS PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Triggered WAF Rules */}
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" /> Top Triggered AWS WAF Rules
          </h3>
          <div className="space-y-3">
            {Object.keys(stats.top_rules).length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No rules triggered yet. Run an attack above!</p>
            ) : (
              Object.entries(stats.top_rules).map(([rule, count]) => {
                const pct = stats.total_requests > 0 ? Math.round((count / stats.total_requests) * 100) : 0;
                const isBlockRule = rule.includes('Scraper') || rule.includes('Scalper') || rule.includes('Credential') || rule.includes('Signal');
                return (
                  <div key={rule} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className={`font-mono truncate max-w-xs ${isBlockRule ? 'text-rose-300' : 'text-emerald-300'}`}>
                        {rule}
                      </span>
                      <span className="text-slate-400 font-mono">{count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isBlockRule ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bot Breakdown by Category */}
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-400" /> Bot Category Classification
          </h3>
          <div className="space-y-3">
            {Object.keys(stats.bot_breakdown).length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No telemetry classified yet.</p>
            ) : (
              Object.entries(stats.bot_breakdown).map(([cat, count]) => {
                const pct = stats.total_requests > 0 ? Math.round((count / stats.total_requests) * 100) : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-white font-medium">{cat}</span>
                      <span className="text-slate-400 font-mono">{count} requests</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* LIVE TELEMETRY STREAM TABLE */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" /> Live WAF Telemetry Stream
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspecting client IP, browser telemetry score, token validity & WAF rule actions
            </p>
          </div>

          {/* Action Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {(['ALL', 'ALLOW', 'CHALLENGE', 'BLOCK'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  activeFilter === filter
                    ? filter === 'BLOCK'
                      ? 'bg-rose-600 text-white'
                      : filter === 'CHALLENGE'
                      ? 'bg-amber-600 text-white'
                      : filter === 'ALLOW'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Events Table */}
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 sticky top-0 border-b border-slate-800 text-slate-400 uppercase font-mono text-[10px]">
              <tr>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Client IP</th>
                <th className="py-3 px-4">Endpoint</th>
                <th className="py-3 px-4">Bot Category</th>
                <th className="py-3 px-4">Rule Triggered</th>
                <th className="py-3 px-4">Token Status</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-sans text-xs">
                    No matching telemetry events. Trigger an attack or browse the store to populate!
                  </td>
                </tr>
              ) : (
                filteredEvents.map((evt, idx) => (
                  <tr
                    key={`${evt.id}-${idx}`}
                    onClick={() => setSelectedEvent(evt)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                      {evt.timestamp.split(' ')[1]}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        evt.waf_action === 'ALLOW'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : evt.waf_action === 'BLOCK'
                          ? 'bg-rose-950 text-rose-400 border border-rose-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}>
                        {evt.waf_action === 'ALLOW' && <CheckCircle2 className="w-3 h-3" />}
                        {evt.waf_action === 'BLOCK' && <XCircle className="w-3 h-3" />}
                        {evt.waf_action === 'CHALLENGE' && <AlertTriangle className="w-3 h-3" />}
                        {evt.waf_action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 whitespace-nowrap">{evt.client_ip}</td>
                    <td className="py-3 px-4 font-sans text-white font-medium max-w-xs truncate">
                      <span className="text-slate-500 font-mono text-[10px] mr-1.5">{evt.method}</span>
                      {evt.path}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300 whitespace-nowrap">
                      {evt.bot_category}
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate text-[11px]">
                      {evt.rule_name}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        evt.token_status === 'VALID'
                          ? 'bg-emerald-950/60 text-emerald-400'
                          : evt.token_status === 'CHALLENGED'
                          ? 'bg-amber-950/60 text-amber-400'
                          : 'bg-rose-950/60 text-rose-400'
                      }`}>
                        {evt.token_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button className="text-slate-400 hover:text-cyan-400 p-1">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EVENT DETAILS MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" /> WAF Event Telemetry Inspector
              </h4>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-white p-1">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Event ID:</span>
                  <span className="text-slate-200">{selectedEvent.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Timestamp:</span>
                  <span className="text-slate-200">{selectedEvent.timestamp}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Client IP:</span>
                  <span className="text-cyan-400">{selectedEvent.client_ip}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Request:</span>
                  <span className="text-white">{selectedEvent.method} {selectedEvent.path}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Action:</span>
                  <span className="font-bold text-rose-400">{selectedEvent.waf_action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">WAF Rule:</span>
                  <span className="text-amber-300">{selectedEvent.rule_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bot Category:</span>
                  <span className="text-indigo-400">{selectedEvent.bot_category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Telemetry Score:</span>
                  <span className="text-emerald-400">{selectedEvent.telemetry_score} / 1.0</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1 font-sans font-semibold">User-Agent</span>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-300 break-all">
                  {selectedEvent.user_agent}
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1 font-sans font-semibold">WAF Mitigation Details</span>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-300">
                  {selectedEvent.details}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedEvent(null)}
              className="mt-5 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
            >
              Close Inspector
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
