import { useState, useEffect } from 'react';
import type { Product, CartItem } from './types';
import { api } from './services/api';
import { wafIntegration } from './services/wafIntegration';
import { Navbar } from './components/Navbar';
import { ProductCatalog } from './components/ProductCatalog';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { WafCaptchaModal } from './components/WafCaptchaModal';
import { MonitoringDashboard } from './pages/MonitoringDashboard';

export function App() {
  const [activeTab, setActiveTab] = useState<'store' | 'monitoring'>('store');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // WAF Challenge Modal State
  const [isCaptchaOpen, setIsCaptchaOpen] = useState(false);
  const [captchaCallbacks, setCaptchaCallbacks] = useState<{
    onSuccess: (token: string) => void;
    onCancel: () => void;
  } | null>(null);

  // Load products on mount
  useEffect(() => {
    loadProducts();

    // Register challenge interceptor with AWS WAF SDK service
    wafIntegration.registerChallengeHandler(({ onSuccess, onCancel }) => {
      setIsCaptchaOpen(true);
      setCaptchaCallbacks({
        onSuccess: (freshToken: string) => {
          setIsCaptchaOpen(false);
          onSuccess(freshToken);
        },
        onCancel: () => {
          setIsCaptchaOpen(false);
          onCancel();
        }
      });
    });
  }, []);

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  // Cart Handlers
  const handleAddToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const handleInstantBuy = (product: Product) => {
    setCart([{ product, quantity: 1 }]);
    setIsCheckoutOpen(true);
  };

  const handleUpdateQty = (productId: string, qty: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: qty } : item
      )
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const totalCartCount = cart.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Global Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cartCount={totalCartCount}
        openCart={() => setIsCartOpen(true)}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'store' ? (
          <ProductCatalog
            products={products}
            isLoading={isLoadingProducts}
            onAddToCart={handleAddToCart}
            onInstantBuy={handleInstantBuy}
          />
        ) : (
          <MonitoringDashboard />
        )}
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemoveFromCart}
        onCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cart}
        onOrderSuccess={() => {
          setCart([]);
          loadProducts(); // refresh remaining stock
        }}
      />

      {/* AWS WAF Interactive CAPTCHA Puzzle Challenge Modal */}
      <WafCaptchaModal
        isOpen={isCaptchaOpen}
        onSuccess={(token) => {
          if (captchaCallbacks) captchaCallbacks.onSuccess(token);
        }}
        onCancel={() => {
          if (captchaCallbacks) captchaCallbacks.onCancel();
        }}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>NexusCommerce Architecture Demo with AWS WAF Bot Control & JS SDK</span>
          </div>
          <div className="font-mono text-[11px] text-slate-600">
            Targeted RuleSet Active • Token Domain: waf.nexuscommerce.internal
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
