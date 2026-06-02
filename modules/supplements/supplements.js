(function(){
(() => {
  'use strict';

  const storeGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const storeSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function getActiveDate() {
    const now = new Date();
    if (now.getHours() < 6) now.setDate(now.getDate() - 1);
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const TEMPLATE_VERSION = 5;

  const STACK_DEFAULTS = [
    { id: 'm1', name: 'XXXXX - Supplement of choice', dose: '', window: 'morning', note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
    { id: 'm2', name: 'XXXXX - Supplement of choice', dose: '', window: 'morning', note: 'how much MG, meal times, any data below', tag: 'stack', ordered: true  },
    { id: 'm3', name: 'XXXXX - Supplement of choice', dose: '', window: 'morning', note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
    { id: 'l1', name: 'XXXXX - Supplement of choice', dose: '', window: 'lunch',   note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
    { id: 'l2', name: 'XXXXX - Supplement of choice', dose: '', window: 'lunch',   note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
    { id: 'e1', name: 'XXXXX - Supplement of choice', dose: '', window: 'evening', note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
    { id: 'e2', name: 'XXXXX - Supplement of choice', dose: '', window: 'evening', note: 'how much MG, meal times, any data below', tag: 'not-ordered', ordered: false },
    { id: 'e3', name: 'XXXXX - Supplement of choice', dose: '', window: 'evening', note: 'how much MG, meal times, any data below', tag: null,    ordered: true  },
  ];

  const STACK_WINDOWS = [
    { key: 'morning', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 18a5 5 0 0 0-10 0M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 5l-4 4-4-4"/></svg>', title: 'Morning', time: '7–10 AM', cutoffHour: 10 },
    { key: 'lunch',   icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 3v7c0 1 1 2 2 2s2-1 2-2V3M5 12v9M19 3v18M16 3c-1 1-2 3-2 6 0 2 1 3 2 3h2"/></svg>️', title: 'Lunch',   time: '12–2 PM', cutoffHour: 14 },
    { key: 'evening', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', title: 'Evening', time: '9–11 PM', cutoffHour: 23 },
    { key: 'anytime', icon: '⏱️', title: 'Anytime', time: 'No fixed window', cutoffHour: null },
  ];

  // ====== SUPPLEMENT DATABASE — researched defaults ======
  const SUPPLEMENT_DB = [
    { name: 'Creatine monohydrate', dose: '5g', window: 'anytime', note: 'Daily — consistency matters more than timing', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['creatine'] },
    { name: 'Beta-alanine', dose: '2–5g', window: 'morning', note: 'Pre-workout — split doses to avoid tingles', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['beta alanine'] },
    { name: 'L-citrulline', dose: '6–8g', window: 'morning', note: '~30 min pre-workout for pump', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['citrulline'] },
    { name: 'BCAAs', dose: '5–10g', window: 'anytime', note: 'Around workout window', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['bcaa'] },
    { name: 'Whey protein', dose: '25–40g', window: 'anytime', note: 'Post-workout or to hit daily target', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M5 8h14l-1.3 12.1a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9zM5 8l1-4h12M11 4V2h2"/></svg>', aliases: ['whey'] },
    { name: 'Casein protein', dose: '25–40g', window: 'evening', note: 'Before bed for slow overnight aminos', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M5 8h14l-1.3 12.1a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9zM5 8l1-4h12M11 4V2h2"/></svg>', aliases: ['casein'] },
    { name: 'L-carnitine', dose: '1–2g', window: 'morning', note: 'With carbs for best uptake', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['carnitine'] },
    { name: 'Acetyl-L-carnitine', dose: '500mg–2g', window: 'morning', note: 'Cognitive variant — crosses BBB', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg>', aliases: ['alcar'] },
    { name: 'HMB', dose: '3g', window: 'anytime', note: 'Split 3x daily — muscle preservation', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['hmb'] },
    { name: 'Glutamine', dose: '5g', window: 'anytime', note: 'Recovery — post-workout or before bed', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️', aliases: ['l-glutamine'] },
    { name: 'Vitamin D3', dose: '2000–5000 IU', window: 'lunch', note: 'Fat-soluble — take with biggest meal', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>️', aliases: ['vit d', 'vitamin d', 'd3', 'cholecalciferol'] },
    { name: 'Vitamin K2 (MK-7)', dose: '100–200 mcg', window: 'lunch', note: 'Pairs with D3 — same meal', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['vit k', 'vitamin k', 'k2', 'mk7'] },
    { name: 'Vitamin C', dose: '500–1000mg', window: 'morning', note: 'Water-soluble — split if over 500mg', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 5V3M12 3c0-1 1-1 2-1"/></svg>', aliases: ['vit c', 'ascorbic acid'] },
    { name: 'Vitamin B12', dose: '500–1000mcg', window: 'morning', note: 'Methylcobalamin form preferred', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>', aliases: ['b12', 'methylcobalamin'] },
    { name: 'B-complex', dose: '1 cap', window: 'morning', note: 'All B vitamins — energy', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>', aliases: ['b complex', 'b vitamins'] },
    { name: 'Vitamin A', dose: '5000 IU', window: 'lunch', note: 'Fat-soluble — with fat', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['vit a', 'retinol'] },
    { name: 'Vitamin E', dose: '400 IU', window: 'lunch', note: 'Fat-soluble — with fat', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['vit e', 'tocopherol'] },
    { name: 'Folate', dose: '400–800mcg', window: 'morning', note: 'Methylfolate preferred', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['folic acid', 'b9', 'methylfolate'] },
    { name: 'Biotin', dose: '30mcg–5mg', window: 'anytime', note: 'Hair, skin, nails', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>', aliases: ['biotin', 'b7'] },
    { name: 'Multivitamin', dose: '1 serving', window: 'lunch', note: 'Take with food', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['multi', 'multivitamin'] },
    { name: 'Magnesium glycinate', dose: '200–400mg', window: 'evening', note: '30–60 min before bed — sleep helper', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['magnesium', 'mag glycinate', 'bisglycinate'] },
    { name: 'Magnesium L-threonate', dose: '144mg elemental', window: 'evening', note: 'Cognitive variant — crosses BBB', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg>', aliases: ['magtein', 'threonate'] },
    { name: 'Magnesium citrate', dose: '200–400mg', window: 'evening', note: 'Also supports digestion', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['mag citrate'] },
    { name: 'Zinc', dose: '15–30mg', window: 'evening', note: 'With food — not with calcium or iron', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['zinc'] },
    { name: 'Iron', dose: '18–65mg', window: 'morning', note: 'Empty stomach with vit C', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['iron'] },
    { name: 'Calcium', dose: '500mg', window: 'evening', note: 'With food — not with iron', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 10c1.5 0 3 1 3 3s-1.5 3-3 3M7 14c-1.5 0-3-1-3-3s1.5-3 3-3M7 8a2 2 0 1 1 4 0M7 16a2 2 0 1 0 4 0M17 8a2 2 0 1 0-4 0M17 16a2 2 0 1 1-4 0M9 12h6"/></svg>', aliases: ['calcium'] },
    { name: 'Selenium', dose: '100–200mcg', window: 'anytime', note: 'Thyroid + antioxidant', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['selenium'] },
    { name: 'Iodine', dose: '150mcg', window: 'morning', note: 'Thyroid support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['iodine'] },
    { name: 'Omega-3 (Fish oil)', dose: '2–3g EPA+DHA', window: 'lunch', note: 'With biggest fatty meal', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M6.5 12c2-4 6-6 12-6-1 2-1 4 0 6-6 0-10-2-12-6zM6.5 12c2 4 6 6 12 6-1-2-1-4 0-6M2 12c1-1 2.5-1.5 4.5-1.5"/><circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none"/></svg>', aliases: ['omega 3', 'omega3', 'fish oil', 'epa', 'dha'] },
    { name: 'Krill oil', dose: '500–1000mg', window: 'lunch', note: 'More absorbable than fish oil', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M6.5 12c2-4 6-6 12-6-1 2-1 4 0 6-6 0-10-2-12-6zM6.5 12c2 4 6 6 12 6-1-2-1-4 0-6M2 12c1-1 2.5-1.5 4.5-1.5"/><circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none"/></svg>', aliases: ['krill'] },
    { name: 'MCT oil', dose: '1–2 tbsp', window: 'morning', note: 'Fast energy — start low', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none"/></svg>', aliases: ['mct'] },
    { name: 'Flaxseed oil', dose: '1–2g', window: 'lunch', note: 'Plant omega-3 — with food', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.9.8-1.6 2-2.1 3.6 2.1.4 3.5-.5 4.5-1.6 1-1.1 1.5-2.5 1.5-4.5-2 .5-3 1.7-3.9 2.5z"/></svg>', aliases: ['flax', 'flaxseed'] },
    { name: 'L-theanine', dose: '100–200mg', window: 'morning', note: 'Stacks with caffeine 2:1', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg>', aliases: ['theanine'] },
    { name: 'Caffeine', dose: '100–200mg', window: 'morning', note: 'Stack with L-theanine for cleaner focus', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/></svg>', aliases: ['caffeine'] },
    { name: 'Rhodiola rosea', dose: '200–400mg', window: 'morning', note: 'Adaptogen — energy and stress', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['rhodiola'] },
    { name: 'Lion\'s mane', dose: '500–1000mg', window: 'morning', note: 'Cognitive support — daily', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0H4zM10 11v6a2 2 0 0 0 4 0v-6"/></svg>', aliases: ['lions mane', 'hericium'] },
    { name: 'Bacopa monnieri', dose: '300–600mg', window: 'morning', note: 'With fat — long-term memory', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['bacopa'] },
    { name: 'Ginkgo biloba', dose: '120–240mg', window: 'morning', note: 'Circulation and cognition', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['ginkgo'] },
    { name: 'Alpha-GPC', dose: '300–600mg', window: 'morning', note: 'Choline — focus and learning', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg>', aliases: ['alpha gpc'] },
    { name: 'Phosphatidylserine', dose: '100–300mg', window: 'evening', note: 'Cortisol regulation', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 11a2.5 2.5 0 0 1 2-4.9A2.5 2.5 0 0 1 7 3.5 2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 11a2.5 2.5 0 0 0-2-4.9A2.5 2.5 0 0 0 17 3.5 2.5 2.5 0 0 0 14.5 2z"/></svg>', aliases: ['ps'] },
    { name: 'NAC', dose: '600–1800mg', window: 'morning', note: 'Glutathione precursor — split doses', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['nac', 'n-acetyl cysteine'] },
    { name: 'Melatonin', dose: '0.3–3mg', window: 'evening', note: '30–60 min before bed — start low', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['melatonin'] },
    { name: 'Glycine', dose: '3g', window: 'evening', note: 'Body temp drop = better sleep onset', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['glycine'] },
    { name: 'Apigenin', dose: '50mg', window: 'evening', note: 'From chamomile — before bed', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['apigenin'] },
    { name: 'Ashwagandha', dose: '300–600mg', window: 'evening', note: 'KSM-66 form — stress and cortisol', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['ashwagandha', 'ksm-66'] },
    { name: 'L-tryptophan', dose: '500mg–1g', window: 'evening', note: 'Serotonin precursor — sleep onset', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['tryptophan'] },
    { name: 'GABA', dose: '500–750mg', window: 'evening', note: 'Calming — before bed', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['gaba'] },
    { name: 'Valerian root', dose: '300–600mg', window: 'evening', note: 'Sleep onset support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>', aliases: ['valerian'] },
    { name: 'Probiotics', dose: '10–50 billion CFU', window: 'morning', note: 'Empty stomach or with food', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>', aliases: ['probiotic'] },
    { name: 'Quercetin', dose: '500–1000mg', window: 'anytime', note: 'Pairs well with vitamin C', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['quercetin'] },
    { name: 'Curcumin', dose: '500–1000mg', window: 'lunch', note: 'With black pepper + fat', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['curcumin', 'turmeric'] },
    { name: 'Resveratrol', dose: '250–500mg', window: 'morning', note: 'With fat for absorption', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="8" cy="14" r="2"/><circle cx="12" cy="14" r="2"/><circle cx="16" cy="14" r="2"/><circle cx="10" cy="18" r="2"/><circle cx="14" cy="18" r="2"/><path d="M12 10V4M12 4c0-1 1-2 3-2"/></svg>', aliases: ['resveratrol'] },
    { name: 'CoQ10 / Ubiquinol', dose: '100–200mg', window: 'lunch', note: 'Fat-soluble — with biggest meal', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['coq10', 'ubiquinol'] },
    { name: 'Alpha lipoic acid', dose: '300–600mg', window: 'morning', note: 'Empty stomach for absorption', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['ala', 'alpha lipoic'] },
    { name: 'Glutathione', dose: '250–1000mg', window: 'morning', note: 'Liposomal form for absorption', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['glutathione'] },
    { name: 'Astaxanthin', dose: '4–12mg', window: 'lunch', note: 'Fat-soluble — with fatty meal', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['astaxanthin'] },
    { name: 'Berberine', dose: '500mg', window: 'lunch', note: 'Before meals — glucose support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['berberine'] },
    { name: 'Milk thistle', dose: '200–400mg', window: 'anytime', note: 'Silymarin — liver support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['milk thistle', 'silymarin'] },
    { name: 'Spirulina', dose: '3–5g', window: 'morning', note: 'Algae — protein and antioxidants', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.9.8-1.6 2-2.1 3.6 2.1.4 3.5-.5 4.5-1.6 1-1.1 1.5-2.5 1.5-4.5-2 .5-3 1.7-3.9 2.5z"/></svg>', aliases: ['spirulina'] },
    { name: 'Chlorella', dose: '2–4g', window: 'morning', note: 'Algae — detox support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6c-.9.8-1.6 2-2.1 3.6 2.1.4 3.5-.5 4.5-1.6 1-1.1 1.5-2.5 1.5-4.5-2 .5-3 1.7-3.9 2.5z"/></svg>', aliases: ['chlorella'] },
    { name: 'Tongkat ali', dose: '200–400mg', window: 'morning', note: 'Cycle 8 weeks on/off', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['tongkat', 'longjack'] },
    { name: 'Fadogia agrestis', dose: '600mg', window: 'morning', note: 'Cycle 8 weeks on/off', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['fadogia'] },
    { name: 'DHEA', dose: '25–50mg', window: 'morning', note: 'Hormonal — consult doctor', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['dhea'] },
    { name: 'Pregnenolone', dose: '10–50mg', window: 'morning', note: 'Hormonal — consult doctor', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>', aliases: ['pregnenolone'] },
    { name: 'Tribulus terrestris', dose: '250–750mg', window: 'morning', note: 'Libido and energy', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['tribulus'] },
    { name: 'Maca root', dose: '1.5–3g', window: 'morning', note: 'Adaptogen — energy and libido', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/></svg>', aliases: ['maca'] },
    { name: 'Collagen peptides', dose: '10–20g', window: 'anytime', note: 'With vitamin C for synthesis', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>', aliases: ['collagen'] },
    { name: 'Glucosamine', dose: '1500mg', window: 'lunch', note: 'With food', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 10c1.5 0 3 1 3 3s-1.5 3-3 3M7 14c-1.5 0-3-1-3-3s1.5-3 3-3M7 8a2 2 0 1 1 4 0M7 16a2 2 0 1 0 4 0M17 8a2 2 0 1 0-4 0M17 16a2 2 0 1 1-4 0M9 12h6"/></svg>', aliases: ['glucosamine'] },
    { name: 'Chondroitin', dose: '1200mg', window: 'lunch', note: 'Often paired with glucosamine', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 10c1.5 0 3 1 3 3s-1.5 3-3 3M7 14c-1.5 0-3-1-3-3s1.5-3 3-3M7 8a2 2 0 1 1 4 0M7 16a2 2 0 1 0 4 0M17 8a2 2 0 1 0-4 0M17 16a2 2 0 1 1-4 0M9 12h6"/></svg>', aliases: ['chondroitin'] },
    { name: 'MSM', dose: '1–3g', window: 'anytime', note: 'Joint support', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M17 10c1.5 0 3 1 3 3s-1.5 3-3 3M7 14c-1.5 0-3-1-3-3s1.5-3 3-3M7 8a2 2 0 1 1 4 0M7 16a2 2 0 1 0 4 0M17 8a2 2 0 1 0-4 0M17 16a2 2 0 1 1-4 0M9 12h6"/></svg>', aliases: ['msm'] },
    { name: 'Hyaluronic acid', dose: '120–200mg', window: 'anytime', note: 'Skin and joint hydration', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>', aliases: ['hyaluronic', 'ha'] },
    { name: 'Cordyceps', dose: '1–3g', window: 'morning', note: 'Energy and endurance', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0H4zM10 11v6a2 2 0 0 0 4 0v-6"/></svg>', aliases: ['cordyceps'] },
    { name: 'Reishi', dose: '1–2g', window: 'evening', note: 'Calming adaptogen', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0H4zM10 11v6a2 2 0 0 0 4 0v-6"/></svg>', aliases: ['reishi', 'ganoderma'] },
    { name: 'Chaga', dose: '1–2g', window: 'morning', note: 'Antioxidant and immune', icon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0H4zM10 11v6a2 2 0 0 0 4 0v-6"/></svg>', aliases: ['chaga'] },
  ];

  let todayKey = `stack:taken:${getActiveDate()}`;

  function getItems() {
    const storedVersion = storeGet('stack:version');
    const stored = storeGet('stack:items');
    if (!stored || !Array.isArray(stored) || !stored.length || storedVersion !== TEMPLATE_VERSION) {
      const fresh = JSON.parse(JSON.stringify(STACK_DEFAULTS));
      storeSet('stack:items', fresh);
      storeSet('stack:version', TEMPLATE_VERSION);
      return fresh;
    }
    return stored;
  }
  function setItems(items) { storeSet('stack:items', items); }
  function getTaken() { return storeGet(todayKey) || {}; }
  function setTaken(map) { storeSet(todayKey, map); }
  function getLow() { return storeGet('stack:low') || []; }
  function setLow(arr) { storeSet('stack:low', arr); }

  function toggleTaken(id) {
    const taken = getTaken();
    if (taken[id]) delete taken[id]; else taken[id] = Date.now();
    setTaken(taken); render();
  }
  function toggleLow(id) {
    const low = getLow();
    if (low.includes(id)) setLow(low.filter(x => x !== id));
    else { low.push(id); setLow(low); }
    render();
  }
  function deleteItem(id) {
    setItems(getItems().filter(i => i.id !== id));
    const taken = getTaken();
    delete taken[id];
    setTaken(taken);
    setLow(getLow().filter(x => x !== id));
    render();
  }
  function addItem(name, dose, windowKey, note = '') {
    const v = String(name || '').trim();
    if (!v) return;
    const items = getItems();
    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    items.push({
      id, name: v,
      dose: String(dose || '').trim(),
      window: ['morning','lunch','evening','anytime'].includes(windowKey) ? windowKey : 'anytime',
      note: String(note || '').trim(),
      tag: null, ordered: true
    });
    setItems(items);
    render();
  }
  function updateItem(id, field, value) {
    const items = getItems();
    const item = items.find(i => i.id === id);
    if (!item) return;
    item[field] = value;
    setItems(items);
  }

  function render() {
    const items = getItems();
    const taken = getTaken();
    const low = getLow();
    const totalCount = items.length;
    const takenCount = items.filter(i => taken[i.id]).length;
    document.getElementById('stackProgressText').textContent =
      `${takenCount} / ${totalCount} taken today · resets at 6 AM`;
    const pct = totalCount === 0 ? 0 : (takenCount / totalCount) * 100;
    document.getElementById('stackProgressBar').style.width = pct + '%';

    const groupsEl = document.getElementById('stackGroups');
    groupsEl.innerHTML = '';

    const now = new Date();
    const nowHour = now.getHours() + (now.getMinutes() / 60);

    STACK_WINDOWS.forEach(win => {
      const winItems = items.filter(i => (i.window || 'anytime') === win.key);
      if (winItems.length === 0) return;

      const group = document.createElement('div');
      group.className = 'stack-window';
      group.innerHTML = `
        <div class="stack-window-header">
          <span class="stack-window-icon">${win.icon}</span>
          <span class="stack-window-title">${win.title}</span>
          <span class="stack-window-time">${win.time}</span>
        </div>`;

      const isPastCutoff = win.cutoffHour !== null && nowHour > win.cutoffHour;

      winItems.forEach(item => {
        const isTaken = !!taken[item.id];
        const isLow = low.includes(item.id);
        const isMissed = !isTaken && isPastCutoff;

        const row = document.createElement('div');
        row.className = 'stack-item' + (isTaken ? ' taken' : '') + (isMissed ? ' missed' : '');

        let tagHtml = '';
        if (item.tag === 'stack') tagHtml = '<span class="stack-item-tag tag-stack">stack</span>';
        else if (item.tag === 'not-ordered') tagHtml = '<span class="stack-item-tag tag-not-ordered">not ordered</span>';

        row.innerHTML = `
          <button class="stack-check ${isTaken ? 'checked' : ''}" data-action="toggle" data-id="${item.id}" aria-label="Mark taken">${isTaken ? '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' : ''}</button>
          <div class="stack-item-body">
            <div class="stack-item-name" data-edit="name" data-id="${item.id}">
              <span class="stack-item-name-text">${escapeHtml(item.name)}</span>${tagHtml}
            </div>
            <div class="stack-item-meta" data-edit="meta" data-id="${item.id}">${escapeHtml(metaText(item))}</div>
          </div>
          <button class="stack-low-btn ${isLow ? 'is-low' : ''}" data-action="low" data-id="${item.id}">↓ Running low</button>
          <button class="stack-item-del" data-action="del" data-id="${item.id}" aria-label="Delete">×</button>`;

        group.appendChild(row);
      });

      groupsEl.appendChild(group);
    });

    if (groupsEl.children.length === 0) {
      groupsEl.innerHTML = `<div class="stack-window-empty">No items yet — add one below to start your stack.</div>`;
    }

    // Sync ticker after every render
    renderTicker();
  }

  // ====== TICKER ======
  let tickerIndex = 0;
  let tickerInterval = null;
  let cachedIssues = [];

  function getStackIssues() {
    const items = getItems();
    const taken = getTaken();
    const low = getLow();
    const now = new Date();
    const nowHour = now.getHours() + (now.getMinutes() / 60);

    const missed = [];
    const lowList = [];

    items.forEach(item => {
      const win = STACK_WINDOWS.find(w => w.key === (item.window || 'anytime'));
      const isPastCutoff = win && win.cutoffHour !== null && nowHour > win.cutoffHour;
      const isTaken = !!taken[item.id];
      if (isPastCutoff && !isTaken) {
        missed.push({
          type: 'missed',
          text: `${item.name} — missed ${win.title.toLowerCase()} dose`
        });
      }
      if (low.includes(item.id)) {
        lowList.push({
          type: 'low',
          text: `${item.name} — running low, reorder soon`
        });
      }
    });

    return [...missed, ...lowList];
  }

  function renderTicker() {
    const issues = getStackIssues();
    const tickerEl = document.getElementById('stackTicker');
    const msgEl = document.getElementById('stackTickerMsg');
    const countEl = document.getElementById('stackTickerCount');
    const totalItems = getItems().length;

    cachedIssues = issues;

    if (issues.length === 0) {
      msgEl.textContent = 'All caught up — keep it rolling';
      tickerEl.classList.remove('status-low', 'status-missed');
      countEl.textContent = `0/${totalItems}`;
      tickerIndex = 0;
      return;
    }

    const hasMissed = issues.some(i => i.type === 'missed');
    tickerEl.classList.remove('status-low', 'status-missed');
    tickerEl.classList.add(hasMissed ? 'status-missed' : 'status-low');

    if (tickerIndex >= issues.length) tickerIndex = 0;
    msgEl.textContent = issues[tickerIndex].text;
    countEl.textContent = `${issues.length}/${totalItems}`;
  }

  function cycleTicker() {
    if (cachedIssues.length <= 1) {
      renderTicker();
      return;
    }
    const msgEl = document.getElementById('stackTickerMsg');
    msgEl.classList.add('is-fading');
    setTimeout(() => {
      tickerIndex++;
      renderTicker();
      msgEl.classList.remove('is-fading');
    }, 280);
  }

  function startTicker() {
    if (tickerInterval) clearInterval(tickerInterval);
    tickerInterval = setInterval(cycleTicker, 5000);
  }

  function metaText(item) {
    const parts = [];
    if (item.dose) parts.push(item.dose);
    if (item.note) parts.push(item.note);
    return parts.join(' · ');
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.getElementById('stackGroups').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.id;
    if (btn.dataset.action === 'toggle') toggleTaken(id);
    else if (btn.dataset.action === 'low') toggleLow(id);
    else if (btn.dataset.action === 'del') deleteItem(id);
  });
  document.getElementById('stackGroups').addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-action="del"]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    deleteItem(btn.dataset.id);
  });
  document.getElementById('stackGroups').addEventListener('click', (e) => {
    const editEl = e.target.closest('[data-edit]');
    if (!editEl) return;
    if (e.target.closest('[data-action]')) return;
    if (editEl.getAttribute('contenteditable') === 'true') return;
    startEdit(editEl);
  });

  function startEdit(el) {
    const id = el.dataset.id;
    const field = el.dataset.edit;
    if (field === 'name') {
      const textSpan = el.querySelector('.stack-item-name-text');
      if (!textSpan) return;
      textSpan.setAttribute('contenteditable', 'true');
      textSpan.style.outline = '1px solid rgba(255,255,255,0.25)';
      textSpan.style.outlineOffset = '4px';
      textSpan.style.borderRadius = '4px';
      textSpan.focus();
      placeCaretAtEnd(textSpan);
      const finish = (commit) => {
        textSpan.removeAttribute('contenteditable');
        textSpan.style.outline = ''; textSpan.style.outlineOffset = '';
        if (commit) {
          const newVal = textSpan.textContent.trim();
          if (newVal) updateItem(id, 'name', newVal); else render();
        } else render();
      };
      textSpan.addEventListener('blur', () => finish(true), { once: true });
      textSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); textSpan.blur(); }
        if (e.key === 'Escape') { textSpan.blur(); render(); }
      });
    }
    if (field === 'meta') {
      el.setAttribute('contenteditable', 'true');
      el.focus(); placeCaretAtEnd(el);
      const finish = (commit) => {
        el.removeAttribute('contenteditable');
        if (commit) {
          const text = el.textContent.trim();
          const parts = text.split(/\s*·\s*/);
          updateItem(id, 'dose', parts[0] || '');
          updateItem(id, 'note', parts.slice(1).join(' · '));
        }
        render();
      };
      el.addEventListener('blur', () => finish(true), { once: true });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        if (e.key === 'Escape') { el.blur(); render(); }
      });
    }
  }

  function placeCaretAtEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ====== ADD FORM + SEARCH AUTOCOMPLETE ======
  const nameInput = document.getElementById('stackAddName');
  const doseInput = document.getElementById('stackAddDose');
  const winSelect = document.getElementById('stackAddWindow');
  const addBtn = document.getElementById('stackAddBtn');
  const resultsEl = document.getElementById('stackSearchResults');

  let pendingNote = ''; // hidden note auto-filled when a DB result is selected

  function searchSupplements(q) {
    const query = q.toLowerCase().trim();
    if (!query) return [];
    const starts = [];
    const contains = [];
    SUPPLEMENT_DB.forEach(s => {
      const nameLC = s.name.toLowerCase();
      const aliases = (s.aliases || []).map(a => a.toLowerCase());
      const allNames = [nameLC, ...aliases];
      if (allNames.some(n => n.startsWith(query))) starts.push(s);
      else if (allNames.some(n => n.includes(query))) contains.push(s);
    });
    return [...starts, ...contains].slice(0, 6);
  }

  function renderSearchResults(q) {
    const matches = searchSupplements(q);
    if (!q.trim() || matches.length === 0) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      return;
    }
    resultsEl.hidden = false;
    resultsEl.innerHTML = matches.map(s => {
      const winMeta = STACK_WINDOWS.find(w => w.key === s.window) || STACK_WINDOWS[3];
      return `
        <button class="stack-result" data-name="${escapeHtml(s.name)}" data-dose="${escapeHtml(s.dose)}" data-window="${s.window}" data-note="${escapeHtml(s.note)}">
          <div class="stack-result-icon">${s.icon || '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7"/></svg>'}</div>
          <div class="stack-result-body">
            <div class="stack-result-name">${escapeHtml(s.name)}</div>
            <div class="stack-result-meta">${escapeHtml(s.dose)} · ${winMeta.icon} ${winMeta.title.toLowerCase()} · ${escapeHtml(s.note)}</div>
          </div>
        </button>`;
    }).join('');
  }

  nameInput.addEventListener('input', () => {
    renderSearchResults(nameInput.value);
    pendingNote = ''; // reset note if user is typing manually
  });
  nameInput.addEventListener('focus', () => {
    if (nameInput.value.trim()) renderSearchResults(nameInput.value);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.stack-name-wrap')) resultsEl.hidden = true;
  });

  resultsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.stack-result');
    if (!btn) return;
    nameInput.value = btn.dataset.name;
    doseInput.value = btn.dataset.dose;
    winSelect.value = btn.dataset.window;
    pendingNote = btn.dataset.note;
    resultsEl.hidden = true;
    addBtn.focus();
  });

  addBtn.addEventListener('click', () => {
    addItem(nameInput.value, doseInput.value, winSelect.value, pendingNote);
    nameInput.value = '';
    doseInput.value = '';
    pendingNote = '';
    resultsEl.hidden = true;
    nameInput.focus();
  });

  [nameInput, doseInput].forEach(i => {
    i.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // If search dropdown is open with matches, pick the first one
        if (!resultsEl.hidden && i === nameInput) {
          const firstResult = resultsEl.querySelector('.stack-result');
          if (firstResult) { e.preventDefault(); firstResult.click(); return; }
        }
        addBtn.click();
      }
      if (e.key === 'Escape') resultsEl.hidden = true;
    });
  });

  setInterval(() => {
    const newKey = `stack:taken:${getActiveDate()}`;
    if (newKey !== todayKey) todayKey = newKey;
    render();
  }, 60 * 1000);

  render();
  startTicker();
})();
})();