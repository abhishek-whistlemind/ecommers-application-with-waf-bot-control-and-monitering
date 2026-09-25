import React, { useState } from 'react';
import type { Product } from '../types';
import { Zap, ShieldCheck, Flame, Star, ShoppingCart, Search } from 'lucide-react';

interface Props {
  products: Product[];
  onAddToCart: (product: Product) => void;
  onInstantBuy: (product: Product) => void;
  isLoading: boolean;
}

export const ProductCatalog: React.FC<Props> = ({
  products,
  onAddToCart,
  onInstantBuy,
  isLoading
}) => {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = ['All', 'Hardware', 'Footwear', 'Electronics', 'Audio', 'Wearables', 'Peripherals'];

  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'All' || p.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* High-Impact Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden border border-indigo-500/30 bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-950 p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/80 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <Flame className="w-4 h-4 text-orange-400 fill-orange-400" /> Limited Batch Drops & Anti-Scalper Protection
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Next-Gen Hardware & Apparel, <br />
            <span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-rose-400 bg-clip-text text-transparent">
              Shielded by AWS WAF Bot Control
            </span>
          </h1>
          <p className="mt-4 text-slate-300 text-base leading-relaxed">
            Every inventory request and checkout interaction is verified through the AWS WAF JavaScript SDK. 
            Real shoppers enjoy frictionless shopping while automated scalpers, inventory hoarders, and price scrapers are stopped at the edge.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 border border-slate-800/80 p-3 rounded-2xl">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search items or specs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-96 rounded-2xl bg-slate-900/40 border border-slate-800/60 animate-pulse" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-slate-800/60">
          <p className="text-slate-400 text-sm">No products found matching your filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="group bg-slate-900/70 border border-slate-800/80 rounded-2xl overflow-hidden hover:border-slate-700 transition-all duration-300 flex flex-col justify-between shadow-lg hover:shadow-cyan-500/5 hover:-translate-y-1"
            >
              <div>
                {/* Product Image Container */}
                <div className="relative h-56 w-full overflow-hidden bg-slate-950">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                    {product.is_flash_sale && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/90 text-white font-bold text-[11px] backdrop-blur-md shadow-md">
                        <Flame className="w-3.5 h-3.5 fill-white" /> BOT TARGET / DROP
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/80 text-slate-300 text-[10px] font-medium backdrop-blur-md">
                      {product.category}
                    </span>
                  </div>

                  {/* Stock pill */}
                  <div className="absolute bottom-3 right-3">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold backdrop-blur-md border ${
                      product.stock <= 10
                        ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                        : 'bg-slate-900/80 text-slate-300 border-slate-800/60'
                    }`}>
                      {product.stock} in stock
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1 text-amber-400 text-xs font-semibold">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      <span>{product.rating}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-cyan-400 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" /> WAF Protected
                    </div>
                  </div>

                  <h3 className="font-bold text-white text-base leading-snug group-hover:text-cyan-400 transition-colors">
                    {product.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                    {product.description}
                  </p>

                  {/* Specs Pills */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {product.specs.slice(0, 3).map((spec, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Price and Actions */}
              <div className="p-5 pt-0 border-t border-slate-800/60 mt-4 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-medium block">Price</span>
                  <span className="text-xl font-extrabold text-white">
                    ${product.price.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onAddToCart(product)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all hover:scale-105"
                    title="Add to Cart"
                  >
                    <ShoppingCart className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onInstantBuy(product)}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all hover:scale-105"
                  >
                    <Zap className="w-3.5 h-3.5 fill-white" /> Buy Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
