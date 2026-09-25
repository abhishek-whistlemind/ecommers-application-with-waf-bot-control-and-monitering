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

type ChallengeCallback = (challengeData: {
  onSuccess: (token: string) => void;
  onCancel: () => void;
}) => void;

class AwsWafService {
  private currentToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private challengeHandler: ChallengeCallback | null = null;
  private telemetryData = {
    mouseMovements: 0,
    keystrokes: 0,
    screenW: window.screen.width,
    screenH: window.screen.height,
    canvasHash: '',
  };
  private listeners: Set<(token: string | null) => void> = new Set();

  constructor() {
    this.initTelemetryListeners();
    this.generateCanvasEntropy();
    // Initialize token automatically on page load
    this.acquireToken();
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
    // 1. Check live AWS WAF SDK if loaded globally
    if ((window as any).AwsWafIntegration?.getToken) {
      try {
        const liveToken = await (window as any).AwsWafIntegration.getToken();
        if (liveToken) {
          this.currentToken = liveToken;
          this.tokenExpiresAt = Date.now() + 14 * 60 * 1000;
          this.notifyTokenChange();
          return liveToken;
        }
      } catch (err) {
        console.warn('Live AWS WAF SDK failed, falling back to simulator:', err);
      }
    }

    // 2. Local / Simulator Mode
    try {
      const res = await fetch('http://127.0.0.1:8000/api/waf/acquire-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telemetry: {
            ...this.telemetryData,
            userAgent: navigator.userAgent,
            timestamp: Date.now()
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        this.currentToken = data.token;
        this.tokenExpiresAt = Date.now() + (data.ttl_seconds || 900) * 1000;
        this.notifyTokenChange();
        return this.currentToken!;
      }
    } catch (e) {
      console.error('Failed to acquire WAF token:', e);
    }

    return '';
  }

  public async getToken(): Promise<string | null> {
    if (!this.currentToken || Date.now() >= this.tokenExpiresAt - 60000) {
      await this.acquireToken();
    }
    return this.currentToken;
  }

  public hasToken(): boolean {
    return !!this.currentToken && Date.now() < this.tokenExpiresAt;
  }

  public invalidateToken() {
    this.currentToken = null;
    this.tokenExpiresAt = 0;
    this.notifyTokenChange();
  }

  public setToken(token: string) {
    this.currentToken = token;
    this.tokenExpiresAt = Date.now() + 14 * 60 * 1000;
    this.notifyTokenChange();
  }

  /**
   * AwsWafIntegration.fetch wrapper
   * Automatically injects x-amzn-waf-action-token and handles 405 Challenge
   */
  public async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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

    // Check if AWS WAF Bot Control returned a 405 Challenge (or 202)
    if (response.status === 405 || response.headers.get('x-amzn-waf-challenge') === 'true') {
      console.warn('⚠️ AWS WAF Bot Control issued a CHALLENGE. Invoking CAPTCHA puzzle...');

      if (this.challengeHandler) {
        // Await interactive puzzle solve
        const freshToken = await new Promise<string>((resolve, reject) => {
          this.challengeHandler!({
            onSuccess: (newToken: string) => resolve(newToken),
            onCancel: () => reject(new Error('AWS WAF Challenge cancelled by user'))
          });
        });

        this.setToken(freshToken);

        // Retry original request with newly acquired challenge token
        const retryHeaders = new Headers(init?.headers || {});
        retryHeaders.set('x-amzn-waf-action-token', freshToken);

        response = await window.fetch(input, {
          ...init,
          headers: retryHeaders
        });
      }
    }

    return response;
  }
}

export const wafIntegration = new AwsWafService();

// Expose on window object to match AWS documentation standard
if (typeof window !== 'undefined') {
  (window as any).AwsWafIntegration = (window as any).AwsWafIntegration || {
    getToken: () => wafIntegration.getToken(),
    hasToken: () => wafIntegration.hasToken(),
    fetch: (input: RequestInfo | URL, init?: RequestInit) => wafIntegration.fetch(input, init)
  };
}
