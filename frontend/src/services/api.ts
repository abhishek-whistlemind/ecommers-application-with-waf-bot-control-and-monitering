import { wafIntegration } from './wafIntegration';
import type { Product, WafStats } from '../types';

const API_BASE = 'http://127.0.0.1:8000';

export const api = {
  async getProducts(category?: string, flashOnly?: boolean, search?: string): Promise<Product[]> {
    const params = new URLSearchParams();
    if (category && category !== 'All') params.append('category', category);
    if (flashOnly) params.append('flash_only', 'true');
    if (search) params.append('search', search);

    const res = await wafIntegration.fetch(`${API_BASE}/api/products?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.reason || err.error || 'Failed to fetch products');
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
      throw new Error(data.reason || data.error || 'Checkout failed');
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
      throw new Error(data.reason || data.error || 'Login failed');
    }
    return data;
  },

  async getWafStats(): Promise<WafStats> {
    const res = await fetch(`${API_BASE}/api/monitoring/stats`);
    if (!res.ok) throw new Error('Failed to fetch WAF stats');
    return res.json();
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
