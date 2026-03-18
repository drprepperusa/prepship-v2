// Carrier tracking URLs and expedited service detection

const CARRIERS = {
  usps: {
    name: 'USPS',
    trackingUrl: (tracking) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`,
  },
  ups: {
    name: 'UPS',
    trackingUrl: (tracking) => `https://www.ups.com/track?tracknum=${tracking}`,
  },
  fedex: {
    name: 'FedEx',
    trackingUrl: (tracking) => `https://tracking.fedex.com/en/track/${tracking}`,
  },
  dhl: {
    name: 'DHL',
    trackingUrl: (tracking) => `https://www.dhl.com/en-us/en/express/tracking.html?AWB=${tracking}`,
  },
};

const CARRIER_CODE_MAP = {
  'usps': CARRIERS.usps,
  'stamps_com': CARRIERS.usps,
  'ups': CARRIERS.ups,
  'ups_walleted': CARRIERS.ups,
  'fedex': CARRIERS.fedex,
  'fedex_walleted': CARRIERS.fedex,
  'dhl': CARRIERS.dhl,
  'dhl_walleted': CARRIERS.dhl,
};

const EXPEDITED_1DAY = new Set([
  'usps_priority_mail_express',
  'usps_priority_mail_express_am',
  'ups_next_day_air',
  'ups_next_day_air_early_am',
  'ups_next_day_air_saver',
  'fedex_overnight_express',
  'fedex_overnight_express_saver',
  'fedex_overnight_express_early_morning',
  'dhl_express_worldwide',
  'dhl_express_1030am',
  'dhl_express_0800am',
]);

const EXPEDITED_2DAY = new Set([
  'ups_2nd_day_air',
  'ups_2nd_day_air_am',
  'fedex_2day',
  'fedex_2day_am',
]);

function getCarrierByCode(carrierCode) {
  return CARRIER_CODE_MAP[carrierCode] || null;
}

function getTrackingUrl(carrierCode, tracking) {
  const carrier = getCarrierByCode(carrierCode);
  if (!carrier || !tracking) return null;
  return carrier.trackingUrl(tracking);
}

function getExpedited(serviceCode) {
  if (!serviceCode) return null;
  if (EXPEDITED_1DAY.has(serviceCode)) return '1-day';
  if (EXPEDITED_2DAY.has(serviceCode)) return '2-day';
  return null;
}

export { getTrackingUrl, getExpedited, getCarrierByCode };
window.getTrackingUrl = getTrackingUrl;
