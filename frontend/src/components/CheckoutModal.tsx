import React, { useState } from 'react';
import type { CartItem } from '../types';
import { api } from '../services/api';
import { X, CheckCircle, ShieldAlert, RotateCw, PackageCheck, CreditCard } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onOrderSuccess: () => void;
}

export const CheckoutModal: React.FC<Props> = ({ isOpen, onClose, items, onOrderSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [address, setAddress] = useState('742 Evergreen Terrace, Seattle, WA');

  if (!isOpen) return null;

  const total = items.reduce((acc, curr) => acc + curr.product.price * curr.quantity, 0);

  const handleCheckout = async () => {
    setIsSubmitting(true);
    setErrorMessage('');
    setOrderResult(null);

    try {
      // Process first item or loop through items
      const primaryItem = items[0];
      const result = await api.checkout(primaryItem.product.id, primaryItem.quantity, address);
      setOrderResult(result);
      onOrderSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Checkout failed. Blocked or challenged by WAF.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white">Protected Checkout</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {orderResult ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl mx-auto flex items-center justify-center">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h4 className="text-xl font-black text-white">Order Confirmed!</h4>
            <p className="text-sm text-slate-300">
              Order ID: <span className="font-mono text-cyan-400">{orderResult.order_id}</span>
            </p>
            <div className="bg-slate-950 p-4 rounded-xl text-xs text-left space-y-2 border border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Paid:</span>
                <span className="text-white font-bold">${orderResult.total_amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Security Verification:</span>
                <span className="text-emerald-400 font-medium">{orderResult.waf_protection}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-xs"
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 uppercase font-bold">Order Summary</span>
              {items.map((i) => (
                <div key={i.product.id} className="flex justify-between text-xs text-slate-300">
                  <span>{i.product.name} (x{i.quantity})</span>
                  <span className="font-mono font-bold">${(i.product.price * i.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-black text-white">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Shipping Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all hover:scale-[1.01]"
            >
              {isSubmitting ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" /> Verifying WAF Token & Reserving Stock...
                </>
              ) : (
                <>
                  <PackageCheck className="w-4 h-4" /> Place Order (${total.toFixed(2)})
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
