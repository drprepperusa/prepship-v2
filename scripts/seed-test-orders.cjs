#!/usr/bin/env node
/**
 * seed-test-orders.cjs
 * Creates fake awaiting_shipment orders for batch + print testing.
 * Uses clientId=11 (Test Client) and orderId range 9_000_001–9_000_050
 * so they never conflict with real ShipStation orders.
 *
 * Usage:
 *   node scripts/seed-test-orders.cjs         # insert 10 test orders
 *   node scripts/seed-test-orders.cjs 25      # insert 25 test orders
 *   node scripts/seed-test-orders.cjs --clear # delete all test orders
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', '.openclaw', 'workspace', 'prepship', 'prepship.db');
const TEST_CLIENT_ID  = 11;
const TEST_ORDER_ID_BASE = 9_000_001;
const TEST_STORE_ID   = 999999; // fake store, won't hit SS API

const NAMES = [
  ['Alice','Johnson','Los Angeles','CA','90001'],
  ['Bob','Martinez','New York','NY','10001'],
  ['Carol','Williams','Chicago','IL','60601'],
  ['David','Brown','Houston','TX','77001'],
  ['Eva','Davis','Phoenix','AZ','85001'],
  ['Frank','Wilson','Philadelphia','PA','19101'],
  ['Grace','Moore','San Antonio','TX','78201'],
  ['Henry','Taylor','San Diego','CA','92101'],
  ['Iris','Anderson','Dallas','TX','75201'],
  ['Jake','Thomas','San Jose','CA','95101'],
  ['Karen','Jackson','Austin','TX','73301'],
  ['Leo','White','Jacksonville','FL','32099'],
  ['Maya','Harris','Columbus','OH','43085'],
  ['Nate','Martin','Charlotte','NC','28201'],
  ['Olivia','Garcia','Denver','CO','80201'],
  ['Paul','Lee','Seattle','WA','98101'],
  ['Quinn','Thompson','Nashville','TN','37201'],
  ['Rose','Robinson','Louisville','KY','40201'],
  ['Sam','Clark','Portland','OR','97201'],
  ['Tina','Lewis','Oklahoma City','OK','73101'],
  ['Uma','Walker','Las Vegas','NV','89101'],
  ['Victor','Hall','Memphis','TN','38101'],
  ['Wendy','Allen','Milwaukee','WI','53201'],
  ['Xavier','Young','Albuquerque','NM','87101'],
  ['Yara','Hernandez','Tucson','AZ','85701'],
];

const PRODUCTS = [
  { sku: 'TEST-RAMEN-001', name: 'Samyang 2x Spicy Buldak Ramen 5-Pack', weightOz: 28, price: 12.99, serviceCode: 'usps_priority_mail', carrierCode: 'stamps_com' },
  { sku: 'TEST-RAMEN-002', name: 'Samyang Carbo Buldak Ramen 5-Pack',    weightOz: 25, price: 11.99, serviceCode: 'usps_priority_mail', carrierCode: 'stamps_com' },
  { sku: 'TEST-RAMEN-003', name: 'Samyang Cheese Buldak Ramen 5-Pack',   weightOz: 24, price: 11.99, serviceCode: 'usps_priority_mail', carrierCode: 'stamps_com' },
  { sku: 'TEST-BOOK-001',  name: 'Test Book — Heritage Kids Vol. 1',      weightOz: 12, price: 18.00, serviceCode: 'usps_first_class_mail', carrierCode: 'stamps_com' },
  { sku: 'TEST-BOOK-002',  name: 'Test Book — Heritage Kids Vol. 2',      weightOz: 14, price: 20.00, serviceCode: 'usps_first_class_mail', carrierCode: 'stamps_com' },
];

const DIMS = [
  { l: 10, w: 7,  h: 4 },
  { l: 12, w: 8,  h: 5 },
  { l: 9,  w: 6,  h: 3 },
  { l: 14, w: 10, h: 6 },
];

function makeOrder(i) {
  const orderId   = TEST_ORDER_ID_BASE + i;
  const nameEntry = NAMES[i % NAMES.length];
  const product   = PRODUCTS[i % PRODUCTS.length];
  const dims      = DIMS[i % DIMS.length];
  const qty       = (i % 3) + 1;
  const [first, last, city, state, zip] = nameEntry;
  const orderDate = new Date(Date.now() - (i * 3_600_000)).toISOString();

  const raw = {
    orderId,
    orderNumber: `TEST-${String(i + 1).padStart(3, '0')}`,
    orderKey: `test-key-${orderId}`,
    orderDate,
    createDate: orderDate,
    modifyDate: orderDate,
    paymentDate: orderDate,
    shipByDate: null,
    orderStatus: 'awaiting_shipment',
    customerId: null,
    customerUsername: `testuser${i + 1}`,
    customerEmail: `test${i + 1}@example.com`,
    billTo: { name: 'TESTING', company: null, street1: 'TESTING', city, state, postalCode: zip, country: 'US', phone: null, residential: true },
    shipTo: {
      name: 'TESTING', company: null,
      street1: 'TESTING', street2: null, street3: null,
      city, state, postalCode: zip, country: 'US',
      phone: null, residential: true,
      addressVerified: 'Address validated successfully',
    },
    items: [{
      orderItemId: orderId * 10,
      lineItemKey: String(orderId * 10),
      sku: product.sku,
      name: product.name,
      imageUrl: null,
      weight: { value: product.weightOz, units: 'ounces', WeightUnits: 1 },
      quantity: qty,
      unitPrice: product.price,
      taxAmount: 0,
      shippingAmount: 0,
      warehouseLocation: null,
      options: [],
      productId: orderId,
      fulfillmentSku: null,
      adjustment: false,
      upc: null,
      createDate: orderDate,
      modifyDate: orderDate,
    }],
    orderTotal: parseFloat((product.price * qty).toFixed(2)),
    amountPaid: parseFloat((product.price * qty).toFixed(2)),
    taxAmount: 0,
    shippingAmount: 4.99,
    customerNotes: '',
    internalNotes: 'SEED TEST ORDER — safe to delete',
    gift: false,
    giftMessage: null,
    paymentMethod: 'Other',
    requestedShippingService: product.serviceCode === 'usps_priority_mail' ? 'USPS Priority Mail' : 'USPS First Class',
    carrierCode: product.carrierCode || 'stamps_com',
    serviceCode: product.serviceCode || 'usps_first_class_mail',
    packageCode: 'package',
    confirmation: 'none',
    shipDate: null,
    holdUntilDate: null,
    weight: { value: product.weightOz * qty, units: 'ounces', WeightUnits: 1 },
    dimensions: { units: 'inches', length: dims.l, width: dims.w, height: dims.h },
    insuranceOptions: { provider: 'carrier', insureShipment: false, insuredValue: 0 },
    internationalOptions: { contents: null, customsItems: null, nonDelivery: null },
    advancedOptions: {
      warehouseId: null, nonMachinable: false, saturdayDelivery: false,
      containsAlcohol: false, mergedOrSplit: false, mergedIds: [],
      parentId: null, storeId: TEST_STORE_ID,
      customField1: 'TEST', customField2: null, customField3: null,
      source: 'TestSeed',
      billToParty: null, billToAccount: null, billToPostalCode: null,
      billToCountryCode: null, billToMyOtherAccount: null,
    },
    tagIds: null,
    userId: null,
    externallyFulfilled: false,
    externallyFulfilledBy: null,
    externallyFulfilledById: null,
    externallyFulfilledByName: null,
    labelMessages: null,
  };

  return {
    orderId,
    orderNumber:      raw.orderNumber,
    orderStatus:      'awaiting_shipment',
    orderDate,
    storeId:          TEST_STORE_ID,
    customerEmail:    raw.customerEmail,
    shipToName:       'TESTING',
    shipToCity:       city,
    shipToState:      state,
    shipToPostalCode: zip,
    carrierCode:      raw.carrierCode,
    serviceCode:      raw.serviceCode,
    weightValue:      raw.weight.value,
    orderTotal:       raw.orderTotal,
    shippingAmount:   raw.shippingAmount,
    items:            JSON.stringify(raw.items),
    raw:              JSON.stringify(raw),
    updatedAt:        Date.now(),
    clientId:         TEST_CLIENT_ID,
  };
}

// ── Batch groups: orders that share zip+weight+dims so they batch together ──
const TEST_BATCH_ID_BASE = 9_001_001;

const BATCH_GROUPS = [
  // Group A: 5 orders → Los Angeles, 28oz, 10x7x4
  { count: 5, zip: '90001', city: 'Los Angeles', state: 'CA', weightOz: 28, dims: { l: 10, w: 7,  h: 4 }, sku: 'TEST-RAMEN-001', skuName: 'Samyang 2x Spicy Buldak Ramen 5-Pack', price: 12.99, label: 'A', serviceCode: 'usps_priority_mail' },
  // Group B: 4 orders → New York, 25oz, 12x8x5
  { count: 4, zip: '10001', city: 'New York',    state: 'NY', weightOz: 25, dims: { l: 12, w: 8,  h: 5 }, sku: 'TEST-RAMEN-002', skuName: 'Samyang Carbo Buldak Ramen 5-Pack',    price: 11.99, label: 'B', serviceCode: 'usps_priority_mail' },
  // Group C: 3 orders → Chicago, 14oz, 9x6x3
  { count: 3, zip: '60601', city: 'Chicago',     state: 'IL', weightOz: 14, dims: { l: 9,  w: 6,  h: 3 }, sku: 'TEST-BOOK-002',  skuName: 'Test Book — Heritage Kids Vol. 2',      price: 20.00, label: 'C' },
  // Group D: 3 orders → Houston, 24oz, 10x7x4
  { count: 3, zip: '77001', city: 'Houston',     state: 'TX', weightOz: 24, dims: { l: 10, w: 7,  h: 4 }, sku: 'TEST-RAMEN-003', skuName: 'Samyang Cheese Buldak Ramen 5-Pack',   price: 11.99, label: 'D', serviceCode: 'usps_priority_mail' },
];

const BATCH_NAMES = [
  ['Alice','Johnson'],['Bob','Martinez'],['Carol','Williams'],
  ['David','Brown'],['Eva','Davis'],['Frank','Wilson'],
  ['Grace','Moore'],['Henry','Taylor'],['Iris','Anderson'],
  ['Jake','Thomas'],['Karen','Jackson'],['Leo','White'],
  ['Maya','Harris'],['Nate','Martin'],['Olivia','Garcia'],
];

function makeBatchOrder(orderId, group, nameIdx) {
  const [first, last] = BATCH_NAMES[nameIdx % BATCH_NAMES.length];
  const orderDate = new Date(Date.now() - (orderId - TEST_BATCH_ID_BASE) * 600_000).toISOString();

  const raw = {
    orderId,
    orderNumber: `BATCH-${group.label}-${String(nameIdx + 1).padStart(3, '0')}`,
    orderKey: `batch-key-${orderId}`,
    orderDate,
    createDate: orderDate,
    modifyDate: orderDate,
    paymentDate: orderDate,
    orderStatus: 'awaiting_shipment',
    customerEmail: `batch${orderId}@example.com`,
    billTo: { name: 'TESTING', street1: 'TESTING', city: group.city, state: group.state, postalCode: group.zip, country: 'US', phone: null, residential: true },
    shipTo: {
      name: 'TESTING', company: null,
      street1: 'TESTING', street2: null, street3: null,
      city: group.city, state: group.state, postalCode: group.zip, country: 'US',
      phone: null, residential: true,
      addressVerified: 'Address validated successfully',
    },
    items: [{
      orderItemId: orderId * 10,
      lineItemKey: String(orderId * 10),
      sku: group.sku,
      name: group.skuName,
      weight: { value: group.weightOz, units: 'ounces', WeightUnits: 1 },
      quantity: 1,
      unitPrice: group.price,
    }],
    orderTotal: group.price,
    amountPaid: group.price,
    shippingAmount: 4.99,
    weight: { value: group.weightOz, units: 'ounces', WeightUnits: 1 },
    dimensions: { units: 'inches', length: group.dims.l, width: group.dims.w, height: group.dims.h },
    advancedOptions: { storeId: TEST_STORE_ID, source: 'BatchSeed' },
    internalNotes: `SEED BATCH TEST GROUP-${group.label} — safe to delete`,
    externallyFulfilled: false,
  };

  return {
    orderId,
    orderNumber:      raw.orderNumber,
    orderStatus:      'awaiting_shipment',
    orderDate,
    storeId:          TEST_STORE_ID,
    customerEmail:    raw.customerEmail,
    shipToName:       'TESTING',
    shipToCity:       group.city,
    shipToState:      group.state,
    shipToPostalCode: group.zip,
    carrierCode:      'stamps_com',
    serviceCode:      group.serviceCode || 'usps_first_class_mail',
    weightValue:      group.weightOz,
    orderTotal:       group.price,
    shippingAmount:   4.99,
    items:            JSON.stringify(raw.items),
    raw:              JSON.stringify(raw),
    updatedAt:        Date.now(),
    clientId:         TEST_CLIENT_ID,
  };
}

// ── main ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const db   = new DatabaseSync(DB_PATH);

if (args.includes('--clear')) {
  const del = db.prepare(`DELETE FROM orders WHERE clientId = ? AND orderId >= ?`);
  const res = del.run(TEST_CLIENT_ID, TEST_ORDER_ID_BASE);
  db.prepare(`DELETE FROM order_local WHERE orderId >= ?`).run(TEST_ORDER_ID_BASE);
  console.log(`Deleted ${res.changes} test orders.`);
  process.exit(0);
}

if (args.includes('--batch')) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO orders
      (orderId, orderNumber, orderStatus, orderDate, storeId, customerEmail,
       shipToName, shipToCity, shipToState, shipToPostalCode, carrierCode, serviceCode,
       weightValue, orderTotal, shippingAmount, items, raw, updatedAt, clientId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let cursor = 0;
  let total  = 0;
  for (const group of BATCH_GROUPS) {
    for (let j = 0; j < group.count; j++) {
      const orderId = TEST_BATCH_ID_BASE + cursor;
      const o = makeBatchOrder(orderId, group, j);
      insert.run(
        o.orderId, o.orderNumber, o.orderStatus, o.orderDate, o.storeId, o.customerEmail,
        o.shipToName, o.shipToCity, o.shipToState, o.shipToPostalCode, o.carrierCode, o.serviceCode,
        o.weightValue, o.orderTotal, o.shippingAmount, o.items, o.raw, o.updatedAt, o.clientId
      );
      cursor++;
      total++;
    }
    console.log(`  Group ${group.label}: ${group.count} orders → ${group.city} ${group.zip}, ${group.weightOz}oz, ${group.dims.l}x${group.dims.w}x${group.dims.h}`);
  }
  console.log(`\nInserted ${total} batch test orders (orderId ${TEST_BATCH_ID_BASE}–${TEST_BATCH_ID_BASE + total - 1})`);
  console.log(`Order numbers: BATCH-A-001..005, BATCH-B-001..004, BATCH-C-001..003, BATCH-D-001..003`);
  console.log(`Remove with: node scripts/seed-test-orders.cjs --clear`);
  process.exit(0);
}

const count = parseInt(args[0]) || 10;

const insert = db.prepare(`
  INSERT OR REPLACE INTO orders
    (orderId, orderNumber, orderStatus, orderDate, storeId, customerEmail,
     shipToName, shipToCity, shipToState, shipToPostalCode, carrierCode, serviceCode,
     weightValue, orderTotal, shippingAmount, items, raw, updatedAt, clientId)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (let i = 0; i < count; i++) {
  const o = makeOrder(i);
  insert.run(
    o.orderId, o.orderNumber, o.orderStatus, o.orderDate, o.storeId, o.customerEmail,
    o.shipToName, o.shipToCity, o.shipToState, o.shipToPostalCode, o.carrierCode, o.serviceCode,
    o.weightValue, o.orderTotal, o.shippingAmount, o.items, o.raw, o.updatedAt, o.clientId
  );
}

console.log(`Inserted ${count} test orders (clientId=${TEST_CLIENT_ID}, orderIds ${TEST_ORDER_ID_BASE}–${TEST_ORDER_ID_BASE + count - 1})`);
console.log(`Filter by "Test Orders" in the Clients dropdown to see them.`);
console.log(`Remove with: node scripts/seed-test-orders.cjs --clear`);
