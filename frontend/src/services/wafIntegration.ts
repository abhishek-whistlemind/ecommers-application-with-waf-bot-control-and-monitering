/**
 * AWS WAF JavaScript SDK Integration Service
 * 
 * Provides:
 * 1. Interface matching official window.AwsWafIntegration
 * 2. Client-side browser telemetry collector (mouse events, screen entropy, canvas hash)
 * 3. Transparent AwsWafIntegration.fetch() wrapper with automatic token attachment
 * 4. Challenge interceptor: when backend issues 405 Challenge, triggers AWS WAF CAPTCHA modal
 * 5. Seamless fallback between Live AWS WAF Token Domain and Local Development Simulator
 */

import { getApiBase } from './config';

type ChallengeCallback = (challengeData: {
  onSuccess: (token: string) => void;
  onCancel: () => void;
}) => void;

/**
 * Helper to detect if a genuine AWS WAF SDK is present on window (not our local shim).
 */
function getRealAwsWafSdk(): { getToken: () => Promise<string> } | null {
  if (typeof window === 'undefined') return null;
  const sdk = (window as any).AwsWafIntegration;
  if (!sdk || sdk._isNexusShim || typeof sdk.getToken !== 'function') {
    return null;
  }
  return sdk;
}

function getWebGLInfo(): { vendor: string; renderer: string } {
  if (typeof window === 'undefined') return { vendor: 'ssr', renderer: 'ssr' };
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return { vendor: 'unsupported', renderer: 'unsupported' };
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return { vendor: 'generic', renderer: 'generic' };
    return {
      vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown',
      renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown',
    };
  } catch {
    return { vendor: 'unknown', renderer: 'unknown' };
  }
}

/**
 * Intercepts outgoing network requests to inspect any traffic sent to AWS WAF edge endpoints
 * (e.g. *.edge.sdk.awswaf.com or *.awswaf.com challenge / telemetry exchange).
 */
function installAwsWafNetworkInterceptor() {
  if (typeof window === 'undefined' || (window as any)._wafNetworkInterceptorInstalled) return;
  (window as any)._wafNetworkInterceptorInstalled = true;

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    if (url && (url.includes('awswaf.com') || url.includes('/api/waf/acquire-token'))) {
      console.group(`📡 [AWS WAF Network Intercept] Outgoing Token Acquisition Request -> ${url}`);
      console.log('🌐 Endpoint URL:', url);
      console.log('⚙️ Method:', init?.method || 'GET');
      console.log('📋 Headers:', init?.headers);
      if (init?.body) {
        try {
          const parsed = JSON.parse(init.body as string);
          console.log('📦 Data Passed to WAF Endpoint (Parsed JSON Payload):', parsed);
          if (parsed.telemetry) {
            console.log('📊 Telemetry Breakdown:');
            console.table(parsed.telemetry);
          }
        } catch {
          console.log('📦 Data Passed to WAF Endpoint (Raw Payload):', init.body);
        }
      }
      console.groupEnd();
    }

    return originalFetch.apply(this, args);
  };
}

// Install interceptor early
installAwsWafNetworkInterceptor();

class AwsWafService {
  private currentToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private challengeHandler: ChallengeCallback | null = null;
  private inFlightAcquire: Promise<string> | null = null;
  private telemetryData = {
    mouseMovements: 0,
    keystrokes: 0,
    screenW: typeof window !== 'undefined' ? window.screen.width : 1920,
    screenH: typeof window !== 'undefined' ? window.screen.height : 1080,
    colorDepth: typeof window !== 'undefined' ? window.screen.colorDepth : 24,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    canvasHash: '',
  };
  private listeners: Set<(token: string | null) => void> = new Set();
  private tokenDroppedManually = false;

  constructor() {
    this.initTelemetryListeners();
    this.generateCanvasEntropy();
    // Wait for the real AWS WAF JS SDK (waf.js loaded with `defer`) to be ready
    // before acquiring a token so we don't fall through to the local simulator.
    this.initTokenWhenSdkReady();
  }

  /**
   * Builds the complete client telemetry payload collected by the SDK
   * to evaluate client legitimacy and exchange for an AWS WAF Action Token.
   */
  public getTelemetryPayload(): Record<string, any> {
    if (typeof window === 'undefined') return {};
    const webgl = getWebGLInfo();
    return {
      // 1. Behavioral interaction signals (human jitter, typing cadence)
      mouseMovements: this.telemetryData.mouseMovements,
      keystrokes: this.telemetryData.keystrokes,
      
      // 2. Display and hardware fingerprinting
      screenW: window.screen.width,
      screenH: window.screen.height,
      colorDepth: window.screen.colorDepth,
      devicePixelRatio: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      deviceMemory: (navigator as any).deviceMemory || 'N/A',

      // 3. Canvas & GPU graphics entropy
      canvasHash: this.telemetryData.canvasHash || 'fallback_entropy',
      webglRenderer: webgl.renderer,
      webglVendor: webgl.vendor,

      // 4. Client environment & anti-automation indicators
      webdriver: !!navigator.webdriver,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: Date.now()
    };
  }

  /**
   * Prominently prints the exact data passed by the SDK to WAF in browser DevTools Console
   */
  public printTelemetryData(): Record<string, any> {
    const payload = this.getTelemetryPayload();
    console.group('%c🛡️ [AWS WAF JavaScript SDK] Data Passed to WAF to Obtain Token', 'color: #06b6d4; font-size: 13px; font-weight: bold;');
    console.log(
      '%cAWS WAF uses client-side JavaScript SDK telemetry to distinguish legitimate humans from automated bots and issue signed tokens (x-amzn-waf-action-token / aws-waf-token).',
      'color: #94a3b8; font-style: italic;'
    );
    console.log('%c📋 Summary Table of Collected Signals:', 'color: #38bdf8; font-weight: bold;');
    console.table({
      'Mouse Movements': { Value: payload.mouseMovements, Description: 'Human cursor jitter / movement events' },
      'Keystroke Events': { Value: payload.keystrokes, Description: 'Physical keyboard input count' },
      'Screen Resolution': { Value: `${payload.screenW}x${payload.screenH}`, Description: 'Physical viewport geometry' },
      'Color Depth': { Value: `${payload.colorDepth}-bit`, Description: 'Screen palette bit depth' },
      'Device Pixel Ratio': { Value: payload.devicePixelRatio, Description: 'Retina / High-DPI scaling factor' },
      'Hardware Cores (CPU)': { Value: payload.hardwareConcurrency, Description: 'Logical processor threads' },
      'Device Memory (RAM)': { Value: `${payload.deviceMemory} GB`, Description: 'Device memory estimate' },
      'Canvas Fingerprint': { Value: payload.canvasHash, Description: '2D graphics rendering entropy hash' },
      'GPU Unmasked Renderer': { Value: payload.webglRenderer.slice(0, 35) + '...', Description: 'WebGL hardware graphic accelerator' },
      'Automation Flag (webdriver)': { Value: payload.webdriver ? '⚠️ TRUE (Bot/Headless)' : '✅ FALSE (Human Browser)', Description: 'navigator.webdriver flag' },
      'Timezone': { Value: payload.timezone, Description: 'Client system timezone' },
      'Timestamp': { Value: payload.timestamp, Description: 'Telemetry capture epoch millisecond' }
    });
    console.log('%c📦 Full Raw Telemetry Payload Object (Passed to WAF):', 'color: #a855f7; font-weight: bold;', payload);
    console.groupEnd();
    return payload;
  }

  /**
   * Waits for window.AwsWafIntegration to be populated by the deferred waf.js
   * script before calling acquireToken(). Falls back to the simulator after
   * SDK_WAIT_TIMEOUT_MS if the real SDK never loads (e.g. in local dev).
   */
  private initTokenWhenSdkReady(SDK_WAIT_TIMEOUT_MS = 2_000) {
    if (typeof window === 'undefined') return;

    // If genuine AWS WAF SDK is already available, acquire immediately.
    if (getRealAwsWafSdk()) {
      this.acquireToken();
      return;
    }

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      this.acquireToken();
    };

    // Poll every 100 ms for genuine window.AwsWafIntegration to appear (set by waf.js)
    const pollInterval = window.setInterval(() => {
      if (getRealAwsWafSdk()) {
        clearInterval(pollInterval);
        clearTimeout(fallbackTimer);
        settle();
      }
    }, 100);

    // Hard timeout – fall back to simulator so the page still works in local dev
    const fallbackTimer = window.setTimeout(() => {
      clearInterval(pollInterval);
      settle();
    }, SDK_WAIT_TIMEOUT_MS);
  }

  private initTelemetryListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('mousemove', () => {
      this.telemetryData.mouseMovements = Math.min(this.telemetryData.mouseMovements + 1, 500);
    }, { passive: true });

    window.addEventListener('keydown', () => {
      this.telemetryData.keystrokes = Math.min(this.telemetryData.keystrokes + 1, 200);
    }, { passive: true });
  }

  private generateCanvasEntropy() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 30;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('AWS_WAF_TELEMETRY_ENTROPY', 2, 2);
        this.telemetryData.canvasHash = canvas.toDataURL().slice(-16);
      }
    } catch {
      this.telemetryData.canvasHash = 'fallback_entropy';
    }
  }

  public registerChallengeHandler(handler: ChallengeCallback) {
    this.challengeHandler = handler;
  }

  public subscribeTokenChange(callback: (token: string | null) => void) {
    this.listeners.add(callback);
    callback(this.currentToken);
    return () => this.listeners.delete(callback);
  }

  private notifyTokenChange() {
    this.listeners.forEach((cb) => cb(this.currentToken));
  }

  /**
   * Acquires AWS WAF Action Token
   * Checks if live window.AwsWafIntegration exists, otherwise calls simulated endpoint
   */
  public async acquireToken(): Promise<string> {
    this.tokenDroppedManually = false;
    if (this.inFlightAcquire) {
      return this.inFlightAcquire;
    }
    this.inFlightAcquire = this._doAcquireToken().finally(() => {
      this.inFlightAcquire = null;
    });
    return this.inFlightAcquire;
  }

  private async _doAcquireToken(): Promise<string> {
    // Print the telemetry data prepared by the SDK
    const telemetryPayload = this.printTelemetryData();

    // 1. Check genuine AWS WAF SDK if loaded globally (ignore our own shim)
    const realSdk = getRealAwsWafSdk();
    if (realSdk) {
      try {
        console.log('[AWS WAF] 🌐 Invoking live AWS WAF JS SDK (window.AwsWafIntegration.getToken())...');
        const liveToken = await realSdk.getToken();
        if (liveToken) {
          console.log('[AWS WAF] ✅ Received LIVE AWS WAF Token:');
          console.log(liveToken);
          this.currentToken = liveToken;
          this.tokenExpiresAt = Date.now() + 14 * 60 * 1000;
          this.notifyTokenChange();
          return liveToken;
        } else {
          console.warn('[AWS WAF] Live AwsWafIntegration.getToken() returned an empty token.');
        }
      } catch (err) {
        console.warn('[AWS WAF] Live AWS WAF SDK failed, falling back to simulator:', err);
      }
    } else {
      console.log('[AWS WAF] Live AWS WAF SDK not detected on window; using local simulator endpoint.');
    }

    // 2. Local / Simulator Mode
    try {
      console.log('[AWS WAF] 🚀 Transmitting telemetry payload to backend simulator (/api/waf/acquire-token)...');
      const res = await fetch(`${getApiBase()}/api/waf/acquire-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telemetry: telemetryPayload
        })
      });

      if (res.ok) {
        const data = await res.json();
        console.log('[AWS WAF] 🔧 Received SIMULATOR WAF Token:', data.token);
        this.currentToken = data.token;
        this.tokenExpiresAt = Date.now() + (data.ttl_seconds || 900) * 1000;
        this.notifyTokenChange();
        return this.currentToken!;
      }
    } catch (e) {
      console.error('[AWS WAF] Failed to acquire WAF token:', e);
    }

    return '';
  }

  public async getToken(): Promise<string | null> {
    if (this.tokenDroppedManually) {
      return null;
    }
    if (!this.currentToken || Date.now() >= this.tokenExpiresAt - 60000) {
      await this.acquireToken();
    }
    return this.currentToken;
  }

  public hasToken(): boolean {
    return !this.tokenDroppedManually && !!this.currentToken && Date.now() < this.tokenExpiresAt;
  }

  public invalidateToken() {
    console.log('[AWS WAF] 🛑 Token invalidated/dropped manually');
    this.currentToken = null;
    this.tokenExpiresAt = 0;
    this.tokenDroppedManually = true;
    this.notifyTokenChange();
  }

  public setToken(token: string) {
    console.log('[AWS WAF] 🔑 Token set/refreshed:', token);
    this.currentToken = token;
    this.tokenExpiresAt = Date.now() + 14 * 60 * 1000;
    this.tokenDroppedManually = false;
    this.notifyTokenChange();
  }

  /**
   * AwsWafIntegration.fetch wrapper
   * Automatically injects x-amzn-waf-action-token and handles both:
   * 1. Action: CAPTCHA -> Pops interactive AWS WAF CAPTCHA modal
   * 2. Action: CHALLENGE -> Resolves silent browser challenge in background without UI interruption
   */
  public async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const token = await this.getToken();
    const headers = new Headers(init?.headers || {});

    if (token) {
      headers.set('x-amzn-waf-action-token', token);
    }

    const modifiedInit: RequestInit = {
      ...init,
      headers
    };

    let response = await window.fetch(input, modifiedInit);

    // Check if AWS WAF Bot Control returned a 405 Challenge / CAPTCHA (or 202)
    if (response.status === 405 || response.headers.get('x-amzn-waf-challenge') === 'true') {
      const wafAction = (response.headers.get('x-amzn-waf-action') || '').toLowerCase();
      const challengeType = (response.headers.get('x-amzn-waf-challenge-type') || '').toLowerCase();
      const wafRule = response.headers.get('x-amzn-waf-rule') || 'BotControl';

      // ─── Case 1: CAPTCHA (Interactive Visual/Audio Puzzle) ───
      if (wafAction === 'captcha' || challengeType === 'captcha') {
        console.group(`🧩 [AWS WAF] Interactive CAPTCHA Triggered -> ${urlStr}`);
        console.log('🌐 Endpoint:', urlStr);
        console.log('⚠️ Status: 405 Method Not Allowed | Action: CAPTCHA');
        console.log('🛡️ WAF Rule Triggered:', wafRule);
        console.log('👉 Displaying AWS WAF CAPTCHA Modal for user verification...');
        console.groupEnd();

        if (this.challengeHandler) {
          const freshToken = await new Promise<string>((resolve, reject) => {
            this.challengeHandler!({
              onSuccess: (newToken: string) => resolve(newToken),
              onCancel: () => reject(new Error('AWS WAF CAPTCHA cancelled by user'))
            });
          });

          console.log(`[AWS WAF] ✅ CAPTCHA solved by user! Replaying ${urlStr} with new token:`, freshToken);
          this.setToken(freshToken);

          // Retry original request with newly acquired token
          const retryHeaders = new Headers(init?.headers || {});
          retryHeaders.set('x-amzn-waf-action-token', freshToken);

          response = await window.fetch(input, {
            ...init,
            headers: retryHeaders
          });
          console.log(`[AWS WAF] ✅ Replayed request to ${urlStr} finished with status ${response.status}`);
        }
      }
      // ─── Case 2: CHALLENGE (Silent Browser Challenge) ───
      else {
        console.group(`🛡️ [AWS WAF] Silent Browser Challenge Triggered -> ${urlStr}`);
        console.log('🌐 Endpoint:', urlStr);
        console.log('⚠️ Status: 405 Method Not Allowed | Action: CHALLENGE');
        console.log('🛡️ WAF Rule Triggered:', wafRule);
        console.log('🔄 Executing silent background token challenge via AWS WAF SDK...');
        console.groupEnd();

        // Run the background telemetry exchange silently without showing any puzzle
        const freshToken = await this.acquireToken();

        if (freshToken) {
          console.log(`[AWS WAF] ✅ Silent Challenge passed! Acquired token:`, freshToken);
          console.log(`[AWS WAF] 🚀 Replaying ${urlStr} with verified action token...`);

          const retryHeaders = new Headers(init?.headers || {});
          retryHeaders.set('x-amzn-waf-action-token', freshToken);

          response = await window.fetch(input, {
            ...init,
            headers: retryHeaders
          });
          console.log(`[AWS WAF] ✅ Replayed request to ${urlStr} finished with status ${response.status}`);
        } else {
          console.error(`[AWS WAF] ❌ Failed to acquire silent challenge token for ${urlStr}`);
        }
      }
    }

    return response;
  }
}

export const wafIntegration = new AwsWafService();

// Expose shim and debug utilities on window object
if (typeof window !== 'undefined') {
  (window as any).printWafTelemetryData = () => wafIntegration.printTelemetryData();
  (window as any).getWafTelemetryData = () => wafIntegration.getTelemetryPayload();

  if (!(window as any).AwsWafIntegration) {
    (window as any).AwsWafIntegration = {
      _isNexusShim: true,
      getToken: () => wafIntegration.getToken(),
      hasToken: () => wafIntegration.hasToken(),
      fetch: (input: RequestInfo | URL, init?: RequestInit) => wafIntegration.fetch(input, init),
      printTelemetry: () => wafIntegration.printTelemetryData(),
      getTelemetry: () => wafIntegration.getTelemetryPayload()
    };
  } else {
    // If real AWS SDK already exists on window, attach diagnostic print helper
    (window as any).AwsWafIntegration.printTelemetry = () => wafIntegration.printTelemetryData();
    (window as any).AwsWafIntegration.getTelemetry = () => wafIntegration.getTelemetryPayload();
  }
}
