import { escHtml, trunc } from './utils.js';

// ═══════════════════════════════════════════════
//  COLUMNS — mutable (user can reorder/resize)
// ═══════════════════════════════════════════════
export const COLS = [
  { key:'select',    label:'',                   width:34,  toggleable:false, sort:null       },
  { key:'date',      label:'Order Date',          width:90,  toggleable:true,  sort:'date'     },
  { key:'client',    label:'Client',              width:100, toggleable:true,  sort:'client'   },
  { key:'orderNum',  label:'Order #',             width:85,  toggleable:false, sort:'orderNum' },
  { key:'customer',  label:'Recipient',           width:175, toggleable:true,  sort:'customer' },
  { key:'itemname',  label:'Item Name',           width:170, toggleable:true,  sort:'itemname' },
  { key:'sku',       label:'SKU',                 width:100, toggleable:true,  sort:'sku'      },
  { key:'qty',       label:'Qty',                 width:44,  toggleable:true,  sort:'qty'      },
  { key:'weight',    label:'Weight',              width:80,  toggleable:true,  sort:'weight'   },
  { key:'shipto',    label:'Ship To',             width:135, toggleable:true,  sort:'shipto'   },
  { key:'carrier',   label:'Carrier',             width:145, toggleable:true,  sort:'carrier'  },
  { key:'custcarrier',label:'Shipping Account',   width:140, toggleable:true,  sort:'custcarrier'},
  { key:'total',     label:'Order Total',         width:85,  toggleable:true,  sort:'total'    },
  { key:'bestrate',  label:'Best Rate',           width:105, toggleable:true,  sort:null       },
  { key:'margin',    label:'Ship Margin',         width:90,  toggleable:true,  sort:null       },
  { key:'tracking',  label:'Tracking #',          width:160, toggleable:true,  sort:null       },
  { key:'age',       label:'Age',                 width:50,  toggleable:true,  sort:'age'      },
  // === TESTING COLUMNS (diagnostic data) ===
  { key:'test_carrierCode',      label:'Carrier Code',        width:120, toggleable:true, sort:null },
  { key:'test_shippingProviderID', label:'Provider ID',       width:110, toggleable:true, sort:null },
  { key:'test_clientID',         label:'Client ID',           width:90,  toggleable:true, sort:null },
  { key:'test_serviceCode',      label:'Service Code',        width:130, toggleable:true, sort:null },
  { key:'test_bestRate',         label:'Best Rate (awaiting)', width:200, toggleable:true, sort:null },
  { key:'test_orderLocal',       label:'Order Local',         width:140, toggleable:true, sort:null },
  { key:'test_shippingAccount',  label:'Acct Nickname',       width:120, toggleable:true, sort:null },
];

// ═══════════════════════════════════════════════
//  BLOCKED SERVICES / PACKAGES
// ═══════════════════════════════════════════════
export const BLOCKED_SERVICE_CODES = new Set([
  'usps_media_mail',
  'usps_first_class_mail',
  'usps_library_mail',
  'usps_parcel_select',
  'usps_parcel_select_lightweight',
]);

export const BLOCKED_PACKAGE_TYPES = new Set([
  'flat_rate_envelope',
  'flat_rate_legal_envelope',
  'flat_rate_padded_envelope',
  'small_flat_rate_box',
  'medium_flat_rate_box',
  'large_flat_rate_box',
  'regional_rate_box_a',
  'regional_rate_box_b',
]);

export const BLOCKED_NAME_RE = /flat[\s-]?rate|\bbox\b/i;

// Stores allowed to use services that are otherwise blocked
export const MEDIA_MAIL_ALLOWED_STORES = new Set([376759]); // Heritage Kids Press (books eligible)

export function isBlockedRate(r, storeId = null) {
  // Per-store exceptions: allow Media Mail for book-eligible clients
  // Note: storeId can be string or number from JSON parsing, so coerce to number for Set comparison
  if (r.serviceCode === 'usps_media_mail' && storeId && MEDIA_MAIL_ALLOWED_STORES.has(parseInt(storeId))) return false;
  return BLOCKED_SERVICE_CODES.has(r.serviceCode) ||
    BLOCKED_PACKAGE_TYPES.has(r.packageType || '') ||
    BLOCKED_NAME_RE.test(r.serviceName || '');
}

// ═══════════════════════════════════════════════
//  CARRIER SERVICES
// ═══════════════════════════════════════════════
export const CARRIER_SERVICES = {
  stamps_com: [
    { code:'usps_media_mail',           label:'USPS Media Mail' },
    { code:'usps_first_class_mail',     label:'USPS First Class Mail' },
    { code:'usps_ground_advantage',     label:'USPS Ground Advantage' },
    { code:'usps_priority_mail',        label:'USPS Priority Mail' },
    { code:'usps_priority_mail_express',label:'USPS Priority Express' },
    { code:'usps_parcel_select',        label:'USPS Parcel Select' },
  ],
  ups: [
    { code:'ups_ground',                    label:'UPS Ground' },
    { code:'ups_ground_saver',              label:'UPS Ground Saver' },
    { code:'ups_surepost_less_than_1_lb',   label:'UPS SurePost (<1 lb)' },
    { code:'ups_surepost_1_lb_or_greater',  label:'UPS SurePost (≥1 lb)' },
    { code:'ups_3_day_select',              label:'UPS 3 Day Select' },
    { code:'ups_2nd_day_air',               label:'UPS 2nd Day Air' },
    { code:'ups_2nd_day_air_am',            label:'UPS 2nd Day Air AM' },
    { code:'ups_next_day_air_saver',        label:'UPS Next Day Air Saver' },
    { code:'ups_next_day_air',              label:'UPS Next Day Air' },
    { code:'ups_next_day_air_early_am',     label:'UPS Next Day Air Early AM' },
  ],
  ups_walleted: [
    { code:'ups_ground',                    label:'UPS Ground' },
    { code:'ups_ground_saver',              label:'UPS Ground Saver' },
    { code:'ups_surepost_less_than_1_lb',   label:'UPS SurePost (<1 lb)' },
    { code:'ups_surepost_1_lb_or_greater',  label:'UPS SurePost (≥1 lb)' },
    { code:'ups_3_day_select',              label:'UPS 3 Day Select' },
    { code:'ups_2nd_day_air',               label:'UPS 2nd Day Air' },
    { code:'ups_next_day_air_saver',        label:'UPS Next Day Air Saver' },
    { code:'ups_next_day_air',              label:'UPS Next Day Air' },
  ],
  fedex: [
    { code:'fedex_ground',            label:'FedEx Ground' },
    { code:'fedex_home_delivery',     label:'FedEx Home Delivery' },
    { code:'fedex_2day',              label:'FedEx 2Day' },
    { code:'fedex_express_saver',     label:'FedEx Express Saver' },
    { code:'fedex_priority_overnight',label:'FedEx Priority Overnight' },
    { code:'fedex_standard_overnight',label:'FedEx Standard Overnight' },
  ],
  fedex_walleted: [
    { code:'fedex_ground',            label:'FedEx Ground' },
    { code:'fedex_home_delivery',     label:'FedEx Home Delivery' },
    { code:'fedex_2day',              label:'FedEx 2Day' },
    { code:'fedex_express_saver',     label:'FedEx Express Saver' },
    { code:'fedex_priority_overnight',label:'FedEx Priority Overnight' },
    { code:'fedex_standard_overnight',label:'FedEx Standard Overnight' },
  ],
};

export const CARRIER_NAMES = {
  stamps_com:'USPS', ups:'UPS', ups_walleted:'UPS', fedex:'FedEx', fedex_walleted:'FedEx',
  dhl_express:'DHL', asendia_us:'Asendia', ontrac:'OnTrac', lasership:'LaserShip',
  amazon_swa:'Amazon', globegistics:'Globegistics',
};

export const SERVICE_NAMES = {
  // USPS
  usps_priority_mail:            'Priority Mail',
  usps_priority_mail_express:    'Priority Express',
  usps_first_class_mail:         'First Class',
  usps_ground_advantage:         'Ground Advantage',
  usps_media_mail:               'Media Mail',
  usps_library_mail:             'Library Mail',
  usps_parcel_select:            'Parcel Select',
  // UPS
  ups_ground:                    'UPS Ground',
  ups_ground_saver:              'UPS Ground Saver',
  ups_surepost:                  'UPS SurePost',
  ups_surepost_1_lb_or_greater:  'UPS SurePost (≥1 lb)',
  ups_surepost_less_than_1_lb:   'UPS SurePost (<1 lb)',
  ups_3_day_select:              'UPS 3 Day Select',
  ups_2nd_day_air:               'UPS 2nd Day Air',
  ups_2nd_day_air_am:            'UPS 2nd Day Air AM',
  ups_next_day_air_saver:        'UPS Next Day Air Saver',
  ups_next_day_air:              'UPS Next Day Air',
  ups_next_day_air_early_am:     'UPS Next Day Air Early AM',
  ups_worldwide_express:         'UPS Worldwide Express',
  // FedEx
  fedex_ground:                  'FedEx Ground',
  fedex_home_delivery:           'FedEx Home Delivery',
  fedex_2day:                    'FedEx 2Day',
  fedex_2day_am:                 'FedEx 2Day AM',
  fedex_2_day:                   'FedEx 2Day',
  fedex_express_saver:           'FedEx Express Saver',
  fedex_priority_overnight:      'FedEx Priority Overnight',
  fedex_standard_overnight:      'FedEx Standard Overnight',
  fedex_first_overnight:         'FedEx First Overnight',
};

// Inline SVG data URIs
export const CARRIER_LOGOS = {
  ups: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120'%3E%3Cpath d='M50 2C25 2 4 20 4 48v28c0 22 20 42 46 42s46-20 46-42V48C96 20 75 2 50 2z' fill='%23351C15'/%3E%3Cpath d='M50 8c-22 0-40 16-40 40v28c0 19 18 36 40 36s40-17 40-36V48C90 24 72 8 50 8z' fill='%23FFB500'/%3E%3Cpath d='M50 14c-19 0-34 14-34 34v28c0 16 15 30 34 30s34-14 34-30V48c0-20-15-34-34-34z' fill='%23351C15'/%3E%3Cpath d='M35 42h8v26c0 4 3 6 7 6s7-2 7-6V42h8v28c0 8-7 14-15 14s-15-6-15-14V42z' fill='%23FFB500'/%3E%3C/svg%3E",
  ups_walleted: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120'%3E%3Cpath d='M50 2C25 2 4 20 4 48v28c0 22 20 42 46 42s46-20 46-42V48C96 20 75 2 50 2z' fill='%23351C15'/%3E%3Cpath d='M50 8c-22 0-40 16-40 40v28c0 19 18 36 40 36s40-17 40-36V48C90 24 72 8 50 8z' fill='%23FFB500'/%3E%3Cpath d='M50 14c-19 0-34 14-34 34v28c0 16 15 30 34 30s34-14 34-30V48c0-20-15-34-34-34z' fill='%23351C15'/%3E%3Cpath d='M35 42h8v26c0 4 3 6 7 6s7-2 7-6V42h8v28c0 8-7 14-15 14s-15-6-15-14V42z' fill='%23FFB500'/%3E%3C/svg%3E",
  stamps_com: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 60'%3E%3Crect width='100' height='60' rx='6' fill='%23004B87'/%3E%3Ctext x='50' y='38' font-family='Arial,sans-serif' font-size='22' font-weight='bold' fill='white' text-anchor='middle'%3EUSPS%3C/text%3E%3C/svg%3E",
  fedex: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 50'%3E%3Ctext x='2' y='38' font-family='Arial,sans-serif' font-size='36' font-weight='bold'%3E%3Ctspan fill='%234D148C'%3EFed%3C/tspan%3E%3Ctspan fill='%23FF6600'%3EEx%3C/tspan%3E%3C/text%3E%3C/svg%3E",
  fedex_walleted: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 50'%3E%3Ctext x='2' y='38' font-family='Arial,sans-serif' font-size='36' font-weight='bold'%3E%3Ctspan fill='%234D148C'%3EFed%3C/tspan%3E%3Ctspan fill='%23FF6600'%3EEx%3C/tspan%3E%3C/text%3E%3C/svg%3E",
};

export function carrierLogo(cc, size) {
  // Safety: handle undefined or null carrier code
  if (!cc) {
    console.warn('[carrierLogo] Undefined carrier code passed');
    return `<span class="carrier-badge carrier-other" style="font-size:9.5px;padding:1px 5px">—</span>`;
  }
  const cl = cc.includes('ups') ? 'carrier-ups'
    : cc.includes('fedex') ? 'carrier-fedex'
    : (cc.includes('stamps') || cc.includes('usps')) ? 'carrier-usps'
    : 'carrier-other';
  const lbl = CARRIER_NAMES[cc] || cc.toUpperCase();
  return `<span class="carrier-badge ${cl}" style="font-size:9.5px;padding:1px 5px">${lbl}</span>`;
}

export function fmtCarrier(o) {
  const cc = o.carrierCode || '';
  const sc = o.serviceCode || '';
  if (!cc && !sc) return '<span style="color:var(--text3)">—</span>';
  let carrierLabel = CARRIER_NAMES[cc];
  if (!carrierLabel) {
    carrierLabel = cc.replace(/^custom_?/i, '').replace(/_/g, ' ').toUpperCase() || cc.toUpperCase();
  }
  const svcLabel = SERVICE_NAMES[sc] || sc.replace(/_/g, ' ');
  return `<div style="display:flex;align-items:center;gap:6px;line-height:1.3">
    ${carrierLogo(cc, 18)}
    <span style="font-size:10px;color:var(--text2)">${escHtml(trunc(svcLabel, 26)) || '—'}</span>
  </div>`;
}

// ═══════════════════════════════════════════════
//  CENTRALIZED CARRIER DISPLAY LOGIC
// ═══════════════════════════════════════════════
// Formats carrier account name for display across all views (panel, table, rate browser)
// Priority chain ensures consistent display: account nickname > generic carrier type > unknown
export function formatCarrierDisplay(rate, fallbackCode = 'Unknown') {
  if (!rate) return fallbackCode;
  
  // Priority 1: Explicit carrier nickname from v2 API
  if (rate.carrierNickname && !rate.carrierNickname.startsWith('se-')) {
    return rate.carrierNickname;
  }

  // Priority 2: Label from carrier lookup (if not system ID)
  if (rate._label && !rate._label.startsWith('se-')) {
    return rate._label;
  }

  // Priority 3: Generic carrier code name
  const genericName = CARRIER_NAMES[rate.carrierCode];
  if (genericName) {
    return genericName;
  }
  
  // Fallback: return provided fallback or unknown
  return fallbackCode;
}

// ═══════════════════════════════════════════════
//  CLIENT BADGE COLORS
// ═══════════════════════════════════════════════
const CLIENT_PALETTES = [
  { bg:'#dbeafe', color:'#1e40af', border:'#93c5fd' },
  { bg:'#dcfce7', color:'#166534', border:'#86efac' },
  { bg:'#fce7f3', color:'#9d174d', border:'#f9a8d4' },
  { bg:'#fef9c3', color:'#854d0e', border:'#fde047' },
  { bg:'#f3e8ff', color:'#6b21a8', border:'#c4b5fd' },
  { bg:'#ffe4e6', color:'#9f1239', border:'#fda4af' },
  { bg:'#e0f2fe', color:'#075985', border:'#7dd3fc' },
  { bg:'#f0fdf4', color:'#14532d', border:'#4ade80' },
  { bg:'#fff7ed', color:'#9a3412', border:'#fdba74' },
  { bg:'#f1f5f9', color:'#334155', border:'#94a3b8' },
];

const _clientColorCache = {};

export function clientPalette(name) {
  if (!_clientColorCache[name]) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    _clientColorCache[name] = CLIENT_PALETTES[h % CLIENT_PALETTES.length];
  }
  return _clientColorCache[name];
}

export function clientBadge(name) {
  const p = clientPalette(name);
  return `<span class="client-badge" style="background:${p.bg};color:${p.color};border-color:${p.border}">${escHtml(trunc(name, 14))}</span>`;
}

// ═══════════════════════════════════════════════
//  TRANSIT TIME ESTIMATES
// ═══════════════════════════════════════════════
export const SERVICE_TRANSIT = {
  ups_ground:                    '1–5 days',
  ups_ground_saver:              '2–5 days',
  ups_surepost_less_than_1_lb:   '2–7 days',
  ups_surepost_1_lb_or_greater:  '2–7 days',
  ups_3_day_select:              '3 days',
  ups_2nd_day_air:               '2 days',
  ups_2nd_day_air_am:            '2 days (AM)',
  ups_next_day_air_saver:        '1 day',
  ups_next_day_air:              '1 day',
  ups_next_day_air_early_am:     '1 day (early)',
  usps_media_mail:               '2–8 days',
  usps_first_class_mail:         '1–3 days',
  usps_ground_advantage:         '2–5 days',
  usps_priority_mail:            '1–3 days',
  usps_priority_mail_express:    '1–2 days',
  usps_parcel_select:            '2–9 days',
  fedex_ground:                  '1–5 days',
  fedex_home_delivery:           '1–5 days',
  fedex_2day:                    '2 days',
  fedex_2day_am:                 '2 days (AM)',
  fedex_express_saver:           '3 days',
  fedex_standard_overnight:      '1 day',
  fedex_priority_overnight:      '1 day (early)',
  fedex_first_overnight:         '1 day (earliest)',
};

// ═══════════════════════════════════════════════
//  PANEL PRESETS
// ═══════════════════════════════════════════════
export const PRESETS = {
  'Small':         { lb:0, oz:8,  len:8,  wid:6,  hgt:2  },
  'Medium':        { lb:1, oz:0,  len:12, wid:9,  hgt:4  },
  'Large':         { lb:2, oz:0,  len:16, wid:12, hgt:6  },
  'Poly Mailer S': { lb:0, oz:8,  len:10, wid:13, hgt:0  },
  'Poly Mailer L': { lb:1, oz:0,  len:14, wid:17, hgt:0  },
};
