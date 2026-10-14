import { wafIntegration } from './wafIntegration';
import { getApiBase } from './config';
import type { Product, WafStats, WafEvent } from '../types';

const API_BASE = getApiBase();

export const api = {
  async getProducts(category?: string, flashOnly?: boolean, search?: string): Promise<Product[]> {
    const params = new URLSearchParams();
    if (category && category !== 'All') params.append('category', category);
    if (flashOnly) params.append('flash_only', 'true');
    if (search) params.append('search', search);

    const res = await wafIntegration.fetch(`${API_BASE}/api/products?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.reason || err.error || 'Failed to fetch products');
    }
    return res.json();
  },

  async checkout(productId: string, quantity: number = 1, address: string = '123 Market St, San Francisco, CA'): Promise<any> {
    const res = await wafIntegration.fetch(`${API_BASE}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        quantity,
        shipping_address: address,
        card_last_four: '4242'
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.reason || data.error || 'Checkout failed');
    }
    return data;
  },

  async login(username: string, password: string): Promise<any> {
    const res = await wafIntegration.fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.reason || data.error || 'Login failed');
    }
    return data;
  },

  async getWafStats(limit: number = 100): Promise<WafStats> {
    const res = await fetch(`${API_BASE}/api/monitoring/stats?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch WAF stats');
    return res.json();
  },

  async getAllEvents(limit: number = 250): Promise<WafEvent[]> {
    const res = await fetch(`${API_BASE}/api/monitoring/events?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch WAF events');
    const data = await res.json();
    return data.events || [];
  },

  async clearStats(): Promise<void> {
    await fetch(`${API_BASE}/api/monitoring/clear`, { method: 'POST' });
  },

  async launchAttackSimulation(
    attackType: string,
    requestCount: number = 15,
    delayMs: number = 150
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/api/monitoring/simulate-attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attack_type: attackType,
        request_count: requestCount,
        delay_ms: delayMs
      })
    });
    return res.json();
  }
};
