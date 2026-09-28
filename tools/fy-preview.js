/* One-off demo: ranks a realistic 50-listing island feed and prints what the
   For You page would show, next to Newest First, so the difference is visible. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'for-you.js'), 'utf8');
const CATS = [
  { id: 'vehicles', name: 'Vehicles', icon: '🚗' }, { id: 'electronics', name: 'Electronics', icon: '📱' },
  { id: 'property', name: 'Property', icon: '🏠' }, { id: 'furniture', name: 'Furniture', icon: '🛋️' },
  { id: 'jobs', name: 'Jobs', icon: '💼' }, { id: 'services', name: 'Services', icon: '🔧' },
];
const PARISHES = ['Kingston', 'St. Andrew', 'St. Ann', 'St. James', 'Manchester', 'Clarendon'];
const DAY = 86400000, NOW = Date.now();
const iso = d => new Date(NOW - d * DAY).toISOString();

/* title, category, parish, price, days old, views, photos, descLen, seller */
const ROWS = [
  ['Toyota Vitz 2014 clean', 'vehicles', 'Kingston', 1750000, 26, 240, 4, 320, 'S1'],
  ['2021 Honda Fit Hybrid', 'vehicles', 'St. Andrew', 2350000, 0.2, 12, 5, 300, 'S2'],
  ['2015 Nissan Note', 'vehicles', 'Manchester', 1450000, 12, 90, 3, 180, 'S3'],
  ['Toyota Hiace 2019 diesel', 'vehicles', 'St. James', 4900000, 3, 130, 4, 260, 'S4'],
  ['iPhone 13 128GB', 'electronics', 'Kingston', 95000, 0.1, 40, 3, 120, 'S5'],
  ['Samsung A54 sealed', 'electronics', 'St. Ann', 62000, 9, 55, 2, 90, 'S6'],
  ['Techno Spark 10', 'electronics', 'Clarendon', 21000, 30, 18, 1, 40, 'S7'],
  ['PS5 with 2 pads', 'electronics', 'Kingston', 130000, 1, 210, 4, 280, 'S5'],
  ['Sony 55 inch smart TV', 'electronics', 'St. Catherine', 88000, 18, 60, 2, 70, 'S8'],
  ['MacBook Air M1', 'electronics', 'St. Andrew', 155000, 2, 175, 3, 200, 'S9'],
  ['2 bed apartment Kingston 8', 'property', 'Kingston', 85000, 5, 320, 5, 340, 'S10'],
  ['House for sale Mandeville', 'property', 'Manchester', 18500000, 40, 150, 5, 300, 'S11'],
  ['Shop space Half Way Tree', 'property', 'St. Andrew', 140000, 14, 80, 3, 150, 'S12'],
  ['Studio in Ocho Rios', 'property', 'St. Ann', 55000, 0.3, 25, 4, 160, 'S13'],
  ['Land quarter acre St Thomas', 'property', 'St. Thomas', 3200000, 55, 45, 2, 60, 'S14'],
  ['3pc bedroom set', 'furniture', 'Kingston', 68000, 7, 70, 2, 110, 'S15'],
  ['Office desk and chair', 'furniture', 'St. Andrew', 32000, 21, 35, 1, 80, 'S16'],
  ['Dining table 6 seater', 'furniture', 'Manchester', 95000, 2, 60, 3, 140, 'S17'],
  ['Sofa 3 seater leather', 'furniture', 'St. James', 120000, 35, 100, 2, 90, 'S18'],
  ['Fridge Samsung 2 door', 'furniture', 'Clarendon', 78000, 0.5, 30, 2, 100, 'S19'],
  ['Electrician needed urgently', 'jobs', 'St. Ann', 25000, 0.1, 55, 0, 40, 'S20'],
  ['Shop helper Montego Bay', 'jobs', 'St. James', 18000, 4, 140, 0, 60, 'S21'],
  ['Accountant part time', 'jobs', 'Kingston', 60000, 16, 65, 0, 120, 'S22'],
  ['Barber needed', 'jobs', 'St. Andrew', 30000, 45, 20, 0, 30, 'S23'],
  ['AC repair and install', 'services', 'St. Catherine', 8000, 0.3, 190, 1, 150, 'S24'],
  ['DJ equipment setup', 'services', 'St. Ann', 250000, 8, 95, 4, 400, 'S25'],
  ['Moving truck service', 'services', 'Kingston', 15000, 13, 70, 2, 100, 'S26'],
  ['Taxi service airport', 'services', 'St. James', 6000, 60, 25, 0, 40, 'S27'],
  ['Fertilizer 50lb bag', 'furniture', 'St. Elizabeth', 4500, 1, 15, 1, 30, 'S28'],
  ['Yam and potato farm', 'furniture', 'Manchester', 12000, 20, 10, 2, 25, 'S29'],
  ['Books for CSEC', 'furniture', 'St. Catherine', 10000, 3, 12, 3, 45, 'S30'],
  ['Baby stroller', 'furniture', 'Kingston', 18000, 6, 22, 2, 55, 'S31'],
  ['Gaming chair', 'furniture', 'St. Andrew', 28000, 11, 48, 3, 85, 'S32'],
  ['Solar panel 400w', 'services', 'Clarendon', 55000, 0.4, 105, 4, 220, 'S33'],
  ['Water pump and tank', 'services', 'St. Elizabeth', 72000, 28, 40, 2, 90, 'S34'],
  ['Cement 50 bags', 'services', 'St. Ann', 260000, 2, 85, 1, 60, 'S35'],
  ['Treadmill barely used', 'furniture', 'Kingston', 95000, 22, 55, 3, 130, 'S38'],
  ['Office chair ergonomic', 'furniture', 'St. Andrew', 24000, 0.2, 20, 2, 75, 'S39'],
  ['Cheap bed single', 'furniture', 'St. Thomas', 15000, 70, 6, 1, 20, 'S40'],
  ['Gucci bag authentic', 'furniture', 'Kingston', 85000, 5, 160, 4, 200, 'S41'],
  ['Wig virgin hair', 'furniture', 'St. Andrew', 40000, 1, 130, 3, 150, 'S42'],
  ['Toyota Rav4 2020', 'vehicles', 'Kingston', 6800000, 6, 260, 5, 380, 'S45'],
  ['Suzuki Swift 2016', 'vehicles', 'St. James', 1650000, 33, 75, 3, 200, 'S46'],
  ['Bus route 24 seater', 'vehicles', 'St. Catherine', 9500000, 70, 60, 2, 90, 'S47'],
];

const ads = ROWS.map((r, i) => ({
  id: 'd' + i, title: r[0], category: r[1], parish: r[2], price: r[3], date: iso(r[4]),
  views: r[5], photos: new Array(r[6]).fill('p.jpg'), image: r[6] ? 'p.jpg' : '',
  desc: 'x'.repeat(r[7]), phone: r[6] ? '8765551' : '', sellerId: r[8], seller: 'Member',
  status: 'active', neg: i % 3 === 0,
}));

const ctx = {
  window: {}, localStorage: { getItem: () => null, setItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  CATS: CATS, PARISHES: PARISHES, _ads: ads,
  catById: id => CATS.filter(c => c.id === id)[0] || { name: 'Other', icon: '📦' },
  findAd: id => ads.filter(a => a.id === id)[0] || null,
  getViews: id => { const a = ads.filter(x => x.id === id)[0]; return a ? a.views : 0; },
  showToast: () => {}, renderHome: null, console: console,
};
vm.createContext(ctx);
vm.runInContext(SRC, ctx);

const ranked = ctx.window.fyRank(ads, null);
const newest = ads.slice().sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);
const catOf = id => (CATS.filter(c => c.id === id)[0] || {}).name;
const age = a => Math.round((NOW - Date.parse(a.date)) / DAY);

console.log('──────── FOR YOU (top 14) ────────');
ranked.slice(0, 14).forEach((a, i) => {
  const r = ctx.window.fyReason(a);
  console.log(String(i + 1).padStart(2) + '. ' + a.title.slice(0, 32).padEnd(33) +
    catOf(a.category).padEnd(12) + a.parish.padEnd(15) + (a.views + 'v').padStart(5) +
    ('  ' + age(a) + 'd').padStart(5) + '  ' + r.icon + ' ' + r.text);
});
console.log('\n──────── NEWEST FIRST (top 14) ────────');
newest.slice(0, 14).forEach((a, i) => console.log(String(i + 1).padStart(2) + '. ' + a.title.slice(0, 40)));
console.log('\nSame ' + ads.length + ' listings, different order.');
console.log('top-14 categories: ' + new Set(ranked.slice(0, 14).map(a => a.category)).size +
  ' (For You) vs ' + new Set(newest.slice(0, 14).map(a => a.category)).size + ' (newest)');
console.log('top-4 categories : ' + ranked.slice(0, 4).map(a => catOf(a.category)).join(', '));
console.log('nothing hidden   : ' + (ranked.length === ads.length));
