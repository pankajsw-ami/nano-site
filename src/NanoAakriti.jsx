import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabaseClient";
import ChatWidget from "./components/chat/ChatWidget";
import AdminLogin from "./components/chat/AdminLogin";
import AdminChatDashboard from "./components/chat/AdminChatDashboard";
import { NANO_THEME } from "./theme";
import {
  ensureAnonymousCustomer,
  FIGURINE_REQUEST_BUCKET,
  FIGURINE_REQUEST_STATUSES,
  uploadFigurineRequestPhoto,
  validateFigurinePhoto,
} from "./lib/figurineRequests";
function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return w;
}

function useScrollReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -30px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, visible ? "nano-scroll-visible" : ""];
}

try {
  if (!document.querySelector('link[data-nano-font]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.setAttribute('data-nano-font', '1');
    l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(l);
  }
} catch(e) {}

const CONTACT_EMAIL  = "nanoaakriti@gmail.com";
const GMAIL_COMPOSE_URL = "https://mail.google.com/mail/?view=cm&fs=1&to=nanoaakriti@gmail.com";
const INSTAGRAM_URL  = "https://www.instagram.com/nano_aakriti?utm_source=qr&igsh=M3dmbjF2MmJwd3d3";

const C = {
  orange:   NANO_THEME.primaryOrange,
  black:    NANO_THEME.darkBlack,
  white:    NANO_THEME.pureWhite,
  offWhite: NANO_THEME.offWhite,
  gray:     NANO_THEME.lightGray,
  midGray:  NANO_THEME.darkGray,
  darkGray: NANO_THEME.darkGray,
  coolMist: NANO_THEME.offWhite,
  warmGlow: NANO_THEME.pureWhite,
  blueMist: NANO_THEME.lightGray,
};

const defaultProducts = [];

const readStore = async (key) => {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  } catch {}
  try {
    const result = await window.storage?.get?.(key);
    if (result?.value !== undefined) return result.value;
  } catch {}
  return null;
};

const writeStore = async (key, value) => {
  try { window.localStorage.setItem(key, value); } catch {}
  try { await window.storage?.set?.(key, value); } catch {}
};

const normalizeStockQuantity = (value, fallback = 10) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};

const getAvailableStock = (product) => {
  if (!product || product.outOfStock) return 0;
  return normalizeStockQuantity(product.stockQuantity, 10);
};

const productRowFromDb = (row) => ({
  id: row.id,
  name: row.name,
  price: Number(row.price),
  description: row.description || "",
  category: row.category || "General",
  bgA: row.bg_a || "#0D0D0D",
  bgB: row.bg_b || "#1F1F1F",
  accent: row.accent || "#E85D04",
  stockQuantity: normalizeStockQuantity(row.stock_quantity, row.out_of_stock ? 0 : 10),
  outOfStock: Boolean(row.out_of_stock) || normalizeStockQuantity(row.stock_quantity, row.out_of_stock ? 0 : 10) === 0,
  image_path: row.image_path || null,
});

const productRowForDb = (product, imagePath = product.image_path || null) => ({
  id: product.id,
  name: product.name,
  price: Number(product.price) || 0,
  description: product.description || "",
  category: product.category || "General",
  bg_a: product.bgA || "#0D0D0D",
  bg_b: product.bgB || "#1F1F1F",
  accent: product.accent || "#E85D04",
  stock_quantity: normalizeStockQuantity(product.stockQuantity, product.outOfStock ? 0 : 10),
  out_of_stock: Boolean(product.outOfStock) || normalizeStockQuantity(product.stockQuantity, product.outOfStock ? 0 : 10) === 0,
  image_path: imagePath,
});

const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const getImageExtension = (mimeType = "") => {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return map[mimeType] || "jpg";
};

const createUniqueFileToken = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const productVariantRowFromDb = (row, imageUrl = "") => ({
  id: row.id,
  productId: row.product_id,
  color: row.color,
  imagePath: row.image_path,
  sortOrder: Number(row.sort_order) || 0,
  active: Boolean(row.active),
  imageUrl,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const variantSwatchColor = (color = "") => {
  const normalized = color.trim().toLowerCase();
  const knownColors = {
    red: "#D64545",
    black: "#17130F",
    white: "#FFFFFF",
    blue: "#3B82F6",
    green: "#3E8E5B",
    yellow: "#E7B93C",
    orange: "#E85D04",
    purple: "#7A5AA6",
    pink: "#D9789B",
    gray: "#8A817A",
    grey: "#8A817A",
    brown: "#8B5E3C",
  };
  return knownColors[normalized] || C.gray;
};

/* ── LOGO ── */
function NanoLogo({ scale = 1 }) {
  const height = Math.round(78 * scale);
  return (
    <img
      className="nano-logo"
      src="/logo.png"
      alt="Nano Aakriti"
      style={{ height: `${height}px`, width: "auto", display: "block", backgroundColor: "transparent" }}
    />
  );
}

function MotionStyles() {
  return (
    <style>{`
      @keyframes nanoFadeUp {
        from { opacity: 0; transform: translateY(18px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes nanoHeaderIn {
        from { opacity: 0; transform: translateY(-14px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes nanoGradientDrift {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }

      @keyframes nanoSoftGlow {
        0%, 100% { opacity: 0.74; transform: translate3d(0, 0, 0); }
        50% { opacity: 1; transform: translate3d(0, -10px, 0); }
      }

      @keyframes nanoFloat {
        0%, 100% { transform: translate3d(var(--hero-x, 0px), var(--hero-y, 0px), 0) rotate(0deg); }
        50% { transform: translate3d(var(--hero-x, 0px), calc(var(--hero-y, 0px) - 12px), 0) rotate(3deg); }
      }

      @keyframes nanoFloatSlow {
        0%, 100% { transform: translate3d(var(--hero-x, 0px), var(--hero-y, 0px), 0) rotate(0deg); }
        50% { transform: translate3d(calc(var(--hero-x, 0px) + 10px), calc(var(--hero-y, 0px) - 8px), 0) rotate(-4deg); }
      }

      @keyframes nanoOrbitGlow {
        0%, 100% { opacity: 0.28; transform: translate3d(var(--hero-x, 0px), var(--hero-y, 0px), 0) rotate(0deg) scale(1); }
        50% { opacity: 0.52; transform: translate3d(var(--hero-x, 0px), var(--hero-y, 0px), 0) rotate(18deg) scale(1.04); }
      }

      @keyframes nanoModalIn {
        from { opacity: 0; transform: perspective(1000px) translateY(18px) rotateX(2deg) scale(0.97); }
        to { opacity: 1; transform: perspective(1000px) translateY(0) rotateX(0) scale(1); }
      }

      @keyframes nanoPulseGlow {
        0%, 100% { box-shadow: 0 16px 34px rgba(13,13,13,0.24), 0 0 0 0 rgba(232,93,4,0.18); }
        50% { box-shadow: 0 20px 38px rgba(13,13,13,0.26), 0 0 0 8px rgba(232,93,4,0); }
      }

      .nano-shell { background-size: 160% 160%; animation: nanoGradientDrift 22s ease-in-out infinite; }

      .nano-hero {
        perspective: 1200px;
        transform-style: preserve-3d;
        isolation: isolate;
      }

      .nano-header {
        animation: nanoHeaderIn 560ms ease both;
        box-shadow: 0 10px 34px rgba(13, 13, 13, 0.08);
        transition: background 260ms ease, box-shadow 260ms ease, border-color 260ms ease;
      }

      .nano-header-scrolled {
        box-shadow: 0 14px 36px rgba(13, 13, 13, 0.13);
        border-bottom-color: rgba(232, 93, 4, 0.22) !important;
      }

      .nano-logo {
        filter: drop-shadow(0 8px 16px rgba(47, 36, 25, 0.12));
        transition: transform 220ms ease, filter 220ms ease;
      }

      .nano-logo:hover {
        transform: translateY(-1px) scale(1.015);
        filter: drop-shadow(0 10px 20px rgba(232, 93, 4, 0.16));
      }

      .nano-hero-wash {
        animation: nanoSoftGlow 7s ease-in-out infinite;
      }

      .nano-hero-depth {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        transform-style: preserve-3d;
      }

      .nano-depth-grid {
        position: absolute;
        left: 50%;
        bottom: -24%;
        width: min(820px, 130vw);
        height: 58%;
        opacity: 0.34;
        transform: translateX(calc(-50% + var(--hero-x, 0px))) translateY(var(--hero-y, 0px)) perspective(500px) rotateX(64deg) translateZ(-20px);
        background-image: linear-gradient(rgba(13,13,13,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(13,13,13,0.07) 1px, transparent 1px);
        background-size: 34px 34px;
        mask-image: linear-gradient(to top, rgba(0,0,0,0.78), transparent 76%);
      }

      .nano-depth-orbit,
      .nano-depth-cube,
      .nano-depth-node {
        position: absolute;
        display: block;
        transform-style: preserve-3d;
      }

      .nano-depth-orbit {
        width: 170px;
        height: 170px;
        border: 1px solid rgba(232,93,4,0.28);
        border-radius: 50%;
        animation: nanoOrbitGlow 8s ease-in-out infinite;
      }

      .nano-depth-orbit::after {
        position: absolute;
        inset: 18px;
        border: 1px solid rgba(13,13,13,0.13);
        border-radius: 50%;
        content: "";
      }

      .nano-depth-orbit-one { top: 12%; left: 7%; transform: rotate(24deg); }
      .nano-depth-orbit-two { right: 4%; bottom: 9%; width: 125px; height: 125px; animation-delay: -3s; transform: rotate(-30deg); }

      .nano-depth-cube {
        width: 54px;
        height: 54px;
        border: 1px solid rgba(232,93,4,0.44);
        background: linear-gradient(135deg, rgba(255,255,255,0.56), rgba(232,93,4,0.09));
        box-shadow: 14px 18px 30px rgba(13,13,13,0.09), inset 0 0 0 1px rgba(255,255,255,0.36);
        animation: nanoFloat 7s ease-in-out infinite;
      }

      .nano-depth-cube-one { top: 24%; right: 14%; transform: rotate(28deg) skew(-7deg); }
      .nano-depth-cube-two { bottom: 20%; left: 15%; width: 34px; height: 34px; animation-delay: -2.5s; animation-name: nanoFloatSlow; }

      .nano-depth-node {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #E85D04;
        box-shadow: 0 0 0 7px rgba(232,93,4,0.1), 0 8px 18px rgba(232,93,4,0.24);
        animation: nanoFloatSlow 6s ease-in-out infinite;
      }

      .nano-depth-node-one { top: 22%; left: 23%; }
      .nano-depth-node-two { right: 23%; bottom: 28%; animation-delay: -1.5s; }

      .nano-hero-content { transform: translateZ(26px); transform-style: preserve-3d; }

      .nano-hero-content,
      .nano-stats,
      .nano-section-head,
      .nano-footer {
        animation: nanoFadeUp 680ms ease both;
      }

      .nano-scroll-reveal {
        opacity: 0;
        animation: none;
        transform: translateY(24px) scale(0.987);
        transition: opacity 700ms ease, transform 700ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .nano-scroll-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      .nano-pill,
      .nano-title,
      .nano-copy,
      .nano-cta {
        animation: nanoFadeUp 720ms ease both;
      }

      .nano-title { animation-delay: 90ms; }
      .nano-copy { animation-delay: 170ms; }
      .nano-cta { animation-delay: 250ms; }

      .nano-cta,
      .nano-nav-link,
      .nano-filter {
        transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease, background 200ms ease;
      }

      .nano-cta:hover,
      .nano-nav-link:hover,
      .nano-filter:hover {
        transform: translateY(-2px);
      }

      .nano-cta:hover {
        box-shadow: 0 16px 34px rgba(232, 93, 4, 0.28), 0 5px 0 rgba(13,13,13,0.08);
      }

      .nano-stat {
        transition: background 240ms ease, transform 240ms ease;
      }

      .nano-stat:hover {
        background: rgba(255, 255, 255, 0.46);
        transform: translateY(-2px);
      }

      .nano-product-card {
        position: relative;
        animation: nanoFadeUp 580ms ease both;
        perspective: 900px;
        transform-style: preserve-3d;
        will-change: transform;
      }

      .nano-product-card::after {
        position: absolute;
        inset: 10px;
        z-index: -1;
        border-radius: 14px;
        background: rgba(232,93,4,0.2);
        content: "";
        filter: blur(18px);
        opacity: 0;
        transform: translateY(10px) translateZ(-14px);
        transition: opacity 280ms ease, transform 280ms ease;
      }

      .nano-product-card:hover::after {
        opacity: 0.42;
        transform: translateY(14px) translateZ(-14px);
      }

      .nano-product-media {
        transform: translateZ(10px);
        transform-style: preserve-3d;
        box-shadow: inset 0 -22px 30px rgba(13,13,13,0.08);
      }

      .nano-product-media > img,
      .nano-product-media > svg {
        transition: transform 520ms ease, filter 300ms ease;
      }

      .nano-product-card:hover .nano-product-media > svg {
        transform: scale(1.045);
      }

      .nano-cart-panel {
        animation: nanoFadeUp 260ms ease both;
      }

      .nano-product-modal-backdrop {
        perspective: 1200px;
      }

      .nano-product-modal {
        animation: nanoModalIn 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
        transform-origin: 50% 20%;
        box-shadow: 0 30px 80px rgba(13,13,13,0.35), 0 8px 0 rgba(232,93,4,0.08);
      }

      .nano-cta:active,
      .nano-nav-link:active,
      .nano-filter:active {
        transform: translateY(1px) scale(0.985);
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
        }

        .nano-scroll-reveal,
        .nano-scroll-visible {
          opacity: 1 !important;
          transform: none !important;
        }
      }

      @media (hover: none), (pointer: coarse) {
        .nano-depth-orbit,
        .nano-depth-cube,
        .nano-depth-node { animation-duration: 12s; }
        .nano-product-card:hover::after { opacity: 0; }
      }
    `}</style>
  );
}

function CartIcon({ size = 20, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="21" r="1"/>
      <circle cx="19" cy="21" r="1"/>
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h8.9a2 2 0 0 0 1.96-1.6l1.24-6.4H5.12"/>
    </svg>
  );
}

function CartDrawer({ open, cartItems, cartCount, total, onClose, onQty, onRemove, onClear, onSendEnquiry }) {
  const isMobile = useWindowWidth() < 640;
  return (
    <>
      {open && (
        <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(13,13,13,0.34)",backdropFilter:"blur(5px)",display:"flex",justifyContent:isMobile?"center":"flex-end",alignItems:isMobile?"flex-end":"stretch"}}>
          <aside className="nano-cart-panel" onClick={e=>e.stopPropagation()} style={{width:isMobile?"100%":390,maxWidth:"100%",background:C.white,borderLeft:isMobile?"none":`1px solid ${C.gray}`,borderRadius:isMobile?"18px 18px 0 0":0,boxShadow:"0 24px 80px rgba(13,13,13,0.28)",display:"flex",flexDirection:"column",maxHeight:isMobile?"86vh":"100vh"}}>
            <div style={{padding:"18px 20px",borderBottom:`1px solid ${C.gray}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div>
                <h2 style={{margin:0,fontFamily:"Inter, sans-serif",fontSize:21,color:C.black,letterSpacing:0}}>Your Cart</h2>
                <p style={{margin:"4px 0 0",fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.midGray}}>{cartCount} item{cartCount!==1?"s":""} selected</p>
              </div>
              <button type="button" onClick={onClose} style={{width:34,height:34,borderRadius:999,border:`1px solid ${C.gray}`,background:"#fff",color:C.darkGray,cursor:"pointer",fontSize:20,lineHeight:1}}>x</button>
            </div>

            <div style={{padding:20,overflowY:"auto",flex:1}}>
              {cartItems.length === 0 ? (
                <div style={{padding:"42px 12px",textAlign:"center",fontFamily:"DM Sans, sans-serif",color:C.midGray}}>
                  <CartIcon size={34} color={C.midGray}/>
                  <p style={{margin:"12px 0 0",fontSize:14}}>Add products from the collection to start a chat enquiry.</p>
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {cartItems.map(({ product, qty }) => {
                    const availableStock = getAvailableStock(product);
                    const atStockLimit = availableStock === 0 || qty >= availableStock;
                    return (
                    <div key={product.id} style={{border:`1px solid ${C.gray}`,borderRadius:12,background:"rgba(248,247,244,0.82)",padding:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
                        <div style={{minWidth:0}}>
                          <h3 style={{margin:"0 0 4px",fontFamily:"Inter, sans-serif",fontSize:15,color:C.black,letterSpacing:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{product.name}</h3>
                          <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.midGray}}>{product.category} · Rs. {product.price.toLocaleString("en-IN")}</p>
                        </div>
            <button type="button" onClick={()=>onRemove(product.id)} style={{background:"none",border:"none",color:C.orange,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:12}}>Remove</button>
                      </div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:12}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <button type="button" onClick={()=>onQty(product.id, -1)} style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.gray}`,background:"#fff",cursor:"pointer",fontSize:18,lineHeight:1}}>-</button>
                          <span style={{minWidth:24,textAlign:"center",fontFamily:"Inter, sans-serif",fontWeight:700,color:C.black}}>{qty}</span>
                          <button type="button" onClick={()=>onQty(product.id, 1)} disabled={atStockLimit} aria-label={atStockLimit ? `Only ${availableStock} available` : `Increase ${product.name} quantity`} title={atStockLimit ? `Only ${availableStock} available` : "Increase quantity"} style={{width:30,height:30,borderRadius:8,border:`1px solid ${C.gray}`,background:"#fff",color:atStockLimit?C.midGray:C.black,cursor:atStockLimit?"not-allowed":"pointer",fontSize:18,lineHeight:1,opacity:atStockLimit?0.55:1}}>+</button>
                        </div>
                        <strong style={{fontFamily:"Inter, sans-serif",fontSize:15,color:C.orange}}>Rs. {(product.price * qty).toLocaleString("en-IN")}</strong>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{padding:20,borderTop:`1px solid ${C.gray}`,background:"rgba(248,247,244,0.82)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <span style={{fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.darkGray}}>Total</span>
                <strong style={{fontFamily:"Inter, sans-serif",fontSize:22,color:C.black}}>Rs. {total.toLocaleString("en-IN")}</strong>
              </div>
              <button
                type="button"
                onClick={onSendEnquiry}
                style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:cartItems.length?C.orange:C.gray,color:cartItems.length?C.white:C.midGray,textDecoration:"none",padding:"13px 18px",borderRadius:10,fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:15,cursor:cartItems.length?"pointer":"not-allowed"}}
              >
                Message about Cart
              </button>
              {cartItems.length > 0 && (
                <button type="button" onClick={onClear} style={{width:"100%",marginTop:10,background:"none",border:`1px solid ${C.gray}`,color:C.darkGray,padding:"10px 14px",borderRadius:10,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:13}}>
                  Clear cart
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function ReviewStars({ value, onChange, size = 22 }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          type="button"
          onClick={onChange ? ()=>onChange(n) : undefined}
          aria-label={`${n} star${n!==1?"s":""}`}
          style={{
            border:"none",background:"none",padding:2,cursor:onChange?"pointer":"default",
            color:n <= value ? C.orange : C.gray,fontSize:size,lineHeight:1,
            textShadow:n <= value ? "0 4px 10px rgba(232,93,4,0.18)" : "none",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/* ── PRODUCT SVG THUMBNAILS ── */
function ProductSVG({ product }) {
  const { id, bgA, bgB, accent } = product;
  const shapes = {
    p1: <g>
      <polygon points="125,28 155,70 145,58 168,98 148,86 162,120 140,110 144,146 120,130 120,160 100,144 104,110 80,120 94,86 74,98 97,58 87,70 117,28 122,52" fill={accent} opacity="0.88"/>
      <polygon points="122,52 137,28 152,58 137,48" fill="#fff" opacity="0.12"/>
      <circle cx="122" cy="128" r="16" fill={accent} opacity="0.28"/>
    </g>,
    p2: <g>
      <polygon points="125,38 152,65 152,120 125,148 98,120 98,65" fill="none" stroke={accent} strokeWidth="1.6"/>
      <polygon points="125,58 144,76 144,112 125,130 106,112 106,76" fill={accent} opacity="0.15"/>
      <polygon points="125,74 140,88 140,108 125,122 110,108 110,88" fill={accent} opacity="0.32"/>
      <line x1="125" y1="38" x2="125" y2="148" stroke={accent} strokeWidth="0.5" opacity="0.4"/>
      <line x1="98"  y1="65" x2="152" y2="120" stroke={accent} strokeWidth="0.5" opacity="0.4"/>
      <line x1="152" y1="65" x2="98"  y2="120" stroke={accent} strokeWidth="0.5" opacity="0.4"/>
    </g>,
    p3: <g>
      {[0,30,60,90,120,150,180,210,240,270,300,330].map((a,i)=>{
        const r=Math.PI*a/180, x=125+52*Math.cos(r), y=95+52*Math.sin(r);
        return <line key={i} x1="125" y1="95" x2={x} y2={y} stroke={accent} strokeWidth="0.9" opacity="0.65"/>
      })}
      {[0,1,2,3,4,5].map(i=>{
        const r=i*Math.PI/3, x=125+52*Math.cos(r), y=95+52*Math.sin(r);
        const nx=125+52*Math.cos(r+Math.PI/3), ny=95+52*Math.sin(r+Math.PI/3);
        return <line key={i} x1={x} y1={y} x2={nx} y2={ny} stroke={accent} strokeWidth="1.4" opacity="0.9"/>
      })}
      <circle cx="125" cy="95" r="22" fill="none" stroke={accent} strokeWidth="1"/>
      <circle cx="125" cy="95" r="37" fill="none" stroke={accent} strokeWidth="0.6" opacity="0.5"/>
      <circle cx="125" cy="95" r="52" fill="none" stroke={accent} strokeWidth="0.4" opacity="0.28"/>
      <circle cx="125" cy="95" r="9" fill={accent} opacity="0.75"/>
    </g>,
    p4: <g>
      <ellipse cx="125" cy="118" rx="44" ry="48" fill={accent} opacity="0.18"/>
      <ellipse cx="125" cy="112" rx="29" ry="34" fill={accent} opacity="0.4"/>
      <circle  cx="125" cy="86"  r="27" fill={accent} opacity="0.62"/>
      <ellipse cx="100" cy="73" rx="14" ry="10" fill={accent} opacity="0.5" transform="rotate(-20 100 73)"/>
      <ellipse cx="150" cy="73" rx="14" ry="10" fill={accent} opacity="0.5" transform="rotate(20 150 73)"/>
      <circle cx="118" cy="82" r="4" fill="#fff" opacity="0.55"/>
      <circle cx="132" cy="82" r="4" fill="#fff" opacity="0.55"/>
      <ellipse cx="125" cy="94" rx="8" ry="5" fill="#fff" opacity="0.28"/>
    </g>,
    p5: <g>
      {Array.from({length:10},(_,i)=>{
        const t=i/9, cx=75+100*t, cy=95+Math.sin(t*Math.PI*3)*36;
        const nt=(i+1)/9, ncx=75+100*nt, ncy=95+Math.sin(nt*Math.PI*3)*36;
        return <line key={i} x1={cx} y1={cy} x2={ncx} y2={ncy} stroke={accent} strokeWidth="7" strokeLinecap="round" opacity="0.4"/>
      })}
      {Array.from({length:11},(_,i)=>{
        const t=i/10, cx=75+100*t, cy=95+Math.sin(t*Math.PI*3)*36;
        return <circle key={i} cx={cx} cy={cy} r={9-i*0.25} fill={accent} opacity={0.9-i*0.04}/>
      })}
    </g>,
    p6: <g>
      {[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]].map(([r,c],i)=>(
        <rect key={i} x={82+c*31} y={50+r*31} width="27" height="27" rx="4" fill={i%2===0?accent:"#fff"} opacity={i%2===0?0.82:0.1}/>
      ))}
      <rect x="82" y="144" width="89" height="8" rx="4" fill={accent} opacity="0.5"/>
      <circle cx="126" cy="138" r="6" fill={accent} opacity="0.9"/>
    </g>,
  };
  return (
    <svg viewBox="0 0 250 190" style={{width:"100%",height:"100%"}}>
      <defs>
        <radialGradient id={`rg${id}`} cx="50%" cy="50%" r="70%">
          <stop offset="0%"   stopColor={bgB}/>
          <stop offset="100%" stopColor={bgA}/>
        </radialGradient>
      </defs>
      <rect width="250" height="190" fill={`url(#rg${id})`}/>
      {shapes[id] ?? shapes.p6}
    </svg>
  );
}

/* ── PRODUCT CARD ── */
function ProductCard({ product, imgCache, variants = [], onClick, onAddToCart, cartQty = 0, index = 0 }) {
  const [hov, setHov] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [cardVariantId, setCardVariantId] = useState("");
  const activeVariants = variants.filter((variant) => variant.active);
  const selectedVariant = activeVariants.find((variant) => variant.id === cardVariantId);
  const img = selectedVariant?.imageUrl || imgCache[product.id] || null;
  const stockQuantity = normalizeStockQuantity(product.stockQuantity, product.outOfStock ? 0 : 10);
  const oos = product.outOfStock || stockQuantity === 0;

  useEffect(() => {
    const availableVariantIds = variants.filter((variant) => variant.active).map((variant) => variant.id);
    setCardVariantId((current) => availableVariantIds.includes(current) ? current : "");
  }, [product.id, variants]);

  const handlePointerMove = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: x * 3.2, y: y * -3.2 });
  };
  const resetTilt = () => {
    setHov(false);
    setTilt({ x: 0, y: 0 });
  };
  return (
    <div className="nano-product-card" onClick={()=>onClick(product, cardVariantId || null)} onMouseEnter={()=>setHov(true)} onMouseMove={handlePointerMove} onMouseLeave={resetTilt}
      style={{ cursor:"pointer", background:C.white, borderRadius:12, overflow:"hidden",
        border:`1px solid ${hov?C.orange:C.gray}`,
        transform:hov?`perspective(900px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) translateY(-6px) translateZ(4px)`:`perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0) translateZ(0)`,
        boxShadow:hov?"0 18px 42px rgba(232,93,4,0.16), 0 8px 24px rgba(13,13,13,0.08)":"0 2px 10px rgba(13,13,13,0.07)",
        animationDelay:`${Math.min(index, 8) * 55}ms`,
        transition:"all 0.28s cubic-bezier(0.34,1.56,0.64,1)" }}>
      <div className="nano-product-media" style={{height:img?"auto":200,background:product.bgA,overflow:"hidden",position:"relative"}}>
        {img ? <img src={img} alt={product.name} style={{display:"block",width:"100%",height:"auto",filter:oos?"grayscale(60%) brightness(0.7)":"none",transition:"filter 0.3s, transform 0.52s ease"}}/> : <ProductSVG product={product}/>} 
        <div style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:11,padding:"3px 10px",borderRadius:20,fontFamily:"DM Sans, sans-serif",letterSpacing:"0.5px"}}>{product.category}</div>
        <button
          type="button"
          onClick={e=>{ e.stopPropagation(); if(!oos) onAddToCart(product); }}
          disabled={oos}
          style={{
            position:"absolute",right:12,bottom:12,display:"flex",alignItems:"center",gap:7,
            border:"none",borderRadius:999,padding:"8px 12px",background:oos?"rgba(255,255,255,0.74)":C.black,
            color:oos?C.midGray:"#fff",cursor:oos?"not-allowed":"pointer",fontFamily:"Inter, sans-serif",
            fontSize:12,fontWeight:700,boxShadow:"0 10px 24px rgba(13,13,13,0.22)",zIndex:3,
          }}
          aria-label={oos ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
        >
          <CartIcon size={15} color={oos?C.midGray:"#fff"}/>
          {cartQty > 0 ? `Added (${cartQty})` : "Add"}
        </button>
        {oos && (
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.45)"}}>
            <span style={{background:C.orange,color:C.white,fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:13,padding:"7px 18px",borderRadius:6,letterSpacing:"1px",textTransform:"uppercase",boxShadow:"0 2px 12px rgba(13,13,13,0.3)",transform:"rotate(-8deg)",display:"block"}}>Out of Stock</span>
          </div>
        )}
      </div>
      <div style={{padding:"16px 18px 20px"}}>
        {activeVariants.length > 0 && (
          <div onClick={(event) => event.stopPropagation()} style={{marginBottom:12}}>
            <span style={{display:"block",marginBottom:7,fontFamily:"DM Sans, sans-serif",fontSize:11,color:C.midGray,fontWeight:600}}>Color</span>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {activeVariants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setCardVariantId(variant.id)}
                  aria-label={`Select ${variant.color}`}
                  title={variant.color}
                  style={{display:"inline-flex",alignItems:"center",gap:6,border:`1px solid ${variant.id === selectedVariant?.id ? C.orange : C.gray}`,borderRadius:999,padding:"4px 9px 4px 5px",background:variant.id === selectedVariant?.id ? "rgba(232,93,4,0.07)" : C.white,color:C.darkGray,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:11,fontWeight:600}}
                >
                  <span aria-hidden="true" style={{width:13,height:13,borderRadius:"50%",background:variantSwatchColor(variant.color),border:`1px solid ${variant.color.trim().toLowerCase() === "white" ? C.gray : "transparent"}`,boxSizing:"border-box"}} />
                  {variant.color}
                </button>
              ))}
            </div>
          </div>
        )}
        <h3 style={{margin:"0 0 5px",fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:17,color:oos?C.midGray:C.black,letterSpacing:0}}>{product.name}</h3>
        <p style={{margin:"0 0 14px",fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.midGray,lineHeight:1.5}}>{product.description}</p>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:20,color:oos?C.midGray:C.orange}}>₹{product.price.toLocaleString("en-IN")}</span>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
            <span style={{fontFamily:"DM Sans, sans-serif",fontSize:12,color:oos?C.orange:C.darkGray,fontWeight:600}}>{oos ? "Out of Stock" : `${stockQuantity} left`}</span>
            {!oos && <span style={{fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.orange,border:`1px solid ${C.orange}`,padding:"4px 12px",borderRadius:20,opacity:hov?1:0.65,transition:"opacity 0.2s"}}>View →</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── PRODUCT MODAL ── */
function ProductModal({ product, imgCache, variants = [], initialVariantId = null, onClose, onAddToCart, onMessageAboutProduct, cartQty = 0 }) {
  const isMobile = useWindowWidth() < 640;
  const activeVariants = variants.filter((variant) => variant.active);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantId || "");
  const selectedVariant = activeVariants.find((variant) => variant.id === selectedVariantId);
  const img = selectedVariant?.imageUrl || imgCache[product.id] || null;
  const stockQuantity = normalizeStockQuantity(product.stockQuantity, product.outOfStock ? 0 : 10);
  const oos = product.outOfStock || stockQuantity === 0;

  useEffect(() => {
    const availableVariantIds = variants.filter((variant) => variant.active).map((variant) => variant.id);
    setSelectedVariantId((current) => availableVariantIds.includes(current) ? current : (initialVariantId && availableVariantIds.includes(initialVariantId) ? initialVariantId : ""));
  }, [product.id, variants, initialVariantId]);

  return (
    <div className="nano-product-modal-backdrop" onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(13,13,13,0.78)",backdropFilter:"blur(4px)",display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",zIndex:1000,padding:isMobile?0:20}}>
      <div className="nano-product-modal" onClick={e=>e.stopPropagation()} style={{background:C.white,borderRadius:isMobile?"16px 16px 0 0":"16px",overflow:"hidden",maxWidth:isMobile?700:820,width:"100%",maxHeight:isMobile?"92dvh":"90vh",overflowY:isMobile?"auto":"hidden",display:"flex",flexDirection:isMobile?"column":"row",boxShadow:"0 30px 80px rgba(0,0,0,0.35)"}}>
        <div style={{height:isMobile?240:360,width:isMobile?"100%":"42%",background:C.offWhite,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
          {img ? <img src={img} alt={product.name} style={{display:"block",maxWidth:"100%",maxHeight:"100%",width:"auto",height:"auto",objectFit:"contain",filter:oos?"grayscale(60%) brightness(0.7)":"none"}}/> : <ProductSVG product={product}/>} 
          <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"rgba(0,0,0,0.5)",border:"none",color:"#fff",width:36,height:36,borderRadius:"50%",cursor:"pointer",fontSize:22,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          <div style={{position:"absolute",top:14,left:14,background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:12,padding:"4px 12px",borderRadius:20,fontFamily:"DM Sans, sans-serif",letterSpacing:"0.5px"}}>{product.category}</div>
          {oos && (
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.4)"}}>
              <span style={{background:C.orange,color:C.white,fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:16,padding:"10px 28px",borderRadius:8,letterSpacing:"1.5px",textTransform:"uppercase",boxShadow:"0 4px 20px rgba(13,13,13,0.4)",transform:"rotate(-8deg)",display:"block"}}>Out of Stock</span>
            </div>
          )}
        </div>
        <div style={{padding:isMobile?"20px 20px 32px":"28px 32px 32px",flex:"1 1 auto",minWidth:0,overflowY:isMobile?"visible":"auto"}}>
          {activeVariants.length > 0 && (
            <div style={{marginBottom:18}}>
              <span style={{display:"block",marginBottom:8,fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.midGray,fontWeight:600}}>Choose a color</span>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {activeVariants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariantId(variant.id)}
                    aria-label={`Select ${variant.color}`}
                    aria-pressed={variant.id === selectedVariant?.id}
                    style={{display:"inline-flex",alignItems:"center",gap:7,border:`1px solid ${variant.id === selectedVariant?.id ? C.orange : C.gray}`,borderRadius:999,padding:"6px 11px 6px 7px",background:variant.id === selectedVariant?.id ? "rgba(232,93,4,0.08)" : C.white,color:C.darkGray,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:12,fontWeight:600}}
                  >
                    <span aria-hidden="true" style={{width:15,height:15,borderRadius:"50%",background:variantSwatchColor(variant.color),border:`1px solid ${variant.color.trim().toLowerCase() === "white" ? C.gray : "transparent"}`,boxSizing:"border-box"}} />
                    {variant.color}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:14,flexWrap:"wrap"}}>
            <h2 style={{margin:0,fontFamily:"Inter, sans-serif",fontWeight:800,fontSize:isMobile?22:26,color:C.black,letterSpacing:0}}>{product.name}</h2>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
              <span style={{fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:isMobile?24:28,color:oos?C.midGray:C.orange,whiteSpace:"nowrap"}}>₹{product.price.toLocaleString("en-IN")}</span>
              <span style={{fontFamily:"DM Sans, sans-serif",fontSize:12,fontWeight:600,color:oos?C.orange:C.darkGray}}>{oos ? "Out of Stock" : `${stockQuantity} left`}</span>
            </div>
          </div>
          {oos && (
            <div style={{background:"rgba(232,93,4,0.08)",border:`1px solid ${C.orange}`,borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>🚫</span>
              <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.orange,fontWeight:500}}>This product is currently out of stock. Contact us to get notified when it's back.</p>
            </div>
          )}
          <p style={{margin:"0 0 18px",fontFamily:"DM Sans, sans-serif",fontSize:isMobile?14:15,color:C.darkGray,lineHeight:1.7}}>{product.description}</p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button
              type="button"
              onClick={()=>{ if(!oos) onAddToCart(product); }}
              disabled={oos}
              style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:oos?C.gray:C.black,color:oos?C.midGray:"#fff",border:"none",padding:"14px 28px",borderRadius:10,fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:isMobile?15:16,letterSpacing:"0.3px",cursor:oos?"not-allowed":"pointer"}}
            >
              <CartIcon size={20} color={oos?C.midGray:"#fff"}/>
              {cartQty > 0 ? `Add More (${cartQty} in Cart)` : "Add to Cart"}
            </button>
            <button
              type="button"
              onClick={()=>{ if(!oos) onMessageAboutProduct(product); }}
              disabled={oos}
              style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:oos?C.gray:C.orange,color:oos?C.midGray:"#fff",border:"none",padding:"14px 28px",borderRadius:10,fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:isMobile?15:16,letterSpacing:"0.3px",cursor:oos?"not-allowed":"pointer"}}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 8.7 3.9a8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
              </svg>
              Message about this product
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FigurineConfigurator({ open, onClose }) {
  const isMobile = useWindowWidth() < 640;
  const fileInputRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [size, setSize] = useState("");
  const [sizeOptions, setSizeOptions] = useState([]);
  const [sizeLoading, setSizeLoading] = useState(false);
  const [sizeError, setSizeError] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [customerRequests, setCustomerRequests] = useState([]);
  const [customerRequestLoading, setCustomerRequestLoading] = useState(false);
  const [customerRequestError, setCustomerRequestError] = useState("");
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    setPhoto(null);
    setSize("");
    setRequestSubmitted(false);
    setSubmitting(false);
    submittingRef.current = false;
    setFormError("");
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    const loadFigurineSizes = async () => {
      setSizeLoading(true);
      setSizeError("");

      const { data, error } = await supabase
        .from("figurine_sizes")
        .select("id, name, price")
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setSizeOptions([]);
        setSizeError("Figurine size options are unavailable right now.");
      } else {
        const options = (data || []).map((option) => ({
          ...option,
          price: Number(option.price),
        }));
        setSizeOptions(options);
        setSize((current) => options.some((option) => option.id === current) ? current : (options[0]?.id || ""));
      }

      setSizeLoading(false);
    };

    void loadFigurineSizes();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let channel = null;

    const addPhotoUrl = async (request) => {
      if (!request?.photo_path) return { ...request, photoUrl: "" };
      const { data } = await supabase.storage
        .from(FIGURINE_REQUEST_BUCKET)
        .createSignedUrl(request.photo_path, 60 * 60);
      return { ...request, photoUrl: data?.signedUrl || "" };
    };

    const loadCustomerRequests = async () => {
      setCustomerRequestLoading(true);
      setCustomerRequestError("");

      try {
        const user = await ensureAnonymousCustomer();
        const { data, error } = await supabase
          .from("figurine_requests")
          .select("id, customer_user_id, photo_path, size_id, size_name, price, status, created_at, updated_at")
          .eq("customer_user_id", user.id)
          .order("created_at", { ascending: false });

        if (cancelled) return;
        if (error) throw error;

        const requests = await Promise.all((data || []).map(addPhotoUrl));
        if (cancelled) return;
        setCustomerRequests(requests);

        channel = supabase
          .channel(`customer-figurine-requests-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "figurine_requests",
              filter: `customer_user_id=eq.${user.id}`,
            },
            async (payload) => {
              if (cancelled) return;
              if (payload.eventType === "DELETE") {
                setCustomerRequests((current) => current.filter((request) => request.id !== payload.old?.id));
                return;
              }

              const request = await addPhotoUrl(payload.new);
              if (cancelled) return;
              setCustomerRequests((current) => {
                const withoutRequest = current.filter((item) => item.id !== request.id);
                return [request, ...withoutRequest].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
              });
            },
          )
          .subscribe((status) => {
            if (!cancelled && status === "CHANNEL_ERROR") {
              setCustomerRequestError("Live request updates are unavailable right now. Refresh to check status.");
            }
          });
      } catch (error) {
        if (!cancelled) {
          setCustomerRequests([]);
          setCustomerRequestError(error?.message || "Unable to load your figurine requests.");
        }
      } finally {
        if (!cancelled) setCustomerRequestLoading(false);
      }
    };

    void loadCustomerRequests();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [open]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(photo);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const selectedSize = sizeOptions.find((option) => option.id === size);
  const selectedPrice = selectedSize?.price || 0;

  const handlePhotoChange = (event) => {
    const selectedPhoto = event.target.files?.[0];
    if (!selectedPhoto) return;
    const validation = validateFigurinePhoto(selectedPhoto);
    if (!validation.valid) {
      setFormError(validation.error);
      return;
    }
    setPhoto(selectedPhoto);
    setRequestSubmitted(false);
    setFormError("");
  };

  const submitRequest = async () => {
    if (submittingRef.current || submitting || requestSubmitted) return;
    if (!photo) {
      setFormError("Upload a photo before submitting your figurine request.");
      return;
    }
    if (!selectedSize) {
      setFormError("No active figurine size is available yet.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setFormError("");

    try {
      const user = await ensureAnonymousCustomer();
      const photoPath = await uploadFigurineRequestPhoto({ userId: user.id, file: photo });
      const { data: createdRequest, error: requestError } = await supabase
        .from("figurine_requests")
        .insert({
          customer_user_id: user.id,
          photo_path: photoPath,
          size_id: selectedSize.id,
          size_name: selectedSize.name,
          price: selectedSize.price,
          status: "New",
        })
        .select("id, customer_user_id, photo_path, size_id, size_name, price, status, created_at, updated_at")
        .single();

      if (requestError) throw requestError;
      const { data: createdPhotoUrl } = await supabase.storage
        .from(FIGURINE_REQUEST_BUCKET)
        .createSignedUrl(photoPath, 60 * 60);
      setCustomerRequests((current) => [
        { ...createdRequest, photoUrl: createdPhotoUrl?.signedUrl || "" },
        ...current.filter((request) => request.id !== createdRequest.id),
      ]);
      setRequestSubmitted(true);
    } catch (requestError) {
      setFormError(requestError?.message || "Your figurine request could not be sent. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const selectStyle = {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${C.gray}`,
    borderRadius: 9,
    padding: "10px 12px",
    background: C.white,
    color: C.black,
    fontFamily: "DM Sans, sans-serif",
    fontSize: 13,
    outline: "none",
  };
  const fieldLabelStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    color: C.darkGray,
    fontFamily: "DM Sans, sans-serif",
    fontSize: 12,
    fontWeight: 600,
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1250,
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 6 : 20,
        background: "rgba(13,13,13,0.58)",
        backdropFilter: "blur(5px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="figurine-configurator-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "min(920px, 100%)",
          maxHeight: isMobile ? "calc(100dvh - 12px)" : "min(760px, calc(100vh - 40px))",
          overflow: "hidden",
          border: `1px solid ${C.gray}`,
          borderRadius: isMobile ? "18px 18px 0 0" : 18,
          background: C.white,
          boxShadow: "0 30px 90px rgba(13,13,13,0.3)",
        }}
      >
        <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: isMobile ? "16px 16px 14px" : "22px 26px 18px", borderBottom: `1px solid ${C.gray}`, background: `linear-gradient(135deg, ${C.offWhite}, ${C.white})`}}>
          <div style={{minWidth: 0}}>
            <span style={{display: "block", marginBottom: 5, color: C.orange, fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase"}}>Personalized 3D concept</span>
            <h2 id="figurine-configurator-title" style={{margin: 0, color: C.black, fontFamily: "Inter, sans-serif", fontSize: isMobile ? 21 : 25, fontWeight: 800}}>Create Your Figurine</h2>
            <p style={{margin: "6px 0 0", color: C.midGray, fontFamily: "DM Sans, sans-serif", fontSize: 13, lineHeight: 1.5}}>Upload a photo and choose a size for a future custom-print request.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close figurine customization" style={{flex: "0 0 auto", width: 34, height: 34, border: `1px solid ${C.gray}`, borderRadius: 999, background: C.white, color: C.darkGray, cursor: "pointer", fontSize: 21, lineHeight: 1}}>×</button>
        </div>

        <div style={{display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(250px, 0.85fr) minmax(0, 1.15fr)", gap: isMobile ? 18 : 24, overflowY: "auto", padding: isMobile ? "16px 16px 20px" : "24px 26px 26px"}}>
          <div>
            <label htmlFor="figurine-photo" style={{...fieldLabelStyle, gap: 8}}>Your photo</label>
            <input ref={fileInputRef} id="figurine-photo" type="file" accept="image/*" onChange={handlePhotoChange} style={{display: "none"}} />
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", minHeight: isMobile ? 190 : 260, marginTop: 8, overflow: "hidden", border: `1px dashed ${C.orange}`, borderRadius: 14, padding: 12, background: "rgba(232,93,4,0.05)", color: C.darkGray, cursor: "pointer"}}>
              {photoPreview ? (
                <img src={photoPreview} alt="Selected figurine reference" style={{width: "100%", height: isMobile ? 166 : 230, objectFit: "cover", borderRadius: 10}} />
              ) : (
                <>
                  <span style={{display: "grid", placeItems: "center", width: 48, height: 48, marginBottom: 10, borderRadius: 14, background: C.orange, color: C.white, fontFamily: "Inter, sans-serif", fontSize: 24}}>+</span>
                  <strong style={{fontFamily: "Inter, sans-serif", fontSize: 14, color: C.black}}>Upload a photo</strong>
                  <span style={{marginTop: 5, fontFamily: "DM Sans, sans-serif", fontSize: 12, color: C.midGray}}>JPG, PNG or WEBP</span>
                </>
              )}
            </button>
            {photo && <p style={{margin: "8px 2px 0", overflow: "hidden", color: C.midGray, fontFamily: "DM Sans, sans-serif", fontSize: 11, textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{photo.name}</p>}
            <div style={{marginTop: 16, padding: "12px 14px", borderRadius: 10, background: C.offWhite, color: C.midGray, fontFamily: "DM Sans, sans-serif", fontSize: 12, lineHeight: 1.55}}>
              Your photo is stored securely for our team to review. No 3D file is generated automatically.
            </div>
          </div>

          <div style={{display: "flex", flexDirection: "column", gap: 14}}>
            <label style={fieldLabelStyle}>
              Size
              <select disabled={sizeLoading || !sizeOptions.length || submitting} value={size} onChange={(event) => { setSize(event.target.value); setRequestSubmitted(false); }} style={{...selectStyle, opacity: sizeLoading || !sizeOptions.length ? 0.7 : 1}}>
                {sizeLoading ? <option value="">Loading sizes...</option> : sizeOptions.length ? sizeOptions.map((option) => <option key={option.id} value={option.id}>{option.name} · ₹{option.price.toLocaleString("en-IN")}</option>) : <option value="">No active sizes available</option>}
              </select>
              {sizeError && <span role="alert" style={{color: C.orange, fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 500}}>{sizeError}</span>}
            </label>
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2, padding: "14px 16px", border: `1px solid rgba(232,93,4,0.28)`, borderRadius: 11, background: "rgba(232,93,4,0.07)"}}>
              <div>
                <span style={{display: "block", color: C.midGray, fontFamily: "DM Sans, sans-serif", fontSize: 11}}>Selected price</span>
                <strong style={{display: "block", marginTop: 3, color: C.black, fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: 800}}>₹{selectedPrice.toLocaleString("en-IN")}</strong>
              </div>
              <span style={{color: C.orange, fontFamily: "DM Sans, sans-serif", fontSize: 11, textAlign: "right"}}>Final quote<br />after review</span>
            </div>

            {formError && <p role="alert" style={{margin: 0, color: C.orange, fontFamily: "DM Sans, sans-serif", fontSize: 12}}>{formError}</p>}
            <button type="button" onClick={submitRequest} disabled={submitting || requestSubmitted} style={{width: "100%", border: 0, borderRadius: 10, padding: "13px 18px", background: requestSubmitted ? C.darkGray : C.orange, color: C.white, cursor: submitting || requestSubmitted ? "not-allowed" : "pointer", fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, boxShadow: "0 12px 26px rgba(232,93,4,0.18)", opacity: submitting ? 0.7 : 1}}>{submitting ? "Sending Request..." : requestSubmitted ? "Request Submitted" : "Submit Figurine Request"}</button>

            {requestSubmitted && (
              <div role="status" style={{padding: "13px 14px", border: `1px solid ${C.gray}`, borderRadius: 10, background: C.offWhite, color: C.darkGray, fontFamily: "DM Sans, sans-serif", fontSize: 12, lineHeight: 1.55}}>
                <strong style={{display: "block", marginBottom: 4, color: C.black, fontFamily: "Inter, sans-serif", fontSize: 13}}>Request sent</strong>
                Your figurine request has been sent to us.
              </div>
            )}
          </div>

          <div style={{gridColumn: "1 / -1", paddingTop: 4, borderTop: `1px solid ${C.gray}`}}>
            <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "16px 0 10px"}}>
              <h3 style={{margin: 0, color: C.black, fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 750}}>Your Figurine Requests</h3>
              <span style={{color: C.midGray, fontFamily: "DM Sans, sans-serif", fontSize: 11}}>Private to you</span>
            </div>
            {customerRequestLoading && <p style={{margin: 0, color: C.midGray, fontFamily: "DM Sans, sans-serif", fontSize: 12}}>Loading your requests...</p>}
            {customerRequestError && <p role="alert" style={{margin: "0 0 10px", color: C.orange, fontFamily: "DM Sans, sans-serif", fontSize: 12}}>{customerRequestError}</p>}
            {!customerRequestLoading && !customerRequests.length && !customerRequestError && <p style={{margin: 0, color: C.midGray, fontFamily: "DM Sans, sans-serif", fontSize: 12}}>Your submitted figurine requests will appear here.</p>}
            <div style={{display: "flex", flexDirection: "column", gap: 9}}>
              {customerRequests.map((request) => {
                const statusColor = request.status === "Completed" ? "#2f855a" : request.status === "Cancelled" ? C.midGray : request.status === "In Progress" ? "#2563eb" : C.orange;
                const requestDate = request.created_at
                  ? new Date(request.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                  : "Date unavailable";
                return (
                  <div key={request.id} style={{display: "grid", gridTemplateColumns: isMobile ? "64px minmax(0, 1fr)" : "76px minmax(0, 1fr) auto", gap: 12, alignItems: "center", padding: 10, border: `1px solid ${C.gray}`, borderRadius: 10, background: C.offWhite}}>
                    <div style={{width: isMobile ? 64 : 76, height: isMobile ? 64 : 76, overflow: "hidden", display: "grid", placeItems: "center", borderRadius: 8, background: C.gray}}>
                      {request.photoUrl ? <img src={request.photoUrl} alt={`${request.size_name} figurine request`} style={{display: "block", width: "100%", height: "100%", objectFit: "contain"}} /> : <span style={{color: C.midGray, fontFamily: "DM Sans, sans-serif", fontSize: 10, textAlign: "center"}}>Photo unavailable</span>}
                    </div>
                    <div style={{minWidth: 0, color: C.darkGray, fontFamily: "DM Sans, sans-serif", fontSize: 12, lineHeight: 1.55}}>
                      <strong style={{display: "block", color: C.black, fontFamily: "Inter, sans-serif", fontSize: 13}}>{request.size_name}</strong>
                      <span style={{display: "block"}}>Price: ₹{Number(request.price).toLocaleString("en-IN")}</span>
                      <span style={{display: "block"}}>Requested: {requestDate}</span>
                    </div>
                    <span style={{justifySelf: isMobile ? "start" : "end", gridColumn: isMobile ? "2" : "auto", padding: "5px 9px", borderRadius: 999, background: `${statusColor}18`, color: statusColor, fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 700}} aria-label={`Request status: ${request.status}`}>{request.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── IMAGE UPLOAD WIDGET ── */
function ImageUpload({ currentImg, onImage }) {
  const inputRef = useRef();
  const [preview, setPreview] = useState(currentImg || null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { setPreview(currentImg || null); }, [currentImg]);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => { const b64 = e.target.result; setPreview(b64); onImage(b64); };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{marginBottom:16}}>
      <label style={{display:"block",fontFamily:"DM Sans, sans-serif",fontSize:12,fontWeight:500,color:C.darkGray,marginBottom:6,letterSpacing:"0.5px",textTransform:"uppercase"}}>Product Image</label>
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        style={{
          border:`2px dashed ${dragging?C.orange:C.gray}`, borderRadius:10,
          padding:16, cursor:"pointer", userSelect:"none",
          background: dragging?"rgba(232,93,4,0.04)":C.offWhite,
          display:"flex", alignItems:"center", gap:14,
          transition:"border-color 0.2s, background 0.2s",
        }}
      >
        {preview
          ? <img src={preview} alt="preview" style={{width:64,height:64,borderRadius:8,objectFit:"cover",flexShrink:0}}/>
          : <div style={{width:64,height:64,borderRadius:8,background:C.gray,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.midGray} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
            </div>
        }
        <div>
          <p style={{margin:"0 0 3px",fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.black,fontWeight:500}}>{preview?"Change image":"Upload from device"}</p>
          <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.midGray}}>Click to browse or drag &amp; drop · JPG, PNG, WEBP</p>
        </div>
        {preview && (
          <button onClick={e=>{e.stopPropagation();setPreview(null);onImage(null);}}
            style={{marginLeft:"auto",background:"none",border:`1px solid ${C.gray}`,color:C.midGray,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:12,flexShrink:0}}>
            Remove
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
    </div>
  );
}

function VariantImageUpload({ currentImg, onImage }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(currentImg || null);

  useEffect(() => {
    setPreview(currentImg || null);
  }, [currentImg]);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setPreview(dataUrl);
      onImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
      <input ref={inputRef} type="file" accept="image/*" style={{display:"none"}} onChange={(event)=>handleFile(event.target.files?.[0])}/>
      <button type="button" onClick={()=>inputRef.current?.click()} style={{display:"flex",alignItems:"center",justifyContent:"center",width:76,height:58,flexShrink:0,overflow:"hidden",border:`1px dashed ${C.orange}`,borderRadius:8,padding:4,background:"rgba(232,93,4,0.04)",color:C.orange,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:11,fontWeight:600}}>
        {preview ? <img src={preview} alt="Variant preview" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:5}}/> : "Upload image"}
      </button>
      <span style={{minWidth:0,overflow:"hidden",fontFamily:"DM Sans, sans-serif",fontSize:11,color:C.midGray,textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{preview ? "Click to replace image" : "Image required"}</span>
    </div>
  );
}

/* ── ADMIN PANEL ── */
function AdminPanel({ products, imgCache, variantMap = {}, onSave, onDelete, onToggleStock, onUpdateStockQuantity, onSaveVariant, onDeleteVariant, onMessageCustomer }) {
  const isMobile = useWindowWidth() < 640;
  const empty = { name:"", price:"", stockQuantity:"10", description:"", category:"", bgA:"#0D0D0D", bgB:"#1F1F1F", accent:"#E85D04" };
  const [form, setForm]       = useState(empty);
  const [editId, setEditId]   = useState(null);
  const [newImg, setNewImg]   = useState(null);
  const [msg, setMsg]         = useState("");
  const [figurineSizes, setFigurineSizes] = useState([]);
  const [figurineSizeForm, setFigurineSizeForm] = useState({ name: "", price: "", is_active: true });
  const [figurineSizeEditId, setFigurineSizeEditId] = useState(null);
  const [figurineSizeLoading, setFigurineSizeLoading] = useState(true);
  const [figurineSizeError, setFigurineSizeError] = useState("");
  const [figurineRequests, setFigurineRequests] = useState([]);
  const [figurineRequestLoading, setFigurineRequestLoading] = useState(true);
  const [figurineRequestError, setFigurineRequestError] = useState("");
  const [figurineRequestBusyId, setFigurineRequestBusyId] = useState(null);
  const [expandedFigurineRequestId, setExpandedFigurineRequestId] = useState(null);
  const [figurinePhotoLightbox, setFigurinePhotoLightbox] = useState(null);
  const [figurinePhotoDownloadId, setFigurinePhotoDownloadId] = useState(null);
  const [variantDrafts, setVariantDrafts] = useState([]);
  const [variantError, setVariantError] = useState("");
  const [variantBusy, setVariantBusy] = useState(false);
  const [stockBusyId, setStockBusyId] = useState(null);

  const flash = (m) => { setMsg(m); setTimeout(()=>setMsg(""),2800); };

  const adjustStockQuantity = async (product, delta) => {
    const currentQuantity = normalizeStockQuantity(product.stockQuantity, product.outOfStock ? 0 : 10);
    const nextQuantity = Math.max(0, currentQuantity + delta);
    if (nextQuantity === currentQuantity || stockBusyId === product.id) return;

    setStockBusyId(product.id);
    try {
      await onUpdateStockQuantity(product.id, nextQuantity);
      flash(`✓ ${product.name} stock updated to ${nextQuantity}.`);
    } catch (error) {
      flash(`⚠ Could not update stock: ${error.message || "Please try again."}`);
    } finally {
      setStockBusyId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadFigurineSizes = async () => {
      setFigurineSizeLoading(true);
      const { data, error } = await supabase
        .from("figurine_sizes")
        .select("id, name, price, is_active, created_at")
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (error) {
        setFigurineSizeError("Unable to load figurine settings.");
      } else {
        setFigurineSizes(data || []);
        setFigurineSizeError("");
      }
      setFigurineSizeLoading(false);
    };

    void loadFigurineSizes();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel = null;

    const sortFigurineRequests = (requests) => requests
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const enrichRealtimeRequest = async (request) => {
      const [conversationResult, signedUrlResult] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, customer_user_id, customer_name, customer_phone")
          .eq("customer_user_id", request.customer_user_id)
          .limit(1)
          .maybeSingle(),
        supabase.storage
          .from(FIGURINE_REQUEST_BUCKET)
          .createSignedUrl(request.photo_path, 60 * 60),
      ]);

      return {
        ...request,
        photoUrl: signedUrlResult.data?.signedUrl || "",
        conversation: conversationResult.data || null,
      };
    };

    const handleRealtimeRequest = async (payload) => {
      if (cancelled) return;

      if (payload.eventType === "DELETE") {
        const deletedId = payload.old?.id;
        if (!deletedId) return;
        setFigurineRequests((current) => current.filter((request) => request.id !== deletedId));
        return;
      }

      const request = payload.new;
      if (!request?.id) return;

      const enrichedRequest = await enrichRealtimeRequest(request);
      if (cancelled) return;

      setFigurineRequests((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        byId.set(request.id, { ...byId.get(request.id), ...enrichedRequest });
        return sortFigurineRequests([...byId.values()]);
      });
    };

    channel = supabase
      .channel("admin-figurine-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "figurine_requests" },
        handleRealtimeRequest,
      )
      .subscribe((status) => {
        if (!cancelled && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
          setFigurineRequestError("Live figurine request updates are unavailable right now. Refresh to check.");
        }
      });

    const loadFigurineRequests = async () => {
      setFigurineRequestLoading(true);
      setFigurineRequestError("");

      const { data, error } = await supabase
        .from("figurine_requests")
        .select("id, customer_user_id, photo_path, size_id, size_name, price, status, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setFigurineRequests([]);
        setFigurineRequestError("Unable to load figurine requests.");
        setFigurineRequestLoading(false);
        return;
      }

      const rows = data || [];
      const customerIds = [...new Set(rows.map((request) => request.customer_user_id).filter(Boolean))];
      let conversations = [];
      if (customerIds.length) {
        const { data: conversationData, error: conversationError } = await supabase
          .from("conversations")
          .select("id, customer_user_id, customer_name, customer_phone")
          .in("customer_user_id", customerIds);
        if (conversationError) {
          setFigurineRequestError("Requests loaded, but customer chat details are unavailable.");
        } else {
          conversations = conversationData || [];
        }
      }

      const conversationByUserId = new Map(conversations.map((conversation) => [conversation.customer_user_id, conversation]));
      const enrichedRequests = await Promise.all(rows.map(async (request) => {
        const { data: signedUrlData } = await supabase.storage
          .from(FIGURINE_REQUEST_BUCKET)
          .createSignedUrl(request.photo_path, 60 * 60);
        return {
          ...request,
          photoUrl: signedUrlData?.signedUrl || "",
          conversation: conversationByUserId.get(request.customer_user_id) || null,
        };
      }));

      if (cancelled) return;
      setFigurineRequests((current) => {
        const byId = new Map(enrichedRequests.map((request) => [request.id, request]));
        current.forEach((request) => byId.set(request.id, request));
        return sortFigurineRequests([...byId.values()]);
      });
      setFigurineRequestLoading(false);
    };

    void loadFigurineRequests();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!figurinePhotoLightbox || typeof document === "undefined") return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setFigurinePhotoLightbox(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [figurinePhotoLightbox]);

  const resetFigurineSizeForm = () => {
    setFigurineSizeForm({ name: "", price: "", is_active: true });
    setFigurineSizeEditId(null);
  };

  const submitFigurineSize = async () => {
    const name = figurineSizeForm.name.trim();
    const price = Number(figurineSizeForm.price);
    if (!name) {
      setFigurineSizeError("Enter a figurine size name.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFigurineSizeError("Enter a valid non-negative price.");
      return;
    }

    setFigurineSizeError("");
    const payload = { name, price, is_active: figurineSizeForm.is_active };
    const query = figurineSizeEditId
      ? supabase.from("figurine_sizes").update(payload).eq("id", figurineSizeEditId).select("id, name, price, is_active, created_at").single()
      : supabase.from("figurine_sizes").insert(payload).select("id, name, price, is_active, created_at").single();
    const { data, error } = await query;

    if (error) {
      setFigurineSizeError(error.code === "23505" ? "That figurine size already exists." : "Unable to save figurine settings.");
      return;
    }

    setFigurineSizes((current) => figurineSizeEditId
      ? current.map((option) => option.id === data.id ? data : option)
      : [...current, data]);
    resetFigurineSizeForm();
    flash(figurineSizeEditId ? "✓ Figurine size updated." : "✓ Figurine size added.");
  };

  const startFigurineSizeEdit = (option) => {
    setFigurineSizeForm({ name: option.name, price: String(option.price), is_active: option.is_active });
    setFigurineSizeEditId(option.id);
    setFigurineSizeError("");
  };

  const toggleFigurineSize = async (option) => {
    const { data, error } = await supabase
      .from("figurine_sizes")
      .update({ is_active: !option.is_active })
      .eq("id", option.id)
      .select("id, name, price, is_active, created_at")
      .single();
    if (error) {
      setFigurineSizeError("Unable to update figurine size status.");
      return;
    }
    setFigurineSizes((current) => current.map((item) => item.id === data.id ? data : item));
    if (figurineSizeEditId === option.id) setFigurineSizeForm((current) => ({ ...current, is_active: data.is_active }));
    flash(data.is_active ? "✓ Figurine size enabled." : "✓ Figurine size disabled.");
  };

  const deleteFigurineSize = async (option) => {
    if (!window.confirm(`Delete figurine size "${option.name}"?`)) return;
    const { error } = await supabase.from("figurine_sizes").delete().eq("id", option.id);
    if (error) {
      setFigurineSizeError("Unable to delete figurine size.");
      return;
    }
    setFigurineSizes((current) => current.filter((item) => item.id !== option.id));
    if (figurineSizeEditId === option.id) resetFigurineSizeForm();
    flash("Figurine size deleted.");
  };

  const updateFigurineRequestStatus = async (request, status) => {
    if (!FIGURINE_REQUEST_STATUSES.includes(status) || figurineRequestBusyId === request.id) return;
    setFigurineRequestBusyId(request.id);
    setFigurineRequestError("");
    const { data, error } = await supabase
      .from("figurine_requests")
      .update({ status })
      .eq("id", request.id)
      .select("id, status, updated_at")
      .single();

    if (error) {
      setFigurineRequestError("Unable to update figurine request status.");
    } else {
      setFigurineRequests((current) => current.map((item) => item.id === data.id ? { ...item, ...data } : item));
      flash(`✓ Figurine request marked ${data.status}.`);
    }
    setFigurineRequestBusyId(null);
  };

  const downloadFigurineRequestPhoto = async (request) => {
    if (!request?.photo_path || figurinePhotoDownloadId === request.id) return;
    setFigurinePhotoDownloadId(request.id);
    try {
      const { data, error } = await supabase.storage
        .from(FIGURINE_REQUEST_BUCKET)
        .createSignedUrl(request.photo_path, 60 * 60);
      if (error || !data?.signedUrl) throw error || new Error("Photo URL unavailable.");

      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error("Photo download failed.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const extension = String(request.photo_path.split(".").pop() || "jpg").toLowerCase();
      const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `figurine-request-${request.id}.${safeExtension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      flash(`⚠ Could not download photo: ${error?.message || "Please try again."}`);
    } finally {
      setFigurinePhotoDownloadId(null);
    }
  };
  const variantDraftFromRow = (variant) => ({
    localId: variant.id || `draft-${createUniqueFileToken()}`,
    id: variant.id || null,
    color: variant.color || "",
    active: variant.active !== false,
    imagePath: variant.imagePath || "",
    imageUrl: variant.imageUrl || "",
    imageData: null,
  });

  const addVariantDraft = () => {
    setVariantError("");
    setVariantDrafts((current) => [...current, variantDraftFromRow({})]);
  };

  const updateVariantDraft = (localId, changes) => {
    setVariantDrafts((current) => current.map((variant) => variant.localId === localId ? { ...variant, ...changes } : variant));
  };

  const removeVariantDraft = async (variant) => {
    if (variant.id) {
      if (!window.confirm(`Remove the ${variant.color || "selected"} color variant?`)) return;
      setVariantBusy(true);
      try {
        await onDeleteVariant(variant);
      } catch (error) {
        setVariantError(error.message || "Unable to remove this color variant.");
        setVariantBusy(false);
        return;
      }
      setVariantBusy(false);
    }
    setVariantDrafts((current) => current.filter((item) => item.localId !== variant.localId));
  };

  const resetProductForm = () => {
    setEditId(null);
    setForm(empty);
    setNewImg(null);
    setVariantDrafts([]);
    setVariantError("");
  };

  const saveVariantDrafts = async (productId) => {
    for (let index = 0; index < variantDrafts.length; index += 1) {
      await onSaveVariant(productId, variantDrafts[index], index);
    }
  };

  const F = (key, label, type="text", ph="") => (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontFamily:"DM Sans, sans-serif",fontSize:12,fontWeight:500,color:C.darkGray,marginBottom:6,letterSpacing:"0.5px",textTransform:"uppercase"}}>{label}</label>
      {key==="description"
        ? <textarea value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph}
            style={{width:"100%",padding:"10px 12px",border:`1px solid ${C.gray}`,borderRadius:8,fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.black,background:C.white,resize:"vertical",minHeight:76,boxSizing:"border-box",outline:"none"}}/>
        : <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph}
            style={{width:"100%",padding:"10px 12px",border:`1px solid ${C.gray}`,borderRadius:8,fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.black,background:C.white,boxSizing:"border-box",outline:"none"}}/>
      }
    </div>
  );

  const startEdit = (p) => {
    setForm({ name:p.name, price:String(p.price), stockQuantity:String(p.stockQuantity ?? (p.outOfStock ? 0 : 10)), description:p.description, category:p.category, bgA:p.bgA||"#0D0D0D", bgB:p.bgB||"#1F1F1F", accent:p.accent||"#E85D04" });
    setNewImg(imgCache[p.id]||null);
    setVariantDrafts((variantMap[p.id] || []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map(variantDraftFromRow));
    setVariantError("");
    setEditId(p.id);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const submit = async () => {
    if (!form.name.trim()||!form.price) return flash("⚠ Name and price required.");
    const price = parseInt(form.price);
    if (isNaN(price)||price<=0) return flash("⚠ Enter a valid price.");
    const stockQuantity = Number(form.stockQuantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return flash("⚠ Enter a whole number stock quantity of 0 or more.");
    if (variantDrafts.some((variant) => !variant.color.trim() || (!variant.imageData && !variant.imagePath))) {
      setVariantError("Each color variant needs a color name and an image.");
      return;
    }

    const wasEditing = Boolean(editId);
    const productId = editId || `p${Date.now()}`;
    setVariantBusy(true);
    try {
      await onSave(
        wasEditing
          ? products.map((p) => p.id === editId ? { ...p, ...form, price } : p)
          : [...products, { ...form, id: productId, price, stockQuantity }],
        productId,
        newImg
      );
      await saveVariantDrafts(productId);
      setVariantBusy(false);
      resetProductForm();
      flash(wasEditing ? "✓ Product updated!" : "✓ Product added!");
    } catch (error) {
      setVariantBusy(false);
      setVariantError(error.message || "Unable to save product variants.");
    }
  };
  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:isMobile?"20px 12px":"40px 24px"}}>
      <div style={{background:C.white,border:`1px solid ${C.gray}`,borderRadius:12,padding:isMobile?"18px 16px":28,marginBottom:28}}>
        <h3 style={{margin:"0 0 20px",fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:17,color:C.black}}>{editId?"Edit Product":"Add New Product"}</h3>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"0 20px"}}>
          {F("name","Product Name","text","e.g. Dragon Bust")}
          {F("price","Price (₹)","number","e.g. 799")}
          {F("stockQuantity","Stock Quantity","number","e.g. 10")}
          {F("category","Category","text","e.g. Fantasy, Art")}
        </div>
        {F("description","Description","text","Brief description...")}
        <ImageUpload currentImg={newImg} onImage={setNewImg}/>
        <div style={{marginBottom:16,padding:isMobile?"14px":"16px",border:`1px solid ${C.gray}`,borderRadius:10,background:C.offWhite}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:12}}>
            <div>
              <h4 style={{margin:0,fontFamily:"Inter, sans-serif",fontSize:14,fontWeight:700,color:C.black}}>Color Variants <span style={{fontFamily:"DM Sans, sans-serif",fontSize:11,fontWeight:500,color:C.midGray}}>(optional)</span></h4>
              <p style={{margin:"4px 0 0",fontFamily:"DM Sans, sans-serif",fontSize:12,lineHeight:1.45,color:C.midGray}}>Add a separate image for each customer-selectable color. The main image remains the fallback.</p>
            </div>
            <button type="button" onClick={addVariantDraft} disabled={variantBusy} style={{flexShrink:0,background:C.white,border:`1px solid ${C.orange}`,color:C.orange,padding:"7px 10px",borderRadius:7,cursor:variantBusy?"not-allowed":"pointer",fontFamily:"DM Sans, sans-serif",fontSize:12,fontWeight:600,opacity:variantBusy?0.6:1}}>+ Add Color</button>
          </div>

          {variantDrafts.length === 0 && <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.midGray}}>No color variants added. Existing single-image behavior will be used.</p>}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {variantDrafts.map((variant) => (
              <div key={variant.localId} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(130px,0.75fr) minmax(220px,1.25fr) auto",gap:10,alignItems:"center",padding:"10px",border:`1px solid ${C.gray}`,borderRadius:8,background:C.white}}>
                <div>
                  <label style={{display:"block",marginBottom:5,fontFamily:"DM Sans, sans-serif",fontSize:11,fontWeight:600,color:C.darkGray}}>Color name</label>
                  <input value={variant.color} onChange={(event)=>updateVariantDraft(variant.localId,{color:event.target.value})} maxLength={50} placeholder="e.g. Red" style={{width:"100%",boxSizing:"border-box",padding:"9px 10px",border:`1px solid ${C.gray}`,borderRadius:7,fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.black,background:C.white,outline:"none"}} />
                </div>
                <VariantImageUpload currentImg={variant.imageData || variant.imageUrl} onImage={(imageData)=>updateVariantDraft(variant.localId,{imageData})}/>
                <div style={{display:"flex",alignItems:"center",gap:9,justifyContent:isMobile?"space-between":"flex-end"}}>
                  <label style={{display:"flex",alignItems:"center",gap:6,fontFamily:"DM Sans, sans-serif",fontSize:11,color:C.darkGray,cursor:"pointer"}}>
                    <input type="checkbox" checked={variant.active} onChange={(event)=>updateVariantDraft(variant.localId,{active:event.target.checked})} />
                    Active
                  </label>
                  <button type="button" onClick={()=>removeVariantDraft(variant)} disabled={variantBusy} style={{background:"none",border:`1px solid ${C.orange}`,color:C.orange,padding:"7px 9px",borderRadius:6,cursor:variantBusy?"not-allowed":"pointer",fontFamily:"DM Sans, sans-serif",fontSize:11,opacity:variantBusy?0.6:1}}>Remove</button>
                </div>
              </div>
            ))}
          </div>
          {variantError && <p role="alert" style={{margin:"10px 0 0",fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.orange}}>{variantError}</p>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr",gap:"0 20px",marginBottom:16}}>
          {F("bgA","BG Dark","color")}
          {F("bgB","BG Light","color")}
          {F("accent","Accent","color")}
        </div>
        {msg && <p style={{margin:"0 0 12px",fontFamily:"DM Sans, sans-serif",fontSize:13,fontWeight:500,color:C.orange}}>{msg}</p>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={submit} disabled={variantBusy} style={{background:C.orange,color:"#fff",border:"none",padding:"11px 24px",borderRadius:8,cursor:variantBusy?"not-allowed":"pointer",fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:14,opacity:variantBusy?0.7:1}}>
            {editId?"Save Changes":"Add Product"}
          </button>
          {editId && <button onClick={resetProductForm} disabled={variantBusy} style={{background:"none",border:`1px solid ${C.gray}`,color:C.darkGray,padding:"11px 20px",borderRadius:8,cursor:variantBusy?"not-allowed":"pointer",fontFamily:"DM Sans, sans-serif",fontSize:14,opacity:variantBusy?0.6:1}}>Cancel</button>}
        </div>
      </div>

      <div style={{background:C.white,border:`1px solid ${C.gray}`,borderRadius:12,padding:isMobile?"18px 16px":28,marginBottom:28}}>
        <h3 style={{margin:"0 0 6px",fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:17,color:C.black}}>Custom Figurine Settings</h3>
        <p style={{margin:"0 0 20px",fontFamily:"DM Sans, sans-serif",fontSize:13,lineHeight:1.5,color:C.midGray}}>Manage the available size and price options shown in the customer figurine configurator.</p>

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(0,1fr) minmax(150px,0.45fr) auto",gap:isMobile?12:14,alignItems:"end"}}>
          <div>
            <label style={{display:"block",marginBottom:6,fontFamily:"DM Sans, sans-serif",fontSize:12,fontWeight:500,color:C.darkGray,letterSpacing:"0.5px",textTransform:"uppercase"}}>Size name</label>
            <input value={figurineSizeForm.name} onChange={(event)=>setFigurineSizeForm((current)=>({...current,name:event.target.value}))} maxLength={40} placeholder="e.g. 13 cm" style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",border:`1px solid ${C.gray}`,borderRadius:8,fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.black,background:C.white,outline:"none"}} />
          </div>
          <div>
            <label style={{display:"block",marginBottom:6,fontFamily:"DM Sans, sans-serif",fontSize:12,fontWeight:500,color:C.darkGray,letterSpacing:"0.5px",textTransform:"uppercase"}}>Price (₹)</label>
            <input type="number" min="0" step="0.01" value={figurineSizeForm.price} onChange={(event)=>setFigurineSizeForm((current)=>({...current,price:event.target.value}))} placeholder="e.g. 1299" style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",border:`1px solid ${C.gray}`,borderRadius:8,fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.black,background:C.white,outline:"none"}} />
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,minHeight:40,fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.darkGray,cursor:"pointer"}}>
            <input type="checkbox" checked={figurineSizeForm.is_active} onChange={(event)=>setFigurineSizeForm((current)=>({...current,is_active:event.target.checked}))} />
            Active
          </label>
        </div>

        {figurineSizeError && <p role="alert" style={{margin:"12px 0 0",fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.orange}}>{figurineSizeError}</p>}
        <div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:16}}>
          <button type="button" onClick={submitFigurineSize} style={{background:C.orange,color:C.white,border:"none",padding:"10px 18px",borderRadius:8,cursor:"pointer",fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:13}}>{figurineSizeEditId ? "Save Size Changes" : "Add Size"}</button>
          {figurineSizeEditId && <button type="button" onClick={resetFigurineSizeForm} style={{background:"none",border:`1px solid ${C.gray}`,color:C.darkGray,padding:"10px 18px",borderRadius:8,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:13}}>Cancel</button>}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:20}}>
          {figurineSizeLoading && <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.midGray}}>Loading figurine settings...</p>}
          {!figurineSizeLoading && !figurineSizes.length && !figurineSizeError && <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.midGray}}>No figurine sizes configured yet.</p>}
          {!figurineSizeLoading && figurineSizes.map((option) => (
            <div key={option.id} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(0,1fr) auto auto auto",gap:8,alignItems:"center",padding:"11px 12px",border:`1px solid ${C.gray}`,borderRadius:9,background:C.offWhite}}>
              <div style={{minWidth:0}}>
                <strong style={{display:"block",fontFamily:"Inter, sans-serif",fontSize:14,color:C.black}}>{option.name}</strong>
                <span style={{display:"block",marginTop:2,fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.midGray}}>₹{Number(option.price).toLocaleString("en-IN")}</span>
              </div>
              <span style={{justifySelf:isMobile?"start":"auto",padding:"3px 8px",borderRadius:999,background:option.is_active?"rgba(232,93,4,0.1)":C.gray,color:option.is_active?C.orange:C.midGray,fontFamily:"DM Sans, sans-serif",fontSize:11,fontWeight:600}}>{option.is_active ? "Active" : "Disabled"}</span>
              <button type="button" onClick={()=>startFigurineSizeEdit(option)} style={{background:C.white,border:`1px solid ${C.gray}`,color:C.darkGray,padding:"7px 10px",borderRadius:6,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:12}}>Edit</button>
              <div style={{display:"flex",gap:8}}>
                <button type="button" onClick={()=>toggleFigurineSize(option)} style={{background:"none",border:`1px solid ${C.gray}`,color:C.darkGray,padding:"7px 10px",borderRadius:6,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:12}}>{option.is_active ? "Disable" : "Enable"}</button>
                <button type="button" onClick={()=>deleteFigurineSize(option)} style={{background:"none",border:`1px solid ${C.orange}`,color:C.orange,padding:"7px 10px",borderRadius:6,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:12}}>Delete</button>
              </div>
            </div>
          ))}
        </div>

      </div>
      <div style={{background:C.white,border:`1px solid ${C.gray}`,borderRadius:12,padding:isMobile?"18px 16px":28,marginBottom:28}}>
        <h3 style={{margin:"0 0 6px",fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:17,color:C.black}}>Custom Figurine Requests</h3>
        <p style={{margin:"0 0 20px",fontFamily:"DM Sans, sans-serif",fontSize:13,lineHeight:1.5,color:C.midGray}}>Review customer photos and manage the progress of personalized figurine requests.</p>

        {figurineRequestError && <p role="alert" style={{margin:"0 0 14px",fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.orange}}>{figurineRequestError}</p>}
        {figurineRequestLoading && <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.midGray}}>Loading figurine requests...</p>}
        {!figurineRequestLoading && !figurineRequests.length && !figurineRequestError && <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.midGray}}>No figurine requests yet.</p>}

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {!figurineRequestLoading && figurineRequests.map((request) => {
            const customer = request.conversation;
            const expanded = expandedFigurineRequestId === request.id;
            const createdLabel = request.created_at
              ? new Date(request.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
              : "Date unavailable";
            return (
              <div key={request.id} style={{border:`1px solid ${C.gray}`,borderRadius:10,padding:isMobile?12:14,background:C.offWhite}}>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"76px minmax(0,1fr) auto",gap:12,alignItems:"center"}}>
                  {request.photoUrl ? (
                    <button type="button" onClick={()=>setFigurinePhotoLightbox(request)} aria-label={`Open ${request.size_name} figurine request photo`} title="Open photo" style={{width:76,height:76,borderRadius:8,overflow:"hidden",display:"grid",placeItems:"center",background:C.gray,border:0,padding:0,cursor:"zoom-in"}}>
                      <img src={request.photoUrl} alt={`${request.size_name} figurine request`} style={{width:"100%",height:"100%",objectFit:"cover"}} />
                    </button>
                  ) : (
                    <div style={{width:76,height:76,borderRadius:8,overflow:"hidden",display:"grid",placeItems:"center",background:C.gray,color:C.midGray,fontFamily:"DM Sans, sans-serif",fontSize:11,textAlign:"center"}}>Photo unavailable</div>
                  )}
                  <div style={{minWidth:0}}>
                    <strong style={{display:"block",fontFamily:"Inter, sans-serif",fontSize:14,color:C.black}}>{customer?.customer_name || "Anonymous customer"}</strong>
                    <span style={{display:"block",marginTop:3,fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.midGray,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{customer?.customer_phone || request.customer_user_id}</span>
                    <span style={{display:"block",marginTop:5,fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.darkGray}}>{request.size_name} · ₹{Number(request.price).toLocaleString("en-IN")} · {createdLabel}</span>
                  </div>
                  <select value={request.status} onChange={(event)=>updateFigurineRequestStatus(request,event.target.value)} disabled={figurineRequestBusyId === request.id} aria-label={`Status for ${customer?.customer_name || "figurine request"}`} style={{width:isMobile?"100%":140,boxSizing:"border-box",border:`1px solid ${C.gray}`,borderRadius:7,padding:"8px 9px",background:C.white,color:C.darkGray,fontFamily:"DM Sans, sans-serif",fontSize:12,opacity:figurineRequestBusyId === request.id?0.65:1}}>
                    {FIGURINE_REQUEST_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12}}>
                  <button type="button" onClick={()=>setExpandedFigurineRequestId(expanded ? null : request.id)} style={{background:C.white,border:`1px solid ${C.gray}`,color:C.darkGray,padding:"8px 11px",borderRadius:7,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:12}}>{expanded ? "Hide Details" : "View Details"}</button>
                  <button type="button" onClick={()=>onMessageCustomer?.(request.customer_user_id)} style={{background:C.orange,border:"none",color:C.white,padding:"8px 11px",borderRadius:7,cursor:"pointer",fontFamily:"Inter, sans-serif",fontSize:12,fontWeight:600}}>Message Customer</button>
                </div>
                {expanded && (
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(180px,0.7fr) minmax(0,1.3fr)",gap:16,marginTop:14,paddingTop:14,borderTop:`1px solid ${C.gray}`}}>
                    <div style={{borderRadius:9,overflow:"hidden",background:C.white,border:`1px solid ${C.gray}`,minHeight:isMobile?180:220,display:"grid",placeItems:"center"}}>
                      {request.photoUrl ? <img src={request.photoUrl} alt="Customer figurine reference" style={{display:"block",maxWidth:"100%",maxHeight:isMobile?260:320,width:"100%",height:"100%",objectFit:"contain"}} /> : <span style={{fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.midGray}}>Photo unavailable</span>}
                    </div>
                    <div style={{fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.darkGray,lineHeight:1.7}}>
                      <p style={{margin:"0 0 6px"}}><strong>Customer:</strong> {customer?.customer_name || "Anonymous customer"}</p>
                      <p style={{margin:"0 0 6px"}}><strong>Phone:</strong> {customer?.customer_phone || "Not available"}</p>
                      <p style={{margin:"0 0 6px",wordBreak:"break-all"}}><strong>Customer ID:</strong> {request.customer_user_id}</p>
                      <p style={{margin:"0 0 6px"}}><strong>Size:</strong> {request.size_name}</p>
                      <p style={{margin:"0 0 6px"}}><strong>Price:</strong> ₹{Number(request.price).toLocaleString("en-IN")}</p>
                      <p style={{margin:0}}><strong>Status:</strong> {request.status}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <h3 style={{margin:"0 0 14px",fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:17,color:C.black}}>Products ({products.length})</h3>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {products.map(p => {
          const thumb = imgCache[p.id]||null;
          const stockQuantity = normalizeStockQuantity(p.stockQuantity, p.outOfStock ? 0 : 10);
          const isOutOfStock = p.outOfStock || stockQuantity === 0;
          const stockBusy = stockBusyId === p.id;
          return (
            <div key={p.id} style={{background:C.white,border:`1px solid ${C.gray}`,borderRadius:10,padding:isMobile?"12px 14px":"14px 18px",display:"flex",flexDirection:"column",gap:10}}>
              {/* Top row: thumbnail + name */}
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:isMobile?44:50,height:isMobile?44:50,borderRadius:8,overflow:"hidden",flexShrink:0,background:p.bgA}}>
                  {thumb ? <img src={thumb} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <svg viewBox="0 0 50 50" style={{width:"100%",height:"100%"}}><rect width="50" height="50" fill={p.bgA}/><circle cx="25" cy="25" r="13" fill={p.accent} opacity="0.7"/></svg>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{margin:0,fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:isMobile?14:15,color:C.black,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</p>
                  <p style={{margin:"2px 0 0",fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.midGray}}>{p.category} · ₹{p.price.toLocaleString("en-IN")} · {isOutOfStock ? "Out of Stock" : `${stockQuantity} left`}</p>
                  {isOutOfStock && <span style={{display:"inline-block",marginTop:4,background:"rgba(232,93,4,0.08)",color:C.orange,fontSize:11,padding:"2px 8px",borderRadius:10,fontFamily:"DM Sans, sans-serif",fontWeight:500}}>Out of Stock</span>}
                </div>
              </div>
              {/* Bottom row: inline stock control and existing action buttons */}
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",width:"100%"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flex:isMobile?"1 1 100%":"0 0 auto",minWidth:0}}>
                  <span style={{fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.darkGray,fontWeight:600}}>Stock</span>
                  <div style={{display:"flex",alignItems:"center",gap:4,border:`1px solid ${C.gray}`,borderRadius:7,padding:3,background:C.offWhite,opacity:stockBusy?0.65:1}}>
                    <button type="button" onClick={()=>adjustStockQuantity(p,-1)} disabled={stockBusy || stockQuantity === 0} aria-label={`Decrease ${p.name} stock`} title="Decrease stock" style={{width:30,height:30,border:"none",borderRadius:5,background:C.white,color:stockQuantity===0?C.midGray:C.darkGray,cursor:stockBusy || stockQuantity===0?"not-allowed":"pointer",fontFamily:"Inter, sans-serif",fontSize:20,lineHeight:1,padding:0}}>−</button>
                    <span aria-live="polite" aria-label={`${stockQuantity} in stock`} style={{minWidth:34,textAlign:"center",fontFamily:"Inter, sans-serif",fontSize:14,fontWeight:700,color:C.black}}>{stockQuantity}</span>
                    <button type="button" onClick={()=>adjustStockQuantity(p,1)} disabled={stockBusy} aria-label={`Increase ${p.name} stock`} title="Increase stock" style={{width:30,height:30,border:"none",borderRadius:5,background:C.white,color:C.darkGray,cursor:stockBusy?"not-allowed":"pointer",fontFamily:"Inter, sans-serif",fontSize:20,lineHeight:1,padding:0}}>+</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(3,minmax(0,1fr))":"auto auto auto",gap:8,flex:"1 1 auto",minWidth:0}}>
                <button onClick={()=>onToggleStock(p.id)} style={{
                  background: isOutOfStock?"rgba(232,93,4,0.08)":C.offWhite,
                  border: isOutOfStock?`1px solid ${C.orange}`:`1px solid ${C.gray}`,
                  color: isOutOfStock?C.orange:C.darkGray,
                  padding:isMobile?"8px 6px":"6px 14px",
                  borderRadius:6,cursor:"pointer",
                  fontFamily:"DM Sans, sans-serif",fontSize:isMobile?12:13,fontWeight:500,
                  textAlign:"center",
                }}>
                  {isOutOfStock ? "🔴 Out of Stock" : "🟢 In Stock"}
                </button>
                <button onClick={()=>startEdit(p)} style={{background:"none",border:`1px solid ${C.gray}`,color:C.darkGray,padding:isMobile?"8px 6px":"6px 14px",borderRadius:6,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:isMobile?12:13,textAlign:"center"}}>
                  ✏️ Edit
                </button>
                <button onClick={()=>{if(window.confirm(`Delete "${p.name}"?`)) onDelete(p.id);}} style={{background:"none",border:`1px solid ${C.orange}`,color:C.orange,padding:isMobile?"8px 6px":"6px 14px",borderRadius:6,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:isMobile?12:13,textAlign:"center"}}>
                  🗑️ Delete
                </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {figurinePhotoLightbox && (
        <div
          role="presentation"
          onClick={(event)=>{ if (event.target === event.currentTarget) setFigurinePhotoLightbox(null); }}
          style={{position:"fixed",inset:0,zIndex:1450,display:"flex",alignItems:"center",justifyContent:"center",padding:isMobile?12:28,background:"rgba(13,13,13,0.78)",backdropFilter:"blur(6px)"}}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="figurine-photo-preview-title" onClick={(event)=>event.stopPropagation()} style={{display:"flex",flexDirection:"column",width:"min(1100px,100%)",maxHeight:"calc(100dvh - 40px)",overflow:"hidden",border:`1px solid ${C.gray}`,borderRadius:14,background:C.white,boxShadow:"0 24px 80px rgba(0,0,0,0.4)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"12px 14px",borderBottom:`1px solid ${C.gray}`}}>
              <div style={{minWidth:0}}>
                <strong id="figurine-photo-preview-title" style={{display:"block",overflow:"hidden",color:C.black,fontFamily:"Inter, sans-serif",fontSize:14,textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{figurinePhotoLightbox.size_name} figurine request</strong>
                <span style={{display:"block",marginTop:2,color:C.midGray,fontFamily:"DM Sans, sans-serif",fontSize:11}}>Private customer photo</span>
              </div>
              <button type="button" onClick={()=>setFigurinePhotoLightbox(null)} aria-label="Close photo preview" style={{width:32,height:32,flexShrink:0,border:`1px solid ${C.gray}`,borderRadius:999,background:C.white,color:C.darkGray,cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:180,padding:isMobile?12:24,background:C.offWhite}}>
              {figurinePhotoLightbox.photoUrl ? <img src={figurinePhotoLightbox.photoUrl} alt="Customer figurine reference" style={{display:"block",maxWidth:"100%",maxHeight:"min(72vh, 720px)",width:"auto",height:"auto",objectFit:"contain"}} /> : <span style={{color:C.midGray,fontFamily:"DM Sans, sans-serif",fontSize:12}}>Photo unavailable</span>}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,padding:"12px 14px",borderTop:`1px solid ${C.gray}`}}>
              <button type="button" onClick={()=>downloadFigurineRequestPhoto(figurinePhotoLightbox)} disabled={figurinePhotoDownloadId === figurinePhotoLightbox.id} style={{border:0,borderRadius:8,padding:"9px 13px",background:C.orange,color:C.white,cursor:figurinePhotoDownloadId === figurinePhotoLightbox.id ? "not-allowed" : "pointer",fontFamily:"Inter, sans-serif",fontSize:12,fontWeight:700,opacity:figurinePhotoDownloadId === figurinePhotoLightbox.id ? 0.7 : 1}}>{figurinePhotoDownloadId === figurinePhotoLightbox.id ? "Preparing..." : "Download Photo"}</button>
              <button type="button" onClick={()=>setFigurinePhotoLightbox(null)} style={{border:`1px solid ${C.gray}`,borderRadius:8,padding:"9px 13px",background:C.white,color:C.darkGray,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:12}}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── ROOT APP ── */
export default function NanoAakriti() {
  const [products, setProducts]   = useState(defaultProducts);
  const [imgCache, setImgCache]   = useState({});
  const [productVariants, setProductVariants] = useState({});
  const [selected, setSelected]   = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [view, setView]           = useState("home");
  const [adminStep, setAdminStep] = useState("login");
  const [filter, setFilter]       = useState("All");
  const [cart, setCart]           = useState([]);
  const [cartOpen, setCartOpen]   = useState(false);
  const [cartFeedback, setCartFeedback] = useState("");
  const [figurineOpen, setFigurineOpen] = useState(false);
  const [chatOpen, setChatOpen]   = useState(false);
  const [chatProduct, setChatProduct] = useState(null);
  const [chatInitialMessage, setChatInitialMessage] = useState("");
  const [adminChatCustomerId, setAdminChatCustomerId] = useState(null);
  const [reviews, setReviews]     = useState([]);
  const [reviewForm, setReviewForm] = useState({ name:"", comment:"", rating:5 });
  const [reviewMsg, setReviewMsg] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [heroRevealRef, heroRevealClass] = useScrollReveal();
  const [categoryRevealRef, categoryRevealClass] = useScrollReveal();
  const [gridRevealRef, gridRevealClass] = useScrollReveal();
  const [footerRevealRef, footerRevealClass] = useScrollReveal();
  const logoTapCount              = useRef(0);
  const logoTapTimer              = useRef(null);
  const cartFeedbackTimer         = useRef(null);

  const handleAdminSuccess = useCallback(() => {
    setAdminStep("panel");
  }, []);

  const handleAdminChatCustomerHandled = useCallback(() => {
    setAdminChatCustomerId(null);
  }, []);

  const openChat = (product = null, initialMessage = "") => {
    setChatProduct(product);
    setChatInitialMessage(initialMessage);
    setChatOpen(true);
  };

  const closeChat = () => {
    setChatOpen(false);
    setChatProduct(null);
    setChatInitialMessage("");
  };

  const showCartFeedback = (message) => {
    setCartFeedback(message);
    if (cartFeedbackTimer.current) window.clearTimeout(cartFeedbackTimer.current);
    cartFeedbackTimer.current = window.setTimeout(() => setCartFeedback(""), 2400);
  };

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setCart((current) => {
      let changed = false;
      const normalized = current.flatMap((item) => {
        const product = products.find((candidate) => candidate.id === item.id);
        if (!product) {
          changed = true;
          return [];
        }

        const availableStock = getAvailableStock(product);
        const currentQuantity = normalizeStockQuantity(item.qty, 0);
        const nextQuantity = Math.min(currentQuantity, availableStock);
        if (nextQuantity !== item.qty) changed = true;
        return nextQuantity > 0 ? [{ ...item, qty: nextQuantity }] : [];
      });

      return changed ? normalized : current;
    });
  }, [products]);

  useEffect(() => () => {
    if (cartFeedbackTimer.current) window.clearTimeout(cartFeedbackTimer.current);
  }, []);

  const handleHeroPointerMove = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 14;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 10;
    event.currentTarget.style.setProperty("--hero-x", `${x}px`);
    event.currentTarget.style.setProperty("--hero-y", `${y}px`);
  };

  const resetHeroPointer = (event) => {
    event.currentTarget.style.setProperty("--hero-x", "0px");
    event.currentTarget.style.setProperty("--hero-y", "0px");
  };

  const handleLogoTap = () => {
    logoTapCount.current += 1;
    clearTimeout(logoTapTimer.current);
    if (logoTapCount.current >= 5) {
      logoTapCount.current = 0;
      setView("admin");
      setAdminStep("login");
    } else {
      logoTapTimer.current = setTimeout(() => { logoTapCount.current = 0; }, 1500);
    }
  };

  /* load persisted data */
useEffect(() => {
  (async () => {
    // Load products from Supabase
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const loadedProducts = (data || []).map(productRowFromDb);

      setProducts(loadedProducts);

      const cache = {};

      for (const product of loadedProducts) {
        if (!product.image_path) continue;

        const { data: publicUrlData } = supabase
          .storage
          .from("product-images")
          .getPublicUrl(product.image_path);

        if (publicUrlData?.publicUrl) {
          cache[product.id] = publicUrlData.publicUrl;
        }
      }

      setImgCache(cache);
    } catch (error) {
      console.error("Failed to load products from Supabase:", error);
    }

    // Reviews still use the existing local storage system
    try {
      const saved = await readStore("na_reviews_v1");
      if (saved) setReviews(JSON.parse(saved));
    } catch {}
  })();
}, []);

useEffect(() => {
  let cancelled = false;

  const loadProductVariants = async () => {
    let query = supabase
      .from("product_variants")
      .select("id, product_id, color, image_path, sort_order, active, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (adminStep !== "panel") query = query.eq("active", true);

    const { data, error } = await query;
    if (cancelled) return;
    if (error) {
      console.error("Failed to load product variants from Supabase:", error);
      setProductVariants({});
      return;
    }

    const grouped = {};
    (data || []).forEach((row) => {
      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(row.image_path);
      const variant = productVariantRowFromDb(row, publicUrlData?.publicUrl || "");
      if (!grouped[row.product_id]) grouped[row.product_id] = [];
      grouped[row.product_id].push(variant);
    });
    setProductVariants(grouped);
  };

  void loadProductVariants();
  return () => { cancelled = true; };
}, [adminStep]);

 const handleAdminSave = async (prods, imgId, imgData) => {
  const target = prods.find((product) => product.id === imgId);

  if (!target) {
    throw new Error("Product not found.");
  }

  let imagePath = target.image_path || null;
  const previousImagePath = imagePath;

  // Upload a new product image to Supabase Storage.
  if (imgData) {
    const blob = await dataUrlToBlob(imgData);
    const extension = getImageExtension(blob.type);
    const newPath = `products/${target.id}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(newPath, blob, {
        contentType: blob.type,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    imagePath = newPath;
  }

  // Remove the existing image if the admin removed it.
  if (!imgData && previousImagePath) {
    const { error: removeError } = await supabase.storage
      .from("product-images")
      .remove([previousImagePath]);

    if (removeError) {
      console.warn("Old product image could not be removed:", removeError);
    }

    imagePath = null;
  }

  const row = productRowForDb(target, imagePath);

  const { error: productError } = await supabase
    .from("products")
    .upsert(row, { onConflict: "id" });

  if (productError) throw productError;

  const savedStockQuantity = Number(row.stock_quantity);
  const savedOutOfStock = Boolean(row.out_of_stock) || savedStockQuantity === 0;

  // Remove old image when its path changes.
  if (
    imgData &&
    previousImagePath &&
    previousImagePath !== imagePath
  ) {
    const { error: oldImageError } = await supabase.storage
      .from("product-images")
      .remove([previousImagePath]);

    if (oldImageError) {
      console.warn(
        "Previous product image could not be removed:",
        oldImageError
      );
    }
  }

  setProducts((current) =>
    current.some((product) => product.id === target.id)
      ? current.map((product) => product.id === target.id ? { ...target, image_path: imagePath, stockQuantity: savedStockQuantity, outOfStock: savedOutOfStock } : product)
      : [...current, { ...target, image_path: imagePath, stockQuantity: savedStockQuantity, outOfStock: savedOutOfStock }]
  );

  const updatedCache = { ...imgCache };

  if (imagePath) {
    const { data: publicUrlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(imagePath);

    if (publicUrlData?.publicUrl) {
      updatedCache[target.id] = publicUrlData.publicUrl;
    }
  } else {
    delete updatedCache[target.id];
  }

  setImgCache(updatedCache);
};

const handleAdminSaveVariant = async (productId, draft, sortOrder) => {
  let imagePath = draft.imagePath || null;
  const previousImagePath = imagePath;

  if (draft.imageData) {
    const blob = await dataUrlToBlob(draft.imageData);
    const extension = getImageExtension(blob.type);
    const newPath = `products/${productId}/variants/${createUniqueFileToken()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(newPath, blob, { contentType: blob.type, upsert: false });
    if (uploadError) throw uploadError;
    imagePath = newPath;
  }

  if (!imagePath) throw new Error("A variant image is required.");

  const payload = {
    product_id: productId,
    color: draft.color.trim(),
    image_path: imagePath,
    sort_order: sortOrder,
    active: Boolean(draft.active),
  };
  if (draft.id) payload.id = draft.id;

  const { data, error } = await supabase
    .from("product_variants")
    .upsert(payload, { onConflict: "id" })
    .select("id, product_id, color, image_path, sort_order, active, created_at, updated_at")
    .single();

  if (error) throw error;

  if (draft.imageData && previousImagePath && previousImagePath !== imagePath) {
    const { error: oldImageError } = await supabase.storage
      .from("product-images")
      .remove([previousImagePath]);
    if (oldImageError) console.warn("Previous variant image could not be removed:", oldImageError);
  }

  const { data: publicUrlData } = supabase.storage
    .from("product-images")
    .getPublicUrl(data.image_path);
  const savedVariant = productVariantRowFromDb(data, publicUrlData?.publicUrl || "");

  setProductVariants((current) => {
    const existing = current[productId] || [];
    const next = existing.some((variant) => variant.id === savedVariant.id)
      ? existing.map((variant) => variant.id === savedVariant.id ? savedVariant : variant)
      : [...existing, savedVariant];
    return { ...current, [productId]: next.sort((a, b) => a.sortOrder - b.sortOrder) };
  });
  return savedVariant;
};

const handleDeleteVariant = async (variant) => {
  const { error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", variant.id);
  if (error) throw error;

  if (variant.imagePath) {
    const { error: imageError } = await supabase.storage
      .from("product-images")
      .remove([variant.imagePath]);
    if (imageError) console.warn("Variant image could not be removed:", imageError);
  }

  setProductVariants((current) => ({
    ...current,
    [variant.productId]: (current[variant.productId] || []).filter((item) => item.id !== variant.id),
  }));
};

const handleDelete = async (id) => {
  const product = products.find((item) => item.id === id);
  const variants = productVariants[id] || [];

  if (!product) return;

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id);

  if (error) throw error;

  if (product.image_path) {
    const { error: imageError } = await supabase.storage
      .from("product-images")
      .remove([product.image_path]);

    if (imageError) {
      console.warn(
        "Product image could not be removed:",
        imageError
      );
    }
  }

  const variantPaths = variants.map((variant) => variant.imagePath).filter(Boolean);
  if (variantPaths.length) {
    const { error: variantImageError } = await supabase.storage
      .from("product-images")
      .remove(variantPaths);
    if (variantImageError) console.warn("Variant images could not be removed:", variantImageError);
  }

  setProducts((current) =>
    current.filter((item) => item.id !== id)
  );

  setImgCache((current) => {
    const updated = { ...current };
    delete updated[id];
    return updated;
  });

  setProductVariants((current) => {
    const updated = { ...current };
    delete updated[id];
    return updated;
  });
};

const handleToggleStock = async (id) => {
  const product = products.find((item) => item.id === id);

  if (!product) return;

  const stockQuantity = normalizeStockQuantity(product.stockQuantity, product.outOfStock ? 0 : 10);
  const nextOutOfStock = stockQuantity === 0 ? true : !product.outOfStock;

  const { error } = await supabase
    .from("products")
    .update({
      out_of_stock: nextOutOfStock,
    })
    .eq("id", id);

  if (error) throw error;

  setProducts((current) =>
    current.map((item) =>
      item.id === id
        ? { ...item, outOfStock: nextOutOfStock || stockQuantity === 0 }
        : item
    )
  );
};

const handleUpdateStockQuantity = async (id, nextQuantity) => {
  const product = products.find((item) => item.id === id);

  if (!product) return;

  const stockQuantity = normalizeStockQuantity(nextQuantity, 0);
  const { error } = await supabase
    .from("products")
    .update({
      stock_quantity: stockQuantity,
      out_of_stock: stockQuantity === 0,
    })
    .eq("id", id);

  if (error) throw error;

  setProducts((current) =>
    current.map((item) =>
      item.id === id
        ? { ...item, stockQuantity, outOfStock: stockQuantity === 0 }
        : item
    )
  );
};

  const addToCart = (product) => {
    if (!product) return;
    const availableStock = getAvailableStock(product);
    const currentQuantity = cart.find((item) => item.id === product.id)?.qty || 0;
    if (availableStock === 0) {
      showCartFeedback("This product is out of stock.");
      return;
    }
    if (currentQuantity >= availableStock) {
      showCartFeedback(`Only ${availableStock} available.`);
      return;
    }

    setCart(prev => {
      const exists = prev.find(item => item.id === product.id);
      if (exists) {
        const nextQuantity = Math.min(availableStock, normalizeStockQuantity(exists.qty, 0) + 1);
        return prev.map(item => item.id === product.id ? {...item, qty: nextQuantity} : item);
      }
      return [...prev, { id: product.id, qty: 1 }];
    });
  };

  const updateCartQty = (id, delta) => {
    const product = products.find((item) => item.id === id);
    if (!product) return;

    const availableStock = getAvailableStock(product);
    const currentQuantity = cart.find((item) => item.id === id)?.qty || 0;
    if (delta > 0 && currentQuantity >= availableStock) {
      showCartFeedback(availableStock > 0 ? `Only ${availableStock} available.` : "This product is out of stock.");
      return;
    }

    setCart(prev => prev
      .map(item => {
        if (item.id !== id) return item;
        const currentItemQuantity = normalizeStockQuantity(item.qty, 0);
        const nextQuantity = delta > 0
          ? Math.min(availableStock, currentItemQuantity + delta)
          : Math.max(0, currentItemQuantity + delta);
        return { ...item, qty: nextQuantity };
      })
      .filter(item => item.qty > 0)
    );
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(item => item.id !== id));
  const clearCart = () => setCart([]);
  const getCartQty = (id) => cart.find(item => item.id === id)?.qty || 0;

  const saveReviews = async (nextReviews) => {
    setReviews(nextReviews);
    await writeStore("na_reviews_v1", JSON.stringify(nextReviews));
  };

  const submitReview = async (e) => {
    e.preventDefault();
    const comment = reviewForm.comment.trim();
    if (!comment) {
      setReviewMsg("Please write a short comment.");
      return;
    }
    const nextReview = {
      id: `${Date.now()}`,
      name: reviewForm.name.trim() || "Customer",
      comment,
      rating: reviewForm.rating,
      date: new Date().toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }),
    };
    await saveReviews([nextReview, ...reviews].slice(0, 6));
    setReviewForm({ name:"", comment:"", rating:5 });
    setReviewMsg("Thank you for your rating.");
    setTimeout(()=>setReviewMsg(""), 2400);
  };

  const exitAdmin = async () => {
    await supabase.auth.signOut();
    setView("home");
    setAdminStep("login");
  };

  // The existing admin header button still clears its old password field; route that action through secure logout.
  const setAdminPwd = () => { void exitAdmin(); };

  const isMobile = useWindowWidth() < 640;
  const isTablet = useWindowWidth() < 900;

  const categories = ["All",...Array.from(new Set(products.map(p=>p.category)))];
  const filtered   = filter==="All" ? products : products.filter(p=>p.category===filter);
  const cartItems  = cart
    .map(item => {
      const product = products.find(p => p.id === item.id);
      if (!product) return null;
      const qty = Math.min(normalizeStockQuantity(item.qty, 0), getAvailableStock(product));
      return qty > 0 ? { product, qty } : null;
    })
    .filter(Boolean);
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const cartEnquiryMessage = [
    "Cart enquiry:",
    "",
    ...cartItems.map(({ product, qty }) => (
      `• ${product.name} — Rs. ${product.price.toLocaleString("en-IN")} × ${qty} (Product ID: ${product.id})`
    )),
    "",
    `Cart Total: Rs. ${cartTotal.toLocaleString("en-IN")}`,
  ].join("\n");
  const averageRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  /* ADMIN LOGIN */
  /*
  if (view==="admin" && adminStep==="login") return (
    <div style={{minHeight:"100vh",background:C.offWhite,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:C.white,border:`1px solid ${C.gray}`,borderRadius:16,padding:40,width:"100%",maxWidth:380}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:24}}><NanoLogo scale={0.7}/></div>
        <h2 style={{margin:"0 0 5px",fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:20,color:C.black,textAlign:"center"}}>Admin Login</h2>
        <p style={{margin:"0 0 22px",fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.midGray,textAlign:"center"}}>Enter your admin password</p>
        <input type="password" value={adminPwd} onChange={e=>setAdminPwd(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="Password"
          style={{width:"100%",padding:"11px 14px",border:`1px solid ${adminErr?C.orange:C.gray}`,borderRadius:8,fontSize:15,color:C.black,boxSizing:"border-box",outline:"none",marginBottom:8,fontFamily:"DM Sans, sans-serif"}}/>
        {adminErr && <p style={{margin:"0 0 10px",fontSize:13,color:C.orange,fontFamily:"DM Sans, sans-serif"}}>{adminErr}</p>}
        <button onClick={tryLogin} style={{width:"100%",background:C.orange,color:"#fff",border:"none",padding:12,borderRadius:8,cursor:"pointer",fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:15,marginBottom:10}}>Login</button>
        <button onClick={()=>{setView("home");setAdminPwd("");setAdminErr("");}} style={{width:"100%",background:"none",border:`1px solid ${C.gray}`,color:C.darkGray,padding:11,borderRadius:8,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:14}}>← Back to Store</button>
      </div>
    </div>
  );
  */

  if (view==="admin" && adminStep==="login") return (
    <AdminLogin
      onSuccess={handleAdminSuccess}
      onBack={()=>setView("home")}
    />
  );

  /* ADMIN PANEL */
  if (view==="admin") return (
    <div style={{minHeight:"100vh",background:C.offWhite}}>
      <div style={{background:C.white,borderBottom:`1px solid ${C.gray}`,padding:"12px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <NanoLogo scale={0.6}/>
        <button onClick={()=>{setView("home");setAdminStep("login");setAdminPwd("");}} style={{background:"none",border:`1px solid ${C.gray}`,color:C.darkGray,padding:"7px 16px",borderRadius:7,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:13}}>✕ Exit Admin</button>
      </div>
      <AdminPanel products={products} imgCache={imgCache} variantMap={productVariants} onSave={handleAdminSave} onDelete={handleDelete} onToggleStock={handleToggleStock} onUpdateStockQuantity={handleUpdateStockQuantity} onSaveVariant={handleAdminSaveVariant} onDeleteVariant={handleDeleteVariant} onMessageCustomer={setAdminChatCustomerId}/>
      <AdminChatDashboard requestedCustomerUserId={adminChatCustomerId} onRequestedCustomerHandled={handleAdminChatCustomerHandled}/>
    </div>
  );

  /* STOREFRONT */
  return (
    <div className="nano-shell" style={{minHeight:"100vh",background:`linear-gradient(135deg,${C.warmGlow} 0%,${C.coolMist} 48%,${C.blueMist} 100%)`}}>
      <MotionStyles />
      {/* Header */}
      <header className={`nano-header${isScrolled ? " nano-header-scrolled" : ""}`} style={{background:isScrolled?"rgba(255,255,255,0.98)":"rgba(248,247,244,0.94)",backdropFilter:"blur(16px)",borderBottom:`1px solid ${C.gray}`,padding:isMobile?"0 16px":"0 32px",display:"flex",alignItems:"center",justifyContent:"space-between",height:isMobile?60:72,position:"sticky",top:0,zIndex:100}}>
        <div onClick={handleLogoTap} style={{cursor:"default", userSelect:"none"}}>
          <NanoLogo scale={isMobile?0.52:0.7}/>
        </div>
        <nav style={{display:"flex",alignItems:"center",gap:isMobile?6:8}}>
          <a className="nano-nav-link" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Open Nano Aakriti on Instagram" title="Instagram"
            style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,0.52)",border:`1px solid ${C.gray}`,color:C.darkGray,textDecoration:"none",padding:isMobile?"7px 9px":"7px 14px",borderRadius:8,fontFamily:"DM Sans, sans-serif",fontSize:13}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="url(#igGrad1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <defs><linearGradient id="igGrad1" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="50%" stopColor="#e6683c"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs>
              <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#e6683c" stroke="none"/>
            </svg>
          </a>
          <a className="nano-nav-link" href={GMAIL_COMPOSE_URL} aria-label="Open Gmail compose" title="Email"
            style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,0.52)",border:`1px solid ${C.gray}`,color:C.darkGray,textDecoration:"none",padding:isMobile?"7px 9px":"7px 14px",borderRadius:8,fontFamily:"DM Sans, sans-serif",fontSize:13}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          </a>
          <button
            type="button"
            className="nano-nav-link"
            onClick={()=>setCartOpen(true)}
            style={{display:"flex",alignItems:"center",gap:6,background:C.black,border:`1px solid ${C.black}`,color:"#fff",padding:isMobile?"7px 10px":"7px 14px",borderRadius:8,fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:13,cursor:"pointer",position:"relative"}}
            aria-label={`Open cart with ${cartCount} item${cartCount!==1?"s":""}`}
          >
            <CartIcon size={15} color="#fff"/>
            {!isMobile && "Cart"}
            {cartCount > 0 && (
              <span style={{minWidth:18,height:18,borderRadius:999,background:C.orange,color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:"DM Sans, sans-serif",fontSize:10,fontWeight:700}}>
                {cartCount}
              </span>
            )}
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section ref={heroRevealRef} className={`nano-hero nano-scroll-reveal ${heroRevealClass}`} onPointerMove={handleHeroPointerMove} onPointerLeave={resetHeroPointer} style={{background:`linear-gradient(135deg,${C.offWhite} 0%,${C.white} 48%,${C.gray} 100%)`,padding:isMobile?"48px 20px 56px":"72px 32px 80px",textAlign:"center",position:"relative",overflow:"hidden",borderBottom:`1px solid ${C.gray}`}}>
        <div className="nano-hero-wash" style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(120deg,rgba(232,93,4,0.12),transparent 36%,rgba(13,13,13,0.06) 72%,rgba(255,255,255,0.3))"}}/>
        <div className="nano-hero-depth" aria-hidden="true">
          <span className="nano-depth-grid" />
          <span className="nano-depth-orbit nano-depth-orbit-one" />
          <span className="nano-depth-orbit nano-depth-orbit-two" />
          <span className="nano-depth-cube nano-depth-cube-one" />
          <span className="nano-depth-cube nano-depth-cube-two" />
          <span className="nano-depth-node nano-depth-node-one" />
          <span className="nano-depth-node nano-depth-node-two" />
        </div>
        <div className="nano-hero-content" style={{position:"relative",maxWidth:680,margin:"0 auto"}}>
          <span className="nano-pill" style={{display:"inline-block",background:"rgba(255,255,255,0.62)",color:C.orange,border:"1px solid rgba(232,93,4,0.24)",boxShadow:"0 8px 22px rgba(92,68,40,0.08)",padding:"5px 16px",borderRadius:20,fontFamily:"DM Sans, sans-serif",fontSize:11,letterSpacing:"2px",textTransform:"uppercase",marginBottom:18}}>3D Design Studio</span>
          <h1 className="nano-title" style={{margin:"0 0 16px",fontFamily:"Inter, sans-serif",fontWeight:800,fontSize:isMobile?"28px":"clamp(30px,5.5vw,52px)",color:C.black,lineHeight:1.15,letterSpacing:0}}>
            Premium 3D Models,<br/><span style={{color:C.orange}}>Crafted to Print</span>
          </h1>
          <p className="nano-copy" style={{margin:"0 0 28px",fontFamily:"DM Sans, sans-serif",fontSize:isMobile?15:17,color:C.darkGray,lineHeight:1.65,fontWeight:300,padding:isMobile?"0 8px":0}}>
            Ready-to-print STL files — fantasy figures, functional decor &amp; more. Prompt delivery after your enquiry.
          </p>
          <p style={{maxWidth:520,margin:"-10px auto 16px",fontFamily:"DM Sans, sans-serif",fontSize:isMobile?13:14,color:C.midGray,lineHeight:1.55}}>
Turn a favorite photo into a personalized figurine concept with a size chosen for your needs.
          </p>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",flexDirection:isMobile?"column":"row",gap:10}}>
            <a className="nano-cta" href="#products" style={{display:"inline-block",background:C.orange,color:C.white,textDecoration:"none",padding:isMobile?"12px 28px":"13px 32px",borderRadius:10,fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:isMobile?14:15,boxShadow:"0 12px 28px rgba(232,93,4,0.18)"}}>Browse Collection ↓</a>
            <button type="button" className="nano-cta" onClick={() => setFigurineOpen(true)} style={{display:"inline-block",background:C.black,color:C.white,border:`1px solid ${C.black}`,padding:isMobile?"12px 28px":"13px 32px",borderRadius:10,fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:isMobile?14:15,boxShadow:"0 12px 28px rgba(13,13,13,0.16)",cursor:"pointer"}}>Create Your Figurine ✦</button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div ref={categoryRevealRef} className={`nano-stats nano-scroll-reveal ${categoryRevealClass}`} style={{background:"rgba(248,247,244,0.82)",backdropFilter:"blur(10px)",borderBottom:`1px solid ${C.gray}`}}>
        <div style={{maxWidth:900,margin:"0 auto",display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)"}}>
          {[["50+","3D Models"],["100%","Print-Ready"],["Instant","Delivery"],["₹249+","Starting"]].map(([v,l],i)=>(
            <div className="nano-stat" key={i} style={{padding:isMobile?"14px 10px":"18px 36px",textAlign:"center",borderRight:isMobile?(i%2===0?`1px solid ${C.gray}`:"none"):(i<3?`1px solid ${C.gray}`:"none"),borderBottom:isMobile&&i<2?`1px solid ${C.gray}`:"none"}}>
              <div style={{fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:isMobile?18:20,color:C.orange}}>{v}</div>
              <div style={{fontFamily:"DM Sans, sans-serif",fontSize:11,color:C.midGray,marginTop:2,letterSpacing:"0.5px"}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Products */}
      <main id="products" style={{maxWidth:1100,margin:"0 auto",padding:isMobile?"32px 16px 60px":"52px 24px 80px"}}>
        <div className="nano-section-head" style={{display:"flex",alignItems:isMobile?"flex-start":"center",justifyContent:"space-between",marginBottom:24,flexDirection:isMobile?"column":"row",gap:14}}>
          <div>
            <h2 style={{margin:"0 0 4px",fontFamily:"Inter, sans-serif",fontWeight:800,fontSize:isMobile?22:26,color:C.black,letterSpacing:0}}>Our Collection</h2>
            <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.midGray}}>{filtered.length} model{filtered.length!==1?"s":""}</p>
          </div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {categories.map(cat=>(
              <button className="nano-filter" key={cat} onClick={()=>setFilter(cat)} style={{padding:isMobile?"6px 14px":"7px 16px",borderRadius:20,cursor:"pointer",fontFamily:"DM Sans, sans-serif",fontSize:isMobile?12:13,fontWeight:500,background:filter===cat?C.black:"rgba(248,247,244,0.86)",color:filter===cat?C.white:C.darkGray,border:`1px solid ${filter===cat?C.black:C.gray}`,boxShadow:filter===cat?"0 8px 18px rgba(13,13,13,0.12)":"none",transition:"all 0.2s"}}>{cat}</button>
            ))}
          </div>
        </div>
        {filtered.length===0
          ? <p style={{textAlign:"center",padding:"80px 0",fontFamily:"DM Sans, sans-serif",color:C.midGray}}>No products in this category yet.</p>
          : <div ref={gridRevealRef} className={`nano-product-grid nano-scroll-reveal ${gridRevealClass}`} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"repeat(2,1fr)":"repeat(auto-fill,minmax(280px,1fr))",gap:isMobile?16:24}}>
              {filtered.map((p,i)=><ProductCard key={p.id} product={p} imgCache={imgCache} variants={productVariants[p.id] || []} onClick={(product, variantId)=>{setSelected(product);setSelectedVariantId(variantId);}} onAddToCart={addToCart} cartQty={getCartQty(p.id)} index={i}/>)}
            </div>
        }
      </main>

      {/* Footer */}
      <footer ref={footerRevealRef} className={`nano-footer nano-scroll-reveal ${footerRevealClass}`} style={{background:`linear-gradient(135deg,${C.warmGlow} 0%,${C.coolMist} 100%)`,borderTop:`1px solid ${C.gray}`,padding:isMobile?"28px 16px":"36px 32px",textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:12}}><NanoLogo scale={isMobile?0.46:0.56}/></div>
        <p style={{margin:"0 0 16px",fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.midGray,lineHeight:1.7}}>Premium 3D design files for creators, hobbyists &amp; professionals.</p>

        <section style={{maxWidth:920,margin:"0 auto 22px",display:"grid",gridTemplateColumns:isMobile?"1fr":"0.9fr 1.1fr",gap:isMobile?14:18,textAlign:"left"}}>
          <form onSubmit={submitReview} style={{background:"rgba(255,255,255,0.84)",border:`1px solid ${C.gray}`,borderRadius:14,padding:isMobile?16:18,boxShadow:"0 12px 30px rgba(13,13,13,0.07)"}}>
            <h3 style={{margin:"0 0 5px",fontFamily:"Inter, sans-serif",fontSize:18,color:C.black,letterSpacing:0}}>Rate Your Experience</h3>
            <p style={{margin:"0 0 12px",fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.midGray,lineHeight:1.5}}>Share a quick comment and star rating.</p>
            <div style={{display:"flex",justifyContent:"flex-start",marginBottom:12}}>
              <ReviewStars value={reviewForm.rating} onChange={(rating)=>setReviewForm(prev=>({...prev, rating}))}/>
            </div>
            <input
              value={reviewForm.name}
              onChange={e=>setReviewForm(prev=>({...prev, name:e.target.value}))}
              placeholder="Your name"
              style={{width:"100%",boxSizing:"border-box",marginBottom:9,padding:"10px 12px",border:`1px solid ${C.gray}`,borderRadius:9,background:"#fff",fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.black,outline:"none"}}
            />
            <textarea
              value={reviewForm.comment}
              onChange={e=>setReviewForm(prev=>({...prev, comment:e.target.value}))}
              placeholder="Write your comment"
              rows={3}
              style={{width:"100%",boxSizing:"border-box",resize:"vertical",minHeight:76,marginBottom:10,padding:"10px 12px",border:`1px solid ${C.gray}`,borderRadius:9,background:"#fff",fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.black,outline:"none"}}
            />
            <button type="submit" style={{width:"100%",background:C.black,color:"#fff",border:"none",padding:"11px 16px",borderRadius:9,cursor:"pointer",fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:14}}>
              Submit Rating
            </button>
            {reviewMsg && <p style={{margin:"9px 0 0",fontFamily:"DM Sans, sans-serif",fontSize:12,color:C.orange,textAlign:"center"}}>{reviewMsg}</p>}
          </form>

          <div style={{background:"rgba(255,255,255,0.72)",border:`1px solid ${C.gray}`,borderRadius:14,padding:isMobile?16:18,boxShadow:"0 12px 30px rgba(13,13,13,0.06)"}}>
            <div style={{display:"flex",alignItems:isMobile?"flex-start":"center",justifyContent:"space-between",gap:12,marginBottom:12,flexDirection:isMobile?"column":"row"}}>
              <div>
                <h3 style={{margin:"0 0 4px",fontFamily:"Inter, sans-serif",fontSize:18,color:C.black,letterSpacing:0}}>Customer Ratings</h3>
                <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.midGray}}>
                  {reviews.length ? `${averageRating.toFixed(1)} out of 5 from ${reviews.length} review${reviews.length!==1?"s":""}` : "No ratings yet"}
                </p>
              </div>
              <ReviewStars value={Math.round(averageRating || 0)} size={20}/>
            </div>
            {reviews.length === 0 ? (
              <p style={{margin:"24px 0 6px",fontFamily:"DM Sans, sans-serif",fontSize:14,color:C.midGray,textAlign:"center"}}>Be the first customer to leave a rating.</p>
            ) : (
              <div style={{display:"grid",gap:10,maxHeight:260,overflowY:"auto",paddingRight:2}}>
                {reviews.map(review => (
                  <article key={review.id} style={{background:"#fff",border:`1px solid ${C.gray}`,borderRadius:11,padding:12}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:6}}>
                      <strong style={{fontFamily:"Inter, sans-serif",fontSize:14,color:C.black,letterSpacing:0}}>{review.name}</strong>
                      <span style={{fontFamily:"DM Sans, sans-serif",fontSize:11,color:C.midGray,whiteSpace:"nowrap"}}>{review.date}</span>
                    </div>
                    <div style={{justifyContent:"flex-start",display:"flex",marginBottom:6}}>
                      <ReviewStars value={review.rating} size={16}/>
                    </div>
                    <p style={{margin:0,fontFamily:"DM Sans, sans-serif",fontSize:13,color:C.darkGray,lineHeight:1.55}}>{review.comment}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:isMobile?12:20,flexWrap:"wrap"}}>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" style={{color:"#e6683c",textDecoration:"none",fontFamily:"DM Sans, sans-serif",fontSize:13,display:"flex",alignItems:"center",gap:6}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e6683c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#e6683c" stroke="none"/></svg>
            @nano.aakriti
          </a>
          <span style={{color:"rgba(13,13,13,0.22)"}}>·</span>
          <a href={GMAIL_COMPOSE_URL} style={{color:C.orange,textDecoration:"none",fontFamily:"DM Sans, sans-serif",fontSize:13,display:"flex",alignItems:"center",gap:6}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            {isMobile ? "Email" : CONTACT_EMAIL}
          </a>
        </div>
      </footer>

      <CartDrawer
        open={cartOpen}
        cartItems={cartItems}
        cartCount={cartCount}
        total={cartTotal}
        onClose={()=>setCartOpen(false)}
        onQty={updateCartQty}
        onRemove={removeFromCart}
        onClear={clearCart}
        onSendEnquiry={()=>{
          if (!cartItems.length) return;
          setCartOpen(false);
          openChat(null, cartEnquiryMessage);
        }}
      />

      {cartFeedback && (
        <div role="status" aria-live="polite" style={{position:"fixed",left:"50%",bottom:isMobile?86:24,zIndex:1300,transform:"translateX(-50%)",maxWidth:"calc(100vw - 32px)",padding:"10px 14px",borderRadius:9,background:C.black,color:C.white,fontFamily:"DM Sans, sans-serif",fontSize:12,fontWeight:600,boxShadow:"0 12px 30px rgba(13,13,13,0.22)",textAlign:"center",whiteSpace:"nowrap"}}>{cartFeedback}</div>
      )}

      <FigurineConfigurator open={figurineOpen} onClose={() => setFigurineOpen(false)} />

      <ChatWidget open={chatOpen} product={chatProduct} initialMessage={chatInitialMessage} onOpen={openChat} onClose={closeChat}/>

      {selected && <ProductModal product={selected} imgCache={imgCache} variants={productVariants[selected.id] || []} initialVariantId={selectedVariantId} onClose={()=>{setSelected(null);setSelectedVariantId(null);}} onAddToCart={addToCart} onMessageAboutProduct={(product)=>{setSelected(null);setSelectedVariantId(null);openChat(product);}} cartQty={getCartQty(selected.id)}/>} 
    </div>
  );
}
 
