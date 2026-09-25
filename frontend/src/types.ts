export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  image_url: string;
  is_flash_sale: boolean;
  rating: number;
  specs: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface WafEvent {
  id: string;
  timestamp: string;
  client_ip: string;
  method: string;
  path: string;
  user_agent: string;
  waf_action: 'ALLOW' | 'CHALLENGE' | 'BLOCK';
  rule_name: string;
  bot_category: string;
  token_status: string;
  token_id: string | null;
  telemetry_score: number;
  status_code: number;
  details: string;
}

export interface WafStats {
  total_requests: number;
  allowed_count: number;
  blocked_count: number;
  challenged_count: number;
  human_count: number;
  bot_count: number;
  top_rules: Record<string, number>;
  bot_breakdown: Record<string, number>;
  recent_events: WafEvent[];
}

export interface ChallengeRequestData {
  url: string;
  options: RequestInit;
  resolve: (res: Response) => void;
  reject: (err: any) => void;
}
