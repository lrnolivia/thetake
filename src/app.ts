// The DOM controller is being migrated incrementally; calculation and storage
// boundaries are typed even while the legacy view layer remains imperative.
// @ts-nocheck
import { calculatePay } from './pay';
import { readLocalJson, requestPersistentStorage, writeLocalJson } from './storage';
import { createWorker } from 'tesseract.js';
(function(){

  var navHeightProbe = document.getElementById('heroNavbar');
  var NAV_H = navHeightProbe ? Math.round(parseFloat(getComputedStyle(navHeightProbe).height)) : 64;

  var DEFAULT_BRACKETS = [
    { upTo:12400,    rate:0.10 },
    { upTo:50400,    rate:0.12 },
    { upTo:105700,   rate:0.22 },
    { upTo:201775,   rate:0.24 },
    { upTo:256225,   rate:0.32 },
    { upTo:640600,   rate:0.35 },
    { upTo:null,     rate:0.37 }
  ];

  var STATE_MIN_WAGE = {
    FL: { rate:14.00, tippedRate:10.98, note:'$14.00/hr full rate through Sept 29, 2026, then $15.00/hr from Sept 30, 2026 (Amendment 2 final step). Tipped cash wage is the full rate minus a fixed $3.02 tip credit. No state income tax.' },
    CA: { rate:16.90, tippedRate:16.90, note:'2026 statewide rate; no tip credit allowed — tipped and full rates are the same. Many cities set higher local minimums.' },
    WA: { rate:17.13, tippedRate:17.13, note:'2026 statewide rate; no tip credit allowed — highest statewide rate in the US.' },
    CO: { rate:15.16, tippedRate:12.14, note:'2026 statewide rate; $3.02 tip credit. Denver runs higher.' },
    AZ: { rate:15.15, tippedRate:12.15, note:'2026 statewide rate; $3.00 tip credit.' },
    OR: { rate:14.20, tippedRate:14.20, note:'Standard statewide rate; no tip credit allowed. Portland metro and nonurban counties differ.' },
    NY: { rate:15.50, tippedRate:12.90, note:'Varies by region — NYC/Long Island/Westchester run higher (~$17.00). Check your county for the exact tipped rate.' },
    IL: { rate:15.00, tippedRate:9.00,  note:'2026 statewide rate; 40% tip credit allowed.' },
    MA: { rate:15.00, tippedRate:6.75,  note:'2026 statewide rate; tipped service rate shown.' },
    NJ: { rate:15.49, tippedRate:5.62,  note:'2026 statewide rate; tip credit allowed.' },
    CT: { rate:16.94, tippedRate:6.38,  note:'2026 statewide rate; tipped rate for restaurant staff shown.' },
    MD: { rate:15.00, tippedRate:3.63,  note:'2026 statewide rate; tip credit allowed.' },
    MN: { rate:11.13, tippedRate:11.13, note:'2026 statewide rate for large employers; no tip credit allowed.' },
    DC: { rate:17.95, tippedRate:10.00, note:'District of Columbia; tipped minimum is phasing up to match the full rate by 2027.' },
    TX: { rate:7.25,  tippedRate:2.13,  note:'No state minimum above the federal floor; federal tipped cash wage shown.' },
    GA: { rate:7.25,  tippedRate:2.13,  note:'State law sets $5.15, but the federal $7.25 floor applies to FLSA-covered employers; federal tipped cash wage shown.' },
    NC: { rate:7.25,  tippedRate:2.13,  note:'Federal minimum and tipped cash-wage floors shown; verify any local or role-specific requirements.' },
    SC: { rate:7.25,  tippedRate:2.13,  note:'Federal minimum and tipped cash-wage floors shown; verify any local or role-specific requirements.' },
    OTHER: { rate:7.25, tippedRate:2.13, note:'Federal floor shown as a placeholder — enter your actual state/local rate.' }
  };

  var CHOP_LOCATIONS = [
    { id:'fl-tallahassee-midtown', label:'Tallahassee — Midtown', state:'FL' },
    { id:'fl-tallahassee-killearn', label:'Tallahassee — Killearn', state:'FL' },
    { id:'fl-tallahassee-eastside', label:'Tallahassee — Eastside', state:'FL' },
    { id:'fl-jacksonville-riverside', label:'Jacksonville — Riverside', state:'FL' },
    { id:'fl-winter-springs', label:'Winter Springs (Orlando)', state:'FL' },
    { id:'fl-pace', label:'Pace', state:'FL' },
    { id:'fl-niceville', label:'Niceville', state:'FL' },
    { id:'ga-pooler', label:'Pooler', state:'GA' },
    { id:'ga-port-wentworth', label:'Port Wentworth', state:'GA' },
    { id:'ga-warner-robins', label:'Warner Robins', state:'GA' },
    { id:'ga-valdosta', label:'Valdosta', state:'GA' },
    { id:'nc-holly-springs', label:'Holly Springs', state:'NC' },
    { id:'sc-simpsonville', label:'Simpsonville', state:'SC' },
    { id:'sc-greenville-pelham', label:'Greenville — Pelham', state:'SC' }
  ];
  var PRODUCTS = [
    { id:'leave-in', name:'Leave-In', price:20 },
    { id:'hair-spray', name:'Hair Spray', price:16 },
    { id:'shampoo', name:'Shampoo', price:20 },
    { id:'conditioner', name:'Conditioner', price:20 },
    { id:'sea-salt-spray', name:'Sea Salt Spray', price:19 },
    { id:'hair-dust', name:'Hair Dust', price:20 },
    { id:'aftershave', name:'Aftershave', price:17 },
    { id:'curl-cream', name:'Curl Cream', price:16 },
    { id:'beard-oil', name:'Beard Oil', price:19 },
    { id:'beard-balm', name:'Beard Balm', price:20 },
    { id:'beard-wash', name:'Beard Wash', price:19 },
    { id:'shave-gel', name:'Shave Gel', price:18 },
    { id:'matte-clay', name:'Matte Clay', price:18 },
    { id:'fiber-clay', name:'Fiber Clay', price:18 },
    { id:'high-shine', name:'High Shine', price:18 }
  ];

  var DEFAULTS = {
    onboardingComplete: false,
    profileName: '',
    workerType: 'full-time',
    location: '',
    state: 'FL',
    wageMode: 'tipped',
    minWage: 10.98,
    tipRateAssumed: 0.15,
    ficaRate: 0.0765,
    stdDeduction: 16100,
    tipsDeductionCap: 25000,
    tipsDeductionAssumed: 3000,
    brackets: JSON.parse(JSON.stringify(DEFAULT_BRACKETS)),
    tierTickets: { budget:18, low:22, average:30, high:42, premium:58 },
    uiAccent: 'teal',
    rememberLook: false
  };
  var ACCENTS = ['coral','teal','gold'];

  // Order for each step slider — index doubles as the range input's value.
  var TIER_ORDER = ['budget','low','average','high','premium','custom'];
  var TIER_GLYPHS = { budget:'$', low:'$$', average:'$$$', high:'$$$$', premium:'$$$$$', custom:'\u270E' };
  var TIER_NAMES  = { budget:'Budget', low:'Low', average:'Average', high:'High', premium:'Premium', custom:'Custom' };
  var HOUR_ORDER = ['10','20','30','40','50','custom'];
  var HOUR_GLYPHS = { '10':'\u2758', '20':'\u2758\u2758', '30':'\u2758\u2758\u2758', '40':'\u2758\u2758\u2758\u2758', '50':'\u2758\u2758\u2758\u2758\u2758', custom:'\u270E' };
  var HOUR_NAMES  = { '10':'10 hrs/wk', '20':'20 hrs/wk', '30':'30 hrs/wk', '40':'40 hrs/wk', '50':'50 hrs/wk', custom:'Custom' };
  var HOUR_SHIFTS = { '10':2, '20':4, '30':6, '40':8, '50':10 };

  function initStepSlider(opts){
    var range = document.getElementById(opts.rangeId);
    var glyphEl = document.getElementById(opts.glyphId);
    var nameEl = document.getElementById(opts.nameId);
    var amtEl = document.getElementById(opts.amtId);
    var ticks = document.querySelectorAll('#' + opts.ticksId + ' button');
    var previousKey = null;

    range.addEventListener('input', function(e){
      opts.onSelect(opts.order[parseInt(e.target.value, 10)]);
    });
    ticks.forEach(function(btn){
      btn.addEventListener('click', function(){ opts.onSelect(btn.getAttribute('data-key')); });
    });

    return function sync(activeKey){
      var idx = opts.order.indexOf(activeKey);
      if(idx < 0) return;
      range.value = idx;
      range.setAttribute('aria-valuetext', opts.names[activeKey] + '; ' + opts.amtFn(activeKey));
      setPoppingText(glyphEl, opts.glyphs[activeKey]);
      setPoppingText(nameEl, opts.names[activeKey]);
      setPoppingText(amtEl, opts.amtFn(activeKey));
      ticks.forEach(function(btn){
        var isActive = btn.getAttribute('data-key') === activeKey;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
        if(isActive && previousKey !== activeKey){
          btn.classList.remove('choice-pop'); void btn.offsetWidth; btn.classList.add('choice-pop');
          setTimeout(function(){ btn.classList.remove('choice-pop'); }, 420);
        }
      });
      previousKey = activeKey;
    };
  }

  var SHIFT_CAPACITY = 11;
  var FILL_RATES = [
    { key:'slow',  label:'Slow',          pct:0.45 },
    { key:'below', label:'Below average', pct:0.65 },
    { key:'avg',   label:'Average',       pct:0.75 },
    { key:'busy',  label:'Busy',          pct:0.85 },
    { key:'full',  label:'Fully booked',  pct:0.95 }
  ];
  var PERIODS = {
    weekly:   { label:'Weekly',    mult: 1 },
    biweekly: { label:'Bi-Weekly', mult: 2 },
    monthly:  { label:'Monthly',   mult: 52/12 },
    yearly:   { label:'Yearly',    mult: 52 }
  };

  var STORAGE_KEY = 'thetake_chop_settings_v2';
  var PROFILE_KEY = 'thetake_profile_v1';
  var HISTORY_KEY = 'thetake_chop_history_v1';

  function boundedNumber(value, fallback, min, max){
    var parsed = Number(value);
    if(!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function syncMotionVisibility(){
    document.documentElement.classList.toggle('motion-paused', document.hidden);
  }
  document.addEventListener('visibilitychange', syncMotionVisibility);
  syncMotionVisibility();

  var settings = loadSettings();
  if(!settings.rememberLook){
    settings.uiAccent = ACCENTS[Math.floor(Math.random()*ACCENTS.length)];
  }
  var ui = {
    hours: 0, revenue: 0, tips: 0, received: null, productSales:0,
    projHours: 20, projTier: 'average', zoomPeriod: 'weekly',
    projProductQty:{}, projProductSales:0,
    projHoursCustom: false, customHours: 20,
    projTierCustom: false, customTicket: 30,
    goalPeriod: 'daily'
  };
  var lastNet = null;
  var history = loadHistory();

  function loadSettings(){
    try{
      var loaded = readLocalJson(STORAGE_KEY, {});
      var savedProfile = readLocalJson(PROFILE_KEY, {});
      if(!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) loaded = {};
      if(!savedProfile || typeof savedProfile !== 'object' || Array.isArray(savedProfile)) savedProfile = {};
      var merged = JSON.parse(JSON.stringify(DEFAULTS));
      for(var k in loaded){ merged[k] = loaded[k]; }
      ['profileName','workerType','location','state','onboardingComplete'].forEach(function(key){
        if(savedProfile[key] !== undefined && (key === 'onboardingComplete' || !merged[key])) merged[key] = savedProfile[key];
      });
      // Recover older installs that saved all required profile fields but lost
      // the completion flag during a standalone-PWA lifecycle restart.
      if(merged.profileName && merged.location && merged.workerType) merged.onboardingComplete = true;
      if(!Array.isArray(merged.brackets) || !merged.brackets.length){ merged.brackets = JSON.parse(JSON.stringify(DEFAULT_BRACKETS)); }
      merged.brackets = merged.brackets.filter(function(bracket){
        return bracket && typeof bracket === 'object';
      }).map(function(bracket){
        var rate = Number(bracket.rate);
        var cap = bracket.upTo === null ? null : Number(bracket.upTo);
        return {
          upTo: cap === null || !Number.isFinite(cap) ? null : Math.max(0, cap),
          rate: Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0
        };
      });
      if(!merged.brackets.length) merged.brackets = JSON.parse(JSON.stringify(DEFAULT_BRACKETS));
      merged.brackets[merged.brackets.length - 1].upTo = null;
      // Older saved settings may only have {low,average,high} — backfill any new
      // tier keys (budget/premium) from defaults rather than losing them.
      var loadedTiers = loaded.tierTickets && typeof loaded.tierTickets === 'object' && !Array.isArray(loaded.tierTickets)
        ? loaded.tierTickets
        : {};
      merged.tierTickets = Object.assign({}, DEFAULTS.tierTickets, loadedTiers);
      Object.keys(DEFAULTS.tierTickets).forEach(function(key){
        merged.tierTickets[key] = boundedNumber(merged.tierTickets[key], DEFAULTS.tierTickets[key], 0, 10000);
      });
      merged.profileName = typeof merged.profileName === 'string' ? merged.profileName.slice(0, 60) : '';
      merged.workerType = merged.workerType === 'part-time' ? 'part-time' : 'full-time';
      merged.location = typeof merged.location === 'string' && locationById(merged.location) ? merged.location : '';
      if(merged.location) merged.state = locationById(merged.location).state;
      merged.state = typeof merged.state === 'string' && STATE_MIN_WAGE[merged.state] ? merged.state : 'FL';
      merged.wageMode = merged.wageMode === 'full' ? 'full' : 'tipped';
      merged.minWage = boundedNumber(merged.minWage, DEFAULTS.minWage, 0, 1000);
      merged.tipRateAssumed = boundedNumber(merged.tipRateAssumed, DEFAULTS.tipRateAssumed, 0, 1);
      merged.ficaRate = boundedNumber(merged.ficaRate, DEFAULTS.ficaRate, 0, 1);
      merged.stdDeduction = boundedNumber(merged.stdDeduction, DEFAULTS.stdDeduction, 0, 1000000000);
      merged.tipsDeductionCap = boundedNumber(merged.tipsDeductionCap, DEFAULTS.tipsDeductionCap, 0, 1000000000);
      merged.tipsDeductionAssumed = boundedNumber(merged.tipsDeductionAssumed, DEFAULTS.tipsDeductionAssumed, 0, merged.tipsDeductionCap);
      merged.uiAccent = ACCENTS.indexOf(merged.uiAccent) >= 0 ? merged.uiAccent : DEFAULTS.uiAccent;
      merged.rememberLook = merged.rememberLook === true;
      merged.onboardingComplete = !!(merged.onboardingComplete && merged.profileName && merged.location);
      return merged;
    }catch(e){ return JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  function saveSettings(){
    writeLocalJson(STORAGE_KEY, settings);
    writeLocalJson(PROFILE_KEY, {
      onboardingComplete:!!settings.onboardingComplete,
      profileName:settings.profileName || '',
      workerType:settings.workerType || 'full-time',
      location:settings.location || '',
      state:settings.state || 'FL'
    });
  }
  function loadHistory(){
    var saved = readLocalJson(HISTORY_KEY, []);
    if(!Array.isArray(saved)) return [];
    return saved.filter(function(record){
      return record && typeof record === 'object' &&
        Number.isFinite(Number(record.savedAt)) && Number.isFinite(Number(record.net));
    }).map(function(record, index){
      var savedAt = Number(record.savedAt);
      var safeId = typeof record.id === 'string' && /^[A-Za-z0-9_-]+$/.test(record.id)
        ? record.id
        : 'saved-' + savedAt + '-' + index;
      var received = record.received === null || record.received === undefined ? null : Number(record.received);
      return {
        id:safeId,
        savedAt:savedAt,
        label:typeof record.label === 'string' ? record.label.slice(0, 80) : '',
        hours:boundedNumber(record.hours, 0, 0, 1000),
        revenue:boundedNumber(record.revenue, 0, 0, 1000000000),
        productSales:boundedNumber(record.productSales, 0, 0, 1000000000),
        tips:boundedNumber(record.tips, 0, 0, 1000000000),
        received:Number.isFinite(received) ? received : null,
        net:boundedNumber(record.net, 0, 0, 1000000000),
        floorApplies:record.floorApplies === true
      };
    });
  }
  function saveHistory(){
    writeLocalJson(HISTORY_KEY, history);
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function fmtDate(ts){
    return new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric' });
  }

  function locationById(id){
    return CHOP_LOCATIONS.filter(function(loc){ return loc.id === id; })[0] || null;
  }
  function locationOptions(includePrompt){
    var html = includePrompt ? '<option value="">Choose your shop</option>' : '';
    ['FL','GA','NC','SC'].forEach(function(state){
      html += '<optgroup label="' + state + '">';
      CHOP_LOCATIONS.filter(function(loc){ return loc.state === state; }).forEach(function(loc){
        html += '<option value="' + loc.id + '">' + escapeHtml(loc.label) + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }
  function applyWorkerType(){
    document.documentElement.setAttribute('data-worker-type', settings.workerType || 'full-time');
    if(settings.workerType === 'full-time'){
      ui.hours = 0;
      var hoursInput = document.getElementById('inHours');
      if(hoursInput) hoursInput.value = '';
    }
    var intro = document.getElementById('actualIntro');
    if(intro) intro.textContent = settings.workerType === 'full-time'
      ? 'Upload your sales screenshot or type the numbers in. Full-time pay goes straight to commission, so no hours upload is needed.'
      : 'Upload your sales screenshot or type the numbers in. Hours are optional and only needed to check the minimum-wage floor for a low-sales period.';
  }
  function syncProductSales(){
    ui.projProductSales = PRODUCTS.reduce(function(total, product){
      return total + product.price * Math.max(0, parseInt(ui.projProductQty[product.id] || 0, 10));
    }, 0);
    document.getElementById('productSummaryTotal').textContent = fmt(ui.projProductSales) + ' retail';
    document.getElementById('productRetailTotal').textContent = fmt(ui.projProductSales);
    document.getElementById('productCommissionTotal').textContent = fmt(ui.projProductSales * .10);
  }
  function renderProductCatalog(){
    var grid = document.getElementById('productGrid');
    grid.innerHTML = PRODUCTS.map(function(product){
      var qty = Math.max(0, parseInt(ui.projProductQty[product.id] || 0,10));
      return '<div class="productrow"><div class="productname">' + escapeHtml(product.name) + '<span class="productprice">$' + product.price + '</span></div>' +
        '<div class="productstepper"><button type="button" data-product="' + product.id + '" data-delta="-1" aria-label="Remove one ' + escapeHtml(product.name) + '">&minus;</button>' +
        '<output id="qty-' + product.id + '">' + qty + '</output><button type="button" data-product="' + product.id + '" data-delta="1" aria-label="Add one ' + escapeHtml(product.name) + '">+</button></div></div>';
    }).join('');
    grid.querySelectorAll('button[data-product]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-product');
        var delta = parseInt(btn.getAttribute('data-delta'),10);
        ui.projProductQty[id] = Math.max(0, parseInt(ui.projProductQty[id] || 0,10) + delta);
        setPoppingText(document.getElementById('qty-' + id), ui.projProductQty[id]);
        syncProductSales(); renderProjection();
      });
    });
    syncProductSales();
  }
  function showOnboarding(){
    var panel = document.getElementById('onboarding');
    panel.inert = false;
    panel.classList.add('show'); panel.setAttribute('aria-hidden','false'); document.body.classList.add('onboarding-open');
    document.querySelector('.page').inert = true;
    document.getElementById('installBtn').inert = true;
    document.getElementById('iosInstallPop').inert = true;
    requestAnimationFrame(function(){ document.getElementById('onboardName').focus(); });
  }
  function hideOnboarding(){
    var panel = document.getElementById('onboarding');
    panel.classList.remove('show'); panel.setAttribute('aria-hidden','true'); document.body.classList.remove('onboarding-open');
    panel.inert = true;
    document.querySelector('.page').inert = false;
    document.getElementById('installBtn').inert = false;
    var installPop = document.getElementById('iosInstallPop');
    installPop.inert = !installPop.classList.contains('show');
  }
  function initOnboarding(){
    var locationSelect = document.getElementById('onboardLocation');
    locationSelect.innerHTML = locationOptions(true);
    document.getElementById('onboardName').value = settings.profileName || '';
    locationSelect.value = settings.location || '';
    if(settings.onboardingComplete){
      var worker = document.querySelector('input[name="workerType"][value="' + (settings.workerType || 'full-time') + '"]');
      if(worker) worker.checked = true;
    }
    document.getElementById('onboardingForm').addEventListener('submit', function(e){
      e.preventDefault();
      settings.profileName = document.getElementById('onboardName').value.trim();
      settings.workerType = document.querySelector('input[name="workerType"]:checked').value;
      settings.location = locationSelect.value;
      var loc = locationById(settings.location);
      if(loc){
        settings.state = loc.state;
        var sw = STATE_MIN_WAGE[loc.state] || STATE_MIN_WAGE.OTHER;
        settings.minWage = settings.wageMode === 'full' ? sw.rate : sw.tippedRate;
      }
      settings.onboardingComplete = true;
      saveSettings();
      requestPersistentStorage();
      applyWorkerType(); populateStateDropdown(); populateProfileSettings(); renderSettingsForm(); renderAll(); hideOnboarding(); initReveal();
    });
    if(!settings.onboardingComplete) showOnboarding();
  }

  var themeWipe = document.getElementById('themeWipe');
  var wipeTimer = null;
  function fireWipe(originEl){
    if(!originEl) return;
    var rect = originEl.getBoundingClientRect();
    document.documentElement.style.setProperty('--wx', (rect.left + rect.width/2) + 'px');
    document.documentElement.style.setProperty('--wy', (rect.top + rect.height/2) + 'px');
    themeWipe.classList.remove('go');
    void themeWipe.offsetWidth; // restart animation
    themeWipe.classList.add('go');
    clearTimeout(wipeTimer);
    wipeTimer = setTimeout(function(){ themeWipe.classList.remove('go'); }, 950);
  }

  function applyLook(){
    document.documentElement.setAttribute('data-accent', settings.uiAccent);
    document.querySelectorAll('.accentbtn').forEach(function(btn){
      var isActive = btn.getAttribute('data-accentval') === settings.uiAccent;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
    document.querySelectorAll('.rememberChk').forEach(function(chk){
      chk.checked = !!settings.rememberLook;
    });
    saveSettings();
  }

  // Two paint toggles share one set of style/accent controls: the floating button
  // on the full-size hero, and the compact one in the nav bar next to Settings.
  var paintPops = [];
  function setPaintPopover(item, open){
    item.pop.classList.toggle('show', open);
    item.pop.setAttribute('aria-hidden', String(!open));
    item.pop.inert = !open;
    item.btn.setAttribute('aria-expanded', String(open));
  }
  function closePaintPops(returnFocus){
    var focusedItem = paintPops.filter(function(item){ return item.pop.contains(document.activeElement); })[0];
    paintPops.forEach(function(item){ setPaintPopover(item, false); });
    document.getElementById('heroBlock').classList.remove('theme-flyout-open');
    if(returnFocus && focusedItem) focusedItem.btn.focus();
  }
  function wirePaintToggle(btnId, popId){
    var btn = document.getElementById(btnId);
    var pop = document.getElementById(popId);
    if(!btn || !pop) return;
    paintPops.push({ btn: btn, pop: pop });
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var willShow = !pop.classList.contains('show');
      paintPops.forEach(function(p){ setPaintPopover(p, false); });
      if(willShow) setPaintPopover(paintPops.filter(function(p){ return p.pop === pop; })[0], true);
      document.getElementById('heroBlock').classList.toggle('theme-flyout-open', willShow);
    });
  }
  wirePaintToggle('paintToggle', 'paintPop');
  wirePaintToggle('navPaintBtn', 'navPaintPop');
  document.addEventListener('click', function(e){
    paintPops.forEach(function(p){
      if(!p.pop.contains(e.target) && e.target !== p.btn){ setPaintPopover(p, false); }
    });
    if(!paintPops.some(function(p){ return p.pop.classList.contains('show'); })){
      document.getElementById('heroBlock').classList.remove('theme-flyout-open');
    }
  });
  document.querySelectorAll('.accentbtn').forEach(function(btn){
    btn.addEventListener('click', function(){ settings.uiAccent = btn.getAttribute('data-accentval'); fireWipe(btn); applyLook(); });
  });
  document.querySelectorAll('.rememberChk').forEach(function(chk){
    chk.addEventListener('change', function(e){
      settings.rememberLook = e.target.checked; saveSettings();
    });
  });

  function fmt(n){ var r = Math.round(n); return '$' + r.toLocaleString('en-US'); }
  function pct(p){ return Math.round(p * 100); }
  function num(v, fallback){ var n = parseFloat(v); return isNaN(n) ? fallback : n; }

  function computePay(hours, revenue, tips, productSales, forceHours){
    return calculatePay({
      hours:num(hours,0), serviceRevenue:num(revenue,0), tips:num(tips,0),
      productSales:num(productSales,0), forceHours:!!forceHours
    }, {
      workerType:settings.workerType,
      minimumWage:settings.minWage,
      ficaRate:settings.ficaRate,
      standardDeduction:settings.stdDeduction,
      tipsDeductionCap:settings.tipsDeductionCap,
      tipsDeductionAssumed:settings.tipsDeductionAssumed,
      brackets:settings.brackets
    });
  }

  function animateNumberTo(el, from, to, duration){
    if(from === null || from === undefined || isNaN(from)) from = to;
    var start = null;
    function easeOutExpo(t){ return t===1 ? 1 : 1 - Math.pow(2, -10*t); }
    function step(ts){
      if(!start) start = ts;
      var p = Math.min(1, (ts - start) / duration);
      var eased = easeOutExpo(p);
      var val = from + (to - from) * eased;
      el.textContent = fmt(val);
      if(p < 1) requestAnimationFrame(step);
      else el.textContent = fmt(to);
    }
    requestAnimationFrame(step);
  }

  function setPoppingText(el, value){
    if(!el) return;
    var next = String(value);
    var current = el.dataset.motionValue !== undefined ? el.dataset.motionValue : el.textContent;
    var hadValue = current !== '';
    if(current === next){ el.dataset.motionValue = next; return; }
    el.dataset.motionValue = next;
    el.textContent = next;
    if(hadValue){
      el.classList.remove('value-pop'); void el.offsetWidth; el.classList.add('value-pop');
      setTimeout(function(){ el.classList.remove('value-pop'); }, 420);
    }
  }

  function staggerRows(container, selector){
    var rows = container.querySelectorAll(selector || '.nrow');
    rows.forEach(function(row){ row.classList.remove('in'); });
    rows.forEach(function(row, i){
      setTimeout(function(){ row.classList.add('in'); }, 50 + i * 55);
    });
  }

  var PROFILE_GREETINGS = [
    'Hello, {name}! Stay groovy.',
    'Hey, {name}! Looking dyn-o-mite.',
    'Right on, {name}! Let\u2019s count that cheddar.',
    'Yo, {name}! All that and a bag of chips.',
    'What\u2019s crackalackin\u2019, {name}?',
    'Hey, {name}! This paycheck is about to be da bomb.',
    'Sup, {name}? Let\u2019s make these numbers slap.',
    '{name} has entered the chat. Iconic behavior.',
    'Oh snap, {name}! The math is mathing.',
    'Heyyy, {name}! Let\u2019s get this bread.',
    'Ayo, {name}! Immaculate paycheck vibes.',
    'Hello, {name}! No cap, you\u2019re crushing it.',
    'Hey, {name}! Slay responsibly.',
    'Greetings, {name}! Very demure. Very on payroll.',
    'Well, well, well\u2026 if it isn\u2019t {name}.',
    'Hello, {name}! Big money energy, respectfully.',
    'Yo, {name}! It\u2019s giving gainfully employed.',
    'Hey, {name}! The vibes are fiscally immaculate.'
  ];
  var profileGreetingPattern = PROFILE_GREETINGS[Math.floor(Math.random() * PROFILE_GREETINGS.length)];

  function renderHeader(){
    var wageLabel = settings.wageMode === 'full' ? 'full minimum wage' : 'tipped minimum wage';
    var rawProfileName = settings.profileName ? settings.profileName.trim() : '';
    var profileName = rawProfileName ? escapeHtml(rawProfileName) : '';
    var heroName = document.getElementById('profileNameHero');
    heroName.textContent = rawProfileName ? profileGreetingPattern.replace('{name}', rawProfileName) : '';
    heroName.classList.toggle('show', !!rawProfileName);
    var navTitle = document.getElementById('heroNavbarTitle');
    navTitle.innerHTML = profileName ? ('<strong>' + profileName + '</strong><small>The Take</small>') : '<small>The Take</small>';
    document.getElementById('subtext').innerHTML =
      'Enter or scan sales to see what you actually take home. Service commission is <b>45% of the first $1,200</b> and <b>70% above $1,200</b>, plus <b>10% of retail</b> and your tips. ' +
      'FICA is estimated at <b>' + (settings.ficaRate*100).toFixed(2) + '%</b>. ' +
      (settings.workerType === 'part-time' ? ('Hours are optional unless you need to check the ' + wageLabel + ' floor.') : 'Full-time calculations go straight to commission; no hours upload required.');
  }

  function renderActual(){
    var r = computePay(ui.hours, ui.revenue, ui.tips, ui.productSales);

    document.getElementById('floorFlagRow').style.display = r.floorApplies ? 'flex' : 'none';
    setPoppingText(document.getElementById('outGross'), fmt(r.grossWeekly));
    setPoppingText(document.getElementById('outAfterFica'), fmt(r.afterFicaWeekly));
    setPoppingText(document.getElementById('outNet'), fmt(r.netWeekly));

    var netHeroEl = document.getElementById('netHeroVal');
    if(lastNet !== null && Math.round(lastNet) !== Math.round(r.netWeekly)){
      netHeroEl.classList.remove('bump');
      void netHeroEl.offsetWidth;
      netHeroEl.classList.add('bump');
      clearTimeout(netHeroEl._bumpTimer);
      netHeroEl._bumpTimer = setTimeout(function(){ netHeroEl.classList.remove('bump'); }, 420);
    }
    animateNumberTo(netHeroEl, lastNet, r.netWeekly, 380);
    document.getElementById('netHeroContext').textContent =
      fmt(r.grossWeekly) + ' gross \u2192 ' + fmt(r.ficaWeekly) + ' FICA \u2192 ' + fmt(r.fedWeekly) + ' fed = net above';
    lastNet = r.netWeekly;

    var baseLabel = r.floorApplies ? 'Base pay (floor)' : 'Earned commission';

    var nb = document.getElementById('nutritionRows');
    nb.innerHTML =
      '<div class="nrow"><div class="nk">' + baseLabel + '</div><div class="nv">' + fmt(r.base) + '</div></div>' +
      (r.floorApplies ? '<div class="nrow nutrition-sub"><div class="nk"><span class="op">\u00b7</span> minimum wage floor, ' + ui.hours + ' hrs</div><div class="nv">' + fmt(r.floor) + '</div></div>' : '') +
      '<div class="nrow nutrition-sub"><div class="nk"><span class="op">\u00b7</span> 45% of first $1,200 services</div><div class="nv">' + fmt(r.serviceTierOne) + '</div></div>' +
      (r.serviceTierTwo > 0 ? '<div class="nrow nutrition-sub"><div class="nk"><span class="op">\u00b7</span> 70% above $1,200</div><div class="nv">' + fmt(r.serviceTierTwo) + '</div></div>' : '') +
      (r.productSales > 0 ? '<div class="nrow nutrition-sub"><div class="nk"><span class="op">\u00b7</span> 10% retail commission</div><div class="nv">' + fmt(r.productCommission) + '</div></div>' : '') +
      '<div class="nrow"><div class="nk"><span class="op">+</span> Tips</div><div class="nv">' + fmt(r.tips) + '</div></div>' +
      '<div class="nrow total"><div class="nk"><span class="op">=</span> Gross pay</div><div class="nv">' + fmt(r.grossWeekly) + '</div></div>' +
      '<div class="nrow"><div class="nk"><span class="op">&minus;</span> FICA</div><div class="nv">&minus;' + fmt(r.ficaWeekly) + '</div></div>' +
      '<div class="nrow total"><div class="nk"><span class="op">=</span> After FICA</div><div class="nv">' + fmt(r.afterFicaWeekly) + '</div></div>' +
      '<div class="nrow"><div class="nk"><span class="op">&minus;</span> Est. federal tax</div><div class="nv">&minus;' + fmt(r.fedWeekly) + '</div></div>' +
      '<div class="nrow net"><div class="nk">Est. net pay</div><div class="nv">' + fmt(r.netWeekly) + '</div></div>';
    staggerRows(nb);

    var box = document.getElementById('reconcileBox');
    if(ui.received === null || isNaN(ui.received)){
      box.className = 'reconcile';
      box.innerHTML = '';
    } else {
      var diffGross = Math.abs(ui.received - r.grossWeekly);
      var diffNet = Math.abs(ui.received - r.netWeekly);
      box.classList.add('show');
      if(diffGross < 1){
        box.className = 'reconcile show warn';
        box.innerHTML = '\u26a0 The amount you were paid matches <b>gross</b> pay (pre-FICA, pre-federal-tax) almost exactly. ' +
          'That means no taxes appear to have been withheld from this payment &mdash; worth confirming whether you\'re classified as a W-2 employee (who should have withholding) or a 1099 contractor (who handles taxes separately).';
      } else if(diffNet < 1){
        box.className = 'reconcile show ok';
        box.innerHTML = '\u2713 The amount you were paid matches the <b>estimated net pay</b> above almost exactly &mdash; FICA and federal withholding appear to have been applied as expected.';
      } else {
        box.className = 'reconcile show mismatch';
        box.innerHTML = 'This doesn\'t cleanly match either figure &mdash; off by <b>' + fmt(diffGross) + '</b> from gross and <b>' + fmt(diffNet) + '</b> from estimated net. Worth asking for an itemized pay breakdown.';
      }
    }

    renderZoom(r);
  }

  function renderZoom(actualRow){
    var period = PERIODS[ui.zoomPeriod];
    document.getElementById('zoomlabel').textContent = period.label;
    document.getElementById('zoomrows').innerHTML =
      '<div class="zoomrow"><div class="filllabel">' + period.label + '</div>' +
      '<div class="num">' + fmt(actualRow.grossWeekly*period.mult) + '</div>' +
      '<div class="num">' + fmt(actualRow.ficaWeekly*period.mult) + '</div>' +
      '<div class="num net">' + fmt(actualRow.netWeekly*period.mult) + '</div></div>';
    staggerRows(document.getElementById('zoomrows'), '.zoomrow');
  }

  function computeGoal(fillPct){
    var ticket = ui.projTierCustom ? ui.customTicket : settings.tierTickets[ui.projTier];
    var clientsExact = fillPct * SHIFT_CAPACITY;
    return { clientsExact: clientsExact, revenue: clientsExact * ticket };
  }
  function computeProjRow(fillPct){
    var shifts = ui.projHours / 5;
    var goal = computeGoal(fillPct);
    var weeklyRevenue = goal.revenue * shifts;
    var tips = weeklyRevenue * settings.tipRateAssumed;
    return computePay(ui.projHours, weeklyRevenue, tips, ui.projProductSales, settings.workerType === 'part-time');
  }

  function renderProjection(){
    var resolvedTicket = ui.projTierCustom ? ui.customTicket : settings.tierTickets[ui.projTier];
    document.getElementById('tierintro').innerHTML =
      'Assuming a <b style="color:var(--acc3)">$' + resolvedTicket + ' average ticket</b> per client' +
      (ui.projTierCustom ? '' : ' at this tier') + ', ~' + SHIFT_CAPACITY + ' slots per 5-hr shift, tips at ' + Math.round(settings.tipRateAssumed*100) + '% of services' +
      (ui.projProductSales ? ', and ' + fmt(ui.projProductSales) + ' weekly retail' : '') + '.';

    var goalHtml = '';
    FILL_RATES.forEach(function(fr){
      var g = computeGoal(fr.pct);
      goalHtml += '<div class="goalrow"><div class="filllabel">' + fr.label + ' <small>~' + pct(fr.pct) + '%</small></div>' +
        '<div class="num">' + fmt(g.revenue) + '</div><div class="num">~' + Math.round(g.clientsExact) + '</div></div>';
    });
    document.getElementById('goalrows').innerHTML = goalHtml;
    staggerRows(document.getElementById('goalrows'), '.goalrow');

    document.getElementById('breakdownfloor').textContent = settings.workerType === 'part-time' ? ('floor $' + Math.round(settings.minWage * ui.projHours)) : 'commission';

    var rowsHtml = '';
    FILL_RATES.forEach(function(fr){
      var r = computeProjRow(fr.pct);
      rowsHtml += '<div class="zoomrow' + (r.floorApplies?' floor-applies':'') + '">' +
        '<div class="filllabel">' + fr.label + ' <small>~' + pct(fr.pct) + '%</small>' + (r.floorApplies?' <span class="floorflag">FLOOR</span>':'') + '</div>' +
        '<div class="num">' + fmt(r.grossWeekly) + '</div><div class="num">' + fmt(r.ficaWeekly) + '</div>' +
        '<div class="num net">' + fmt(r.netWeekly) + '</div></div>';
    });
    document.getElementById('projrows').innerHTML = rowsHtml;
    staggerRows(document.getElementById('projrows'), '.zoomrow');

    document.querySelectorAll('#shiftbar .tabbtn').forEach(function(btn){
      var h = btn.getAttribute('data-hours');
      var isCustom = h === 'custom';
      btn.classList.toggle('active', ui.projHoursCustom ? isCustom : (!isCustom && parseInt(h,10) === ui.projHours));
    });
    document.getElementById('shiftCustomWrap').classList.toggle('show', ui.projHoursCustom);

    document.querySelectorAll('#tierbar .tabbtn').forEach(function(btn){
      var t = btn.getAttribute('data-tier');
      var isCustom = t === 'custom';
      btn.classList.toggle('active', ui.projTierCustom ? isCustom : (!isCustom && t === ui.projTier));
    });
    document.getElementById('tierCustomWrap').classList.toggle('show', ui.projTierCustom);

    syncTierSlider(ui.projTierCustom ? 'custom' : ui.projTier);
    syncShiftSlider(ui.projHoursCustom ? 'custom' : String(ui.projHours));
  }

  function renderHistory(){
    var countEl = document.getElementById('historyCount');
    countEl.textContent = history.length + (history.length===1 ? ' SAVED' : ' SAVED');
    var empty = document.getElementById('historyEmpty');
    var wrap = document.getElementById('historyRows');
    var clearRow = document.getElementById('historyClearRow');

    if(!history.length){
      empty.style.display = 'block';
      wrap.innerHTML = '';
      clearRow.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    clearRow.style.display = 'flex';

    var totalNet = history.reduce(function(s,h){ return s + h.net; }, 0);
    var html = '<div class="historysummary">' + history.length + ' saved &middot; ' + fmt(totalNet) + ' total net</div>';
    history.forEach(function(h){
      var hrs = Math.round((h.hours||0)*100)/100;
      var labelHtml = h.label ? escapeHtml(h.label) + ' <span class="historydate">' + fmtDate(h.savedAt) + '</span>' : fmtDate(h.savedAt);
      html += '<div class="historyrow" data-id="'+h.id+'">' +
        '<div class="historyrow-main"><div class="historylabel">' + labelHtml + '</div>' +
        '<div class="historynet">' + fmt(h.net) + '</div></div>' +
        '<div class="historyrow-sub">' + (hrs ? (hrs + ' hrs &middot; ') : '') + fmt(h.revenue) + ' services &middot; ' + fmt(h.productSales||0) + ' retail &middot; ' + fmt(h.tips) + ' tips' + (h.floorApplies ? ' &middot; floor' : '') + '</div>' +
        '<button type="button" class="historydel" data-id="'+h.id+'" aria-label="Delete saved period">&times;</button>' +
        '</div>';
    });
    wrap.innerHTML = html;
    staggerRows(wrap, '.historyrow');

    wrap.querySelectorAll('.historyrow').forEach(function(row){
      row.addEventListener('click', function(){
        var id = row.getAttribute('data-id');
        var rec = history.filter(function(h){ return h.id === id; })[0];
        if(!rec) return;
        ui.hours = rec.hours || 0; ui.revenue = rec.revenue; ui.tips = rec.tips; ui.received = rec.received;
        ui.productSales = rec.productSales || 0;
        document.getElementById('inHours').value = rec.hours || '';
        document.getElementById('inRevenue').value = rec.revenue || '';
        document.getElementById('inProductSales').value = rec.productSales || '';
        document.getElementById('inTips').value = rec.tips || '';
        document.getElementById('inReceived').value = (rec.received!==null && rec.received!==undefined) ? rec.received : '';
        document.getElementById('manualEntry').setAttribute('open','');
        renderActual();
        closeHistory();
        window.scrollTo({ top:0, behavior:'smooth' });
      });
    });
    wrap.querySelectorAll('.historydel').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id = btn.getAttribute('data-id');
        history = history.filter(function(h){ return h.id !== id; });
        saveHistory(); renderHistory();
      });
    });
  }

  function renderAll(){
    renderHeader();
    renderActual();
    renderProjection();
    renderHistory();
    document.querySelectorAll('#periodbar .periodbtn').forEach(function(btn){
      var isActive = btn.getAttribute('data-period') === ui.zoomPeriod;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  function renderBracketRows(){
    var html = '';
    settings.brackets.forEach(function(b, i){
      var isLast = i === settings.brackets.length - 1;
      html += '<div class="bracketrow" data-idx="'+i+'">' +
        '<div class="fieldrow"><input type="number" class="bRate" aria-label="Federal tax rate for bracket '+(i+1)+'" step="0.5" min="0" max="100" value="'+(b.rate*100)+'"><span>%</span></div>' +
        '<div class="fieldrow">' + (isLast ? '<span style="flex:1;">and up</span>' : '<span>$</span><input type="number" class="bUpTo" aria-label="Upper income limit for bracket '+(i+1)+'" step="100" min="0" value="'+b.upTo+'">') + '</div>' +
        (settings.brackets.length>1 ? '<button type="button" class="rmbtn" data-rm="'+i+'" aria-label="Remove federal tax bracket '+(i+1)+'">&times;</button>' : '<span></span>') +
        '</div>';
    });
    document.getElementById('bracketRows').innerHTML = html;

    document.querySelectorAll('.bRate').forEach(function(inp, i){
      inp.addEventListener('input', function(){
        settings.brackets[i].rate = num(inp.value,0)/100; saveSettings(); renderAll();
      });
    });
    document.querySelectorAll('.bUpTo').forEach(function(inp){
      inp.addEventListener('input', function(){
        var idx = parseInt(inp.closest('.bracketrow').getAttribute('data-idx'),10);
        settings.brackets[idx].upTo = num(inp.value, settings.brackets[idx].upTo);
        saveSettings(); renderAll();
      });
    });
    document.querySelectorAll('.rmbtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var idx = parseInt(btn.getAttribute('data-rm'),10);
        settings.brackets.splice(idx,1);
        settings.brackets[settings.brackets.length - 1].upTo = null;
        saveSettings(); renderBracketRows(); renderAll();
      });
    });
  }

  function populateStateDropdown(){
    var sel = document.getElementById('setState');
    var html = '';
    Object.keys(STATE_MIN_WAGE).forEach(function(code){
      var label = code === 'OTHER' ? 'Other / not listed' : code;
      html += '<option value="'+code+'">'+label+'</option>';
    });
    sel.innerHTML = html;
    sel.value = settings.state;
  }

  function populateProfileSettings(){
    var loc = document.getElementById('setLocation');
    loc.innerHTML = locationOptions(true);
    loc.value = settings.location || '';
    document.getElementById('setProfileName').value = settings.profileName || '';
    document.querySelectorAll('#workerTypeToggle .periodbtn').forEach(function(btn){
      var isActive = btn.getAttribute('data-workertype') === settings.workerType;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  function renderSettingsForm(){
    document.getElementById('setMinWage').value = settings.minWage;
    document.getElementById('setTipRate').value = settings.tipRateAssumed*100;
    document.getElementById('setFica').value = (settings.ficaRate*100).toFixed(2);
    document.getElementById('setStdDeduction').value = settings.stdDeduction;
    document.getElementById('setTipsDeduction').value = settings.tipsDeductionAssumed;
    document.getElementById('setTicketBudget').value = settings.tierTickets.budget;
    document.getElementById('setTicketLow').value = settings.tierTickets.low;
    document.getElementById('setTicketAvg').value = settings.tierTickets.average;
    document.getElementById('setTicketHigh').value = settings.tierTickets.high;
    document.getElementById('setTicketPremium').value = settings.tierTickets.premium;
    document.getElementById('minWageNote').textContent = (STATE_MIN_WAGE[settings.state]||STATE_MIN_WAGE.OTHER).note + ' (reference figure, always verify.)';
    document.querySelectorAll('#wageModeToggle .periodbtn').forEach(function(btn){
      var isActive = btn.getAttribute('data-wagemode') === settings.wageMode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
    renderBracketRows();
  }

  document.getElementById('inHours').addEventListener('input', function(e){ ui.hours = num(e.target.value,0); renderActual(); });
  document.getElementById('inRevenue').addEventListener('input', function(e){ ui.revenue = num(e.target.value,0); renderActual(); });
  document.getElementById('inProductSales').addEventListener('input', function(e){ ui.productSales = num(e.target.value,0); renderActual(); });
  document.getElementById('inTips').addEventListener('input', function(e){ ui.tips = num(e.target.value,0); renderActual(); });
  document.getElementById('inReceived').addEventListener('input', function(e){
    ui.received = e.target.value === '' ? null : num(e.target.value, null);
    renderActual();
  });
  document.getElementById('saveHistoryBtn').addEventListener('click', function(){
    var r = computePay(ui.hours, ui.revenue, ui.tips, ui.productSales);
    var labelInput = document.getElementById('historyLabel');
    var rec = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2,7),
      savedAt: Date.now(),
      label: labelInput.value.trim(),
      hours: ui.hours, revenue: ui.revenue, tips: ui.tips, received: ui.received,
      productSales:ui.productSales,
      gross: r.grossWeekly, fica: r.ficaWeekly, fed: r.fedWeekly, net: r.netWeekly,
      floorApplies: r.floorApplies
    };
    history.unshift(rec);
    saveHistory();
    labelInput.value = '';
    renderHistory();
  });
  document.getElementById('clearHistoryBtn').addEventListener('click', function(){
    if(!confirm('Clear all saved history? This can\'t be undone.')) return;
    history = [];
    saveHistory(); renderHistory();
  });

  function selectHours(h){
    if(h === 'custom'){
      ui.projHoursCustom = true;
      ui.projHours = ui.customHours;
      document.getElementById('shiftCustomInput').value = ui.customHours;
      renderProjection();
      document.getElementById('shiftCustomInput').focus();
    } else {
      ui.projHoursCustom = false;
      ui.projHours = parseInt(h, 10);
      renderProjection();
    }
  }
  document.querySelectorAll('#shiftbar .tabbtn').forEach(function(btn){
    btn.addEventListener('click', function(){ selectHours(btn.getAttribute('data-hours')); });
  });
  document.getElementById('shiftCustomInput').addEventListener('input', function(e){
    ui.customHours = Math.max(1, num(e.target.value, ui.customHours));
    ui.projHours = ui.customHours;
    renderProjection();
  });

  function selectTier(t){
    if(t === 'custom'){
      ui.projTierCustom = true;
      document.getElementById('tierCustomInput').value = ui.customTicket;
      renderProjection();
      document.getElementById('tierCustomInput').focus();
    } else {
      ui.projTierCustom = false;
      ui.projTier = t;
      renderProjection();
    }
  }
  document.querySelectorAll('#tierbar .tabbtn').forEach(function(btn){
    btn.addEventListener('click', function(){ selectTier(btn.getAttribute('data-tier')); });
  });
  document.getElementById('tierCustomInput').addEventListener('input', function(e){
    ui.customTicket = Math.max(0, num(e.target.value, ui.customTicket));
    renderProjection();
  });

  var syncShiftSlider = initStepSlider({
    order: HOUR_ORDER, glyphs: HOUR_GLYPHS, names: HOUR_NAMES,
    rangeId: 'shiftRangeInput', glyphId: 'shiftSliderGlyph', nameId: 'shiftSliderName', amtId: 'shiftSliderAmt',
    ticksId: 'shiftSliderTicks',
    amtFn: function(k){ return k === 'custom' ? 'exact hrs' : (HOUR_SHIFTS[k] + ' shifts'); },
    onSelect: selectHours
  });
  var syncTierSlider = initStepSlider({
    order: TIER_ORDER, glyphs: TIER_GLYPHS, names: TIER_NAMES,
    rangeId: 'tierRangeInput', glyphId: 'tierSliderGlyph', nameId: 'tierSliderName', amtId: 'tierSliderAmt',
    ticksId: 'tierSliderTicks',
    amtFn: function(k){ return k === 'custom' ? 'exact $' : ('$' + settings.tierTickets[k] + ' avg'); },
    onSelect: selectTier
  });

  document.querySelectorAll('#goalPeriodBar .periodbtn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var gp = btn.getAttribute('data-goalperiod');
      ui.goalPeriod = gp;
      document.querySelectorAll('#goalPeriodBar .periodbtn').forEach(function(b){
        b.classList.toggle('active', b===btn);
        b.setAttribute('aria-pressed', String(b===btn));
      });
      document.querySelectorAll('.goalperiod-panel').forEach(function(p){
        p.style.display = (p.getAttribute('data-goalperiod') === gp) ? 'block' : 'none';
      });
    });
  });
  document.querySelectorAll('#goalPeriodBar .periodbtn').forEach(function(btn){
    var isActive = btn.getAttribute('data-goalperiod') === ui.goalPeriod;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
  document.querySelectorAll('.goalperiod-panel').forEach(function(p){
    p.style.display = (p.getAttribute('data-goalperiod') === ui.goalPeriod) ? 'block' : 'none';
  });
  document.querySelectorAll('#periodbar .periodbtn').forEach(function(btn){
    btn.addEventListener('click', function(){
      ui.zoomPeriod = btn.getAttribute('data-period');
      renderActual();
      document.querySelectorAll('#periodbar .periodbtn').forEach(function(b){
        b.classList.toggle('active', b===btn);
        b.setAttribute('aria-pressed', String(b===btn));
      });
    });
  });

  var payInfoWrap = document.getElementById('payInfoWrap');
  var payInfoToggle = document.getElementById('payInfoToggle');
  var payInfoPopover = document.getElementById('payInfoPopover');
  function setPayInfo(open){
    payInfoPopover.classList.toggle('show', open);
    payInfoPopover.setAttribute('aria-hidden', String(!open));
    payInfoPopover.inert = !open;
    payInfoToggle.setAttribute('aria-expanded', String(open));
    if(open) requestAnimationFrame(function(){ payInfoPopover.focus(); });
  }
  payInfoToggle.addEventListener('click', function(){
    setPayInfo(payInfoToggle.getAttribute('aria-expanded') !== 'true');
  });
  document.getElementById('payInfoClose').addEventListener('click', function(){
    setPayInfo(false); payInfoToggle.focus();
  });
  document.addEventListener('click', function(e){
    if(payInfoToggle.getAttribute('aria-expanded') === 'true' && !payInfoWrap.contains(e.target)) setPayInfo(false);
  });

  var historyLayer = document.getElementById('historyLayer');
  var historyToggle = document.getElementById('historyToggle');
  var navHistoryToggle = document.getElementById('navHistoryBtn');
  var historyPopoverEl = document.getElementById('historyPopover');
  var historyOrigin = null;
  var historyCloseTimer = null;
  function setHistoryExpanded(expanded){
    historyToggle.setAttribute('aria-expanded', String(expanded));
    if(navHistoryToggle) navHistoryToggle.setAttribute('aria-expanded', String(expanded));
  }
  function historyFlipKeyframes(origin){
    if(!origin || !origin.isConnected) return null;
    var layerRect = historyLayer.getBoundingClientRect();
    var target = {
      width:historyPopoverEl.offsetWidth, height:historyPopoverEl.offsetHeight,
      left:layerRect.left + historyLayer.clientWidth/2 - historyPopoverEl.offsetWidth/2,
      top:layerRect.top + historyPopoverEl.offsetTop
    };
    var source = origin.getBoundingClientRect();
    var dx = source.left + source.width/2 - (target.left + target.width/2);
    var dy = source.top + source.height/2 - (target.top + target.height/2);
    var sx = Math.max(.16, Math.min(.48, source.width/target.width));
    var sy = Math.max(.16, Math.min(.48, source.height/target.height));
    return { translate:dx+'px '+dy+'px', scale:sx+' '+sy };
  }
  function openHistory(e){
    closeDrawer();
    clearTimeout(historyCloseTimer);
    historyLayer.classList.remove('closing');
    historyOrigin = e && e.currentTarget ? e.currentTarget : historyToggle;
    var heroBottom = document.getElementById('heroBlock').getBoundingClientRect().bottom;
    historyLayer.style.top = Math.max(NAV_H, Math.round(heroBottom)) + 'px';
    historyLayer.inert = false;
    historyLayer.classList.add('show');
    historyLayer.setAttribute('aria-hidden', 'false');
    setHistoryExpanded(true);
    requestAnimationFrame(function(){
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(historyPopoverEl.animate && !reduceMotion){
        var from = historyFlipKeyframes(historyOrigin);
        if(from) historyPopoverEl.animate([from,{translate:'0px 0px',scale:'1 1'}],{duration:380,easing:'cubic-bezier(.32,.72,0,1)'});
      }
      historyPopoverEl.focus();
    });
  }
  function closeHistory(){
    if(!historyLayer || !historyLayer.classList.contains('show') || historyLayer.classList.contains('closing')) return;
    historyLayer.setAttribute('aria-hidden', 'true');
    historyLayer.inert = true;
    setHistoryExpanded(false);
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var to = historyFlipKeyframes(historyOrigin);
    if(historyPopoverEl.animate && !reduceMotion && to){
      historyLayer.classList.add('closing');
      historyPopoverEl.animate([{translate:'0px 0px',scale:'1 1',opacity:1},Object.assign({opacity:0},to)],{duration:300,easing:'cubic-bezier(.7,0,.84,0)'});
      historyCloseTimer = setTimeout(function(){
        historyLayer.classList.remove('show','closing');
        if(historyOrigin) historyOrigin.focus();
      },300);
    } else {
      historyLayer.classList.remove('show','closing');
      if(historyOrigin) historyOrigin.focus();
    }
  }

  var drawer = document.getElementById('drawer');
  var backdrop = document.getElementById('backdrop');
  var settingsToggle = document.getElementById('settingsToggle');
  var navSettingsToggle = document.getElementById('navSettingsBtn');
  var drawerOrigin = null;
  function setSettingsExpanded(expanded){
    settingsToggle.setAttribute('aria-expanded', String(expanded));
    if(navSettingsToggle) navSettingsToggle.setAttribute('aria-expanded', String(expanded));
  }
  function openDrawer(){
    drawerOrigin = document.activeElement;
    drawer.scrollTop = 0;
    drawer.inert = false;
    drawer.setAttribute('aria-hidden','false');
    document.querySelector('.page').inert = true;
    document.getElementById('installBtn').inert = true;
    document.body.classList.add('drawer-open');
    setSettingsExpanded(true);
    drawer.classList.add('show'); backdrop.classList.add('show');
    requestAnimationFrame(function(){ backdrop.classList.add('in'); document.getElementById('closeDrawer').focus(); });
  }
  function closeDrawer(){
    if(!drawer.classList.contains('show')) return;
    drawer.classList.remove('show'); backdrop.classList.remove('in');
    drawer.setAttribute('aria-hidden','true');
    drawer.inert = true;
    document.querySelector('.page').inert = false;
    document.getElementById('installBtn').inert = false;
    document.body.classList.remove('drawer-open');
    setSettingsExpanded(false);
    setTimeout(function(){ backdrop.classList.remove('show'); }, 300);
    if(drawerOrigin && drawerOrigin.isConnected) requestAnimationFrame(function(){ drawerOrigin.focus(); });
  }
  historyToggle.addEventListener('click', openHistory);
  if(navHistoryToggle) navHistoryToggle.addEventListener('click', openHistory);
  document.getElementById('closeHistory').addEventListener('click', closeHistory);
  document.getElementById('historyDismiss').addEventListener('click', closeHistory);
  settingsToggle.addEventListener('click', function(){ closeHistory(); openDrawer(); });
  document.getElementById('closeDrawer').addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      var payInfoWasOpen = payInfoToggle.getAttribute('aria-expanded') === 'true';
      setPayInfo(false);
      if(payInfoWasOpen) payInfoToggle.focus();
      closeHistory();
      closeDrawer();
      closePaintPops(true);
    }
  });

  document.getElementById('setState').addEventListener('change', function(e){
    settings.state = e.target.value;
    var sw = STATE_MIN_WAGE[settings.state] || STATE_MIN_WAGE.OTHER;
    settings.minWage = settings.wageMode === 'full' ? sw.rate : sw.tippedRate;
    saveSettings(); renderSettingsForm(); renderAll();
  });
  document.querySelectorAll('#wageModeToggle .periodbtn').forEach(function(btn){
    btn.addEventListener('click', function(){
      settings.wageMode = btn.getAttribute('data-wagemode');
      var sw = STATE_MIN_WAGE[settings.state] || STATE_MIN_WAGE.OTHER;
      settings.minWage = settings.wageMode === 'full' ? sw.rate : sw.tippedRate;
      saveSettings(); renderSettingsForm(); renderAll();
    });
  });
  document.getElementById('setMinWage').addEventListener('input', function(e){ settings.minWage = num(e.target.value, settings.minWage); saveSettings(); renderAll(); });
  document.getElementById('setProfileName').addEventListener('input', function(e){ settings.profileName = e.target.value.trimStart(); saveSettings(); renderHeader(); });
  document.getElementById('setLocation').addEventListener('change', function(e){
    settings.location = e.target.value;
    var loc = locationById(settings.location);
    if(loc){
      settings.state = loc.state;
      var sw = STATE_MIN_WAGE[loc.state] || STATE_MIN_WAGE.OTHER;
      settings.minWage = settings.wageMode === 'full' ? sw.rate : sw.tippedRate;
    }
    saveSettings(); populateStateDropdown(); renderSettingsForm(); renderAll();
  });
  document.querySelectorAll('#workerTypeToggle .periodbtn').forEach(function(btn){
    btn.addEventListener('click', function(){
      settings.workerType = btn.getAttribute('data-workertype');
      saveSettings(); applyWorkerType(); populateProfileSettings(); renderAll();
    });
  });
  document.getElementById('setTipRate').addEventListener('input', function(e){ settings.tipRateAssumed = num(e.target.value,0)/100; saveSettings(); renderAll(); });
  document.getElementById('setFica').addEventListener('input', function(e){ settings.ficaRate = num(e.target.value,0)/100; saveSettings(); renderAll(); });
  document.getElementById('setStdDeduction').addEventListener('input', function(e){ settings.stdDeduction = num(e.target.value,0); saveSettings(); renderAll(); });
  document.getElementById('setTipsDeduction').addEventListener('input', function(e){
    var v = num(e.target.value,0); if(v<0) v=0; if(v>25000) v=25000;
    settings.tipsDeductionAssumed = v; saveSettings(); renderAll();
  });
  document.getElementById('setTicketBudget').addEventListener('input', function(e){ settings.tierTickets.budget = num(e.target.value,0); saveSettings(); renderProjection(); });
  document.getElementById('setTicketLow').addEventListener('input', function(e){ settings.tierTickets.low = num(e.target.value,0); saveSettings(); renderProjection(); });
  document.getElementById('setTicketAvg').addEventListener('input', function(e){ settings.tierTickets.average = num(e.target.value,0); saveSettings(); renderProjection(); });
  document.getElementById('setTicketHigh').addEventListener('input', function(e){ settings.tierTickets.high = num(e.target.value,0); saveSettings(); renderProjection(); });
  document.getElementById('setTicketPremium').addEventListener('input', function(e){ settings.tierTickets.premium = num(e.target.value,0); saveSettings(); renderProjection(); });

  document.getElementById('addBracket').addEventListener('click', function(){
    var brackets = settings.brackets;
    var last = brackets[brackets.length-1];
    var prev = brackets.length>1 ? brackets[brackets.length-2].upTo : 0;
    var newCap = (prev||0) + 25000;
    brackets.splice(brackets.length-1, 0, { upTo:newCap, rate:last.rate });
    saveSettings(); renderBracketRows(); renderAll();
  });
  document.getElementById('resetBrackets').addEventListener('click', function(){
    settings.brackets = JSON.parse(JSON.stringify(DEFAULT_BRACKETS));
    saveSettings(); renderBracketRows(); renderAll();
  });
  document.getElementById('resetAll').addEventListener('click', function(){
    if(!confirm('Reset all settings to defaults? This clears anything you\'ve customized.')) return;
    var keepAccent = settings.uiAccent, keepRemember = settings.rememberLook;
    var keepProfile = { onboardingComplete:settings.onboardingComplete, profileName:settings.profileName, workerType:settings.workerType, location:settings.location, state:settings.state };
    settings = JSON.parse(JSON.stringify(DEFAULTS));
    settings.uiAccent = keepAccent; settings.rememberLook = keepRemember;
    Object.assign(settings, keepProfile);
    saveSettings(); applyLook(); applyWorkerType(); populateStateDropdown(); populateProfileSettings(); renderSettingsForm(); renderAll();
  });
  function openExternal(url){
    var opened = window.open(url, '_blank', 'noopener,noreferrer');
    if(opened) opened.opener = null;
  }
  document.getElementById('lookupWage').addEventListener('click', function(){
    var q = encodeURIComponent(settings.state + ' minimum wage 2026');
    openExternal('https://www.google.com/search?q=' + q);
  });
  document.getElementById('lookupTax').addEventListener('click', function(){
    openExternal('https://www.google.com/search?q=' + encodeURIComponent('IRS 2026 federal tax brackets single filer'));
  });

  function fileToImage(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){
        var img = new Image();
        img.onload = function(){ resolve(img); };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function preprocess(img){
    var scale = 2;
    var canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    var id = ctx.getImageData(0,0,canvas.width,canvas.height);
    var d = id.data;
    for(var i=0;i<d.length;i+=4){
      var gray = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
      var inv = 255 - gray;
      d[i]=d[i+1]=d[i+2]=inv;
    }
    ctx.putImageData(id,0,0);
    return canvas;
  }

  function moneyFrom(line){
    var m = line.match(/\$?\s*([\d,]+\.\d{2})/);
    return m ? parseFloat(m[1].replace(/,/g,'')) : null;
  }

  function parseSalesText(text){
    var lines = text.split('\n').map(function(l){return l.trim();}).filter(Boolean);
    var revenue=null, productSales=null, grossTotal=null, tips=null;
    for(var i=0;i<lines.length;i++){
      var low = lines[i].toLowerCase();
      if(revenue===null && low.indexOf('service sales')!==-1){
        revenue = moneyFrom(lines[i]) ?? moneyFrom(lines[i+1]||'');
      }
      if(grossTotal===null && low.indexOf('total gross sales')!==-1){
        grossTotal = moneyFrom(lines[i]) ?? moneyFrom(lines[i+1]||'');
      }
      if(productSales===null && (low.indexOf('product sales')!==-1 || low.indexOf('retail sales')!==-1)){
        productSales = moneyFrom(lines[i]) ?? moneyFrom(lines[i+1]||'');
      }
      if(tips===null && /^tips\b/.test(low)){
        tips = moneyFrom(lines[i]) ?? moneyFrom(lines[i+1]||'');
      }
    }
    if(revenue===null && grossTotal!==null) revenue = Math.max(0, grossTotal - (productSales||0));
    return { revenue: revenue, productSales:productSales, tips: tips };
  }
  function parseTimesheetText(text){
    var m = text.match(/Total[^\d]{0,20}(\d{1,3}):(\d{2})/i);
    if(!m) return { hours:null };
    return { hours: parseInt(m[1],10) + parseInt(m[2],10)/60 };
  }

  function setScanning(btn, isBusy, label, done){
    btn.classList.toggle('busy', isBusy);
    btn.classList.toggle('done', !!done && !isBusy);
    if(label) document.getElementById('scanStatus').textContent = label;
  }

  var ocrProgressHandler = null;
  var ocrWorkerPromise = null;
  function getOcrWorker(){
    if(!ocrWorkerPromise){
      ocrWorkerPromise = createWorker('eng', 1, {
        workerPath:'/ocr/worker.min.js',
        corePath:'/ocr/core',
        langPath:'/ocr/lang',
        logger:function(message){ if(ocrProgressHandler) ocrProgressHandler(message); }
      });
    }
    return ocrWorkerPromise;
  }

  function runOcr(file, btn, kind){
    setScanning(btn, true, 'Reading image\u2026');
    ocrProgressHandler = function(m){
      if(m.status === 'recognizing text'){
        setScanning(btn, true, 'Reading\u2026 ' + Math.round((m.progress||0)*100) + '%');
      }
    };
    fileToImage(file).then(function(img){
      var canvas = preprocess(img);
      return getOcrWorker().then(function(worker){ return worker.recognize(canvas); });
    }).then(function(result){
      var text = result.data.text;
      setScanning(btn, false, '', true);
      if(kind === 'sales'){
        document.getElementById('salesRawWrap').style.display = 'block';
        document.getElementById('salesRawText').textContent = text;
        var parsed = parseSalesText(text);
        var summary = [];
        if(parsed.revenue!==null){ ui.revenue = parsed.revenue; document.getElementById('inRevenue').value = parsed.revenue; summary.push('revenue $'+parsed.revenue); }
        if(parsed.productSales!==null){ ui.productSales = parsed.productSales; document.getElementById('inProductSales').value = parsed.productSales; summary.push('products $'+parsed.productSales); }
        if(parsed.tips!==null){ ui.tips = parsed.tips; document.getElementById('inTips').value = parsed.tips; summary.push('tips $'+parsed.tips); }
        document.getElementById('scanStatus').textContent = summary.length ? ('Read: ' + summary.join(', ') + ' \u2014 double-check below.') : 'Couldn\'t confidently read this one \u2014 check the raw text and enter manually.';
        renderActual();
      } else {
        document.getElementById('timeRawWrap').style.display = 'block';
        document.getElementById('timeRawText').textContent = text;
        var parsedT = parseTimesheetText(text);
        if(parsedT.hours!==null){
          ui.hours = parsedT.hours; document.getElementById('inHours').value = parsedT.hours.toFixed(2);
          document.getElementById('scanStatus').textContent = 'Read: ' + parsedT.hours.toFixed(2) + ' hours \u2014 double-check below.';
        } else {
          document.getElementById('scanStatus').textContent = 'Couldn\'t confidently read hours \u2014 check the raw text and enter manually.';
        }
        renderActual();
      }
    }).catch(function(err){
      setScanning(btn, false, 'Scan failed \u2014 try a clearer screenshot, or enter the numbers by hand.');
      console.error(err);
    }).finally(function(){
      ocrProgressHandler = null;
    });
  }

  document.getElementById('scanSalesBtn').addEventListener('click', function(){ document.getElementById('scanSalesInput').click(); });
  document.getElementById('scanTimeBtn').addEventListener('click', function(){ document.getElementById('scanTimeInput').click(); });
  document.getElementById('scanSalesInput').addEventListener('change', function(e){
    if(e.target.files[0]) runOcr(e.target.files[0], document.getElementById('scanSalesBtn'), 'sales');
  });
  document.getElementById('scanTimeInput').addEventListener('change', function(e){
    if(e.target.files[0]) runOcr(e.target.files[0], document.getElementById('scanTimeBtn'), 'time');
  });

  function initPressMotion(){
    var active = null;
    var suppressed = null;
    var startX = 0, startY = 0;
    var dragThreshold = 8;

    function clearActive(withRelease){
      if(!active) return;
      var el = active;
      active = null;
      el.classList.remove('is-pressed');
      if(withRelease){
        el.classList.remove('is-releasing');
        void el.offsetWidth;
        el.classList.add('is-releasing');
        setTimeout(function(){ el.classList.remove('is-releasing'); el.style.willChange=''; }, 400);
      } else el.style.willChange='';
    }
    document.addEventListener('pointerdown', function(e){
      var el = e.target.closest('button:not(.installbtn)');
      if(!el || el.classList.contains('history-dismiss') || el.closest('.stepslider-ticks') || el.disabled || e.button > 0) return;
      if(active) clearActive(false);
      active = el; startX = e.clientX; startY = e.clientY;
      el.style.willChange = 'transform';
      el.classList.add('motion-press');
      el.classList.remove('is-releasing');
      el.classList.add('is-pressed');
    });
    document.addEventListener('pointermove', function(e){
      if(!active) return;
      if(Math.abs(e.clientX-startX) > dragThreshold || Math.abs(e.clientY-startY) > dragThreshold){
        var el = active;
        el.dataset.suppressMotionClick = '1';
        suppressed = el;
        clearActive(false);
      }
    }, { passive:true });
    document.addEventListener('pointerup', function(){
      clearActive(true);
      if(suppressed){
        var el = suppressed; suppressed = null;
        setTimeout(function(){ delete el.dataset.suppressMotionClick; }, 350);
      }
    });
    document.addEventListener('pointercancel', function(){
      clearActive(false);
      if(suppressed){ delete suppressed.dataset.suppressMotionClick; suppressed = null; }
    });
    document.addEventListener('click', function(e){
      var el = e.target.closest('button[data-suppress-motion-click]');
      if(el){ delete el.dataset.suppressMotionClick; e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }

  function initMotionFocus(){
    if(!('IntersectionObserver' in window)) return;
    var items = document.querySelectorAll('.ledger');
    items.forEach(function(el){ el.classList.add('motion-focus'); });
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        entry.target.classList.toggle('is-focused', entry.intersectionRatio >= .24);
      });
    }, { threshold:[0,.12,.24,.5], rootMargin:'-6% 0px -6% 0px' });
    items.forEach(function(el){ io.observe(el); });
  }

  function initGlassLight(){
    if(!window.matchMedia ||
       window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
       !window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    var surfaces = document.querySelectorAll('.netpay-hero, details.projection');
    surfaces.forEach(function(surface){
      var pending = false, clientX = 0, clientY = 0;
      surface.addEventListener('pointermove', function(e){
        clientX = e.clientX; clientY = e.clientY;
        if(pending) return;
        pending = true;
        requestAnimationFrame(function(){
          var rect = surface.getBoundingClientRect();
          var px = ((clientX-rect.left)/rect.width*100).toFixed(1) + '%';
          var py = ((clientY-rect.top)/rect.height*100).toFixed(1) + '%';
          surface.style.setProperty('--glass-x',px);
          surface.style.setProperty('--glass-y',py);
          pending = false;
        });
      }, { passive:true });
    });
  }

  function initProductSnapFocus(){
    var rail = document.getElementById('productGrid');
    if(!rail || !('IntersectionObserver' in window)) return;
    var cards = rail.querySelectorAll('.productrow');
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){ entry.target.classList.toggle('is-focused',entry.intersectionRatio >= .72); });
    }, { root:rail, threshold:[0,.5,.72,.95] });
    cards.forEach(function(card){ io.observe(card); });
  }

  function initRangeMotion(){
    document.querySelectorAll('.stepslider input[type="range"]').forEach(function(range){
      var slider = range.closest('.stepslider');
      function settle(){
        slider.classList.remove('is-dragging');
        slider.classList.remove('glass-flash'); void slider.offsetWidth; slider.classList.add('glass-flash');
        setTimeout(function(){ slider.classList.remove('glass-flash'); },380);
      }
      range.addEventListener('pointerdown',function(){ slider.classList.add('is-dragging'); });
      range.addEventListener('pointerup',settle);
      range.addEventListener('pointercancel',settle);
      range.addEventListener('change',settle);
    });
  }

  function initReveal(){
    var items = document.querySelectorAll('.reveal, .reveal-scale');
    items.forEach(function(el,idx){ el.style.setProperty('--reveal-delay', Math.min(idx,8)*55 + 'ms'); });
    if(!('IntersectionObserver' in window)){
      items.forEach(function(el){ el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry, i){
        if(entry.isIntersecting){
          var el = entry.target;
          el.classList.add('in');
          io.unobserve(el);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function(el){ io.observe(el); });
  }

  function initProjectionDetails(){
    var details = document.querySelector('details.projection');
    if(!details) return;
    var summary = details.querySelector(':scope > summary');

    // Always begin as the compact invitation, including after form-state
    // restoration in browsers that remember native <details> state.
    details.removeAttribute('open');

    summary.addEventListener('click', function(e){
      e.preventDefault();
      details.classList.remove('tap-cue');
      // Keep the backdrop-filter layer live. View Transition snapshots flatten
      // backdrop-filter on Safari/iOS and made the page blur disappear when
      // this card expanded.
      details.open = !details.open;
      details.classList.remove('glass-flash');
      if(details.open){
        void details.offsetWidth; details.classList.add('glass-flash');
        setTimeout(function(){ details.classList.remove('glass-flash'); }, 540);
      }
    });

    function cue(){
      if(details.open) return;
      setTimeout(function(){ if(!details.open) details.classList.add('tap-cue'); }, 180);
    }
    details.addEventListener('animationend', function(e){
      if(e.animationName === 'projectionTapCue') details.classList.remove('tap-cue');
    });
    if('IntersectionObserver' in window){
      var cueObserver = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){ cue(); cueObserver.unobserve(details); }
        });
      }, { threshold:0.55 });
      cueObserver.observe(details);
    } else {
      cue();
    }
  }

  // ---- Hero scroll behavior: pinned + zooming background, content that shrinks
  // into a compact nav bar, gradient that eases off as you scroll. ----
  function initHeroScroll(){
    var heroBlock = document.getElementById('heroBlock');
    var spacer = document.getElementById('heroSpacer');
    var heroNavbar = document.getElementById('heroNavbar');
    var fullHeroPaint = document.querySelector('.paintwrap.floating');
    if(!heroBlock || !spacer) return;

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduceMotion) return; // CSS fallback already restores the original static hero

    var fullH = 0;
    var ticking = false;
    var wasCompact = null;

    function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

    // Measure the hero's natural full-size height using its CSS min/max-height (the
    // same rule that sizes it before JS runs), then hand height control over to JS by
    // clearing those constraints — otherwise min-height would stop the shrink from
    // ever going below ~62vh. The spacer is set ONCE per measure (not every scroll
    // frame) so it reserves the hero's full height in document flow: the page below
    // scrolls up and is gradually revealed from underneath the shrinking pinned hero,
    // instead of the whole page rushing upward to chase a shrinking spacer.
    function measure(){
      heroBlock.style.minHeight = '';
      heroBlock.style.maxHeight = '';
      heroBlock.style.height = '';
      var h = heroBlock.getBoundingClientRect().height;
      var topSpace = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hero-top-space')) || 0;
      fullH = h || ((window.innerWidth <= 640 ? window.innerHeight * 0.52 : Math.min(window.innerHeight * 0.62, 640)) + topSpace);
      heroBlock.style.minHeight = '0px';
      heroBlock.style.maxHeight = 'none';
      spacer.style.height = fullH + 'px';
    }

    function update(){
      var shrinkDistance = Math.max(160, fullH - NAV_H);
      var progress = Math.max(0, Math.min(1, window.scrollY / shrinkDistance));
      var eased = easeOutCubic(progress);
      var h = fullH + (NAV_H - fullH) * eased;

      heroBlock.style.height = h + 'px';

      var contentP = Math.max(0, Math.min(1, progress / 0.65));
      var navP = Math.max(0, Math.min(1, (progress - 0.45) / 0.55));

      // Set on the root so the shared, page-wide background layer (#pageBg) can
      // react to the same scroll progress as the hero itself, not just descendants
      // of heroBlock.
      var root = document.documentElement.style;
      root.setProperty('--hero-progress', progress.toFixed(4));
      root.setProperty('--hero-content-p', contentP.toFixed(4));
      root.setProperty('--hero-nav-p', navP.toFixed(4));
      var compact = progress > 0.92;
      heroBlock.classList.toggle('compact', compact);
      if(compact !== wasCompact){
        if(heroNavbar){
          heroNavbar.setAttribute('aria-hidden', compact ? 'false' : 'true');
          heroNavbar.inert = !compact;
        }
        if(fullHeroPaint) fullHeroPaint.inert = compact;
        if(wasCompact !== null) closePaintPops();
        wasCompact = compact;
      }

      ticking = false;
    }

    window.addEventListener('scroll', function(){
      if(!ticking){ requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    window.addEventListener('resize', function(){ measure(); update(); });
    window.addEventListener('orientationchange', function(){ measure(); update(); });
    window.addEventListener('load', function(){ measure(); update(); });

    measure();
    update();

    var navSettingsBtn = document.getElementById('navSettingsBtn');
    if(navSettingsBtn){
      navSettingsBtn.addEventListener('click', function(){
        var gearBtn = document.getElementById('settingsToggle');
        if(gearBtn) gearBtn.click();
      });
    }
  }

  // ---- Est. net pay box: pins itself just below the compact hero once it
  // reaches that scroll position, and switches to a shrunk, side-by-side
  // layout while pinned (number left, label/context stacked right). ----
  function initNetHeroSticky(){
    var box = document.getElementById('netHeroBox');
    var sentinel = document.getElementById('netHeroSentinel');
    if(!box || !sentinel || !('IntersectionObserver' in window)) return;

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduceMotion) return;

    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        box.classList.toggle('stuck', !entry.isIntersecting);
      });
    }, { threshold: 0, rootMargin: '-' + (NAV_H + 14 + 1) + 'px 0px 0px 0px' });
    io.observe(sentinel);
  }

  // ---- Once the main cards are on screen, add a touch of blur + grain to the
  // shared page background so it recedes behind them instead of competing.
  // This stays on for the rest of the page (footnotes, projection tool, etc.
  // sit past the cards-grid too) — it only latches back off if the user
  // scrolls back up above the hero entirely. ----
  function initBgCardsObserver(){
    var cards = document.querySelector('.cards-grid');
    if(!cards || !('IntersectionObserver' in window)) return;
    var activated = false;
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting) activated = true;
        document.documentElement.classList.toggle('cards-visible', activated);
      });
    }, { threshold: 0, rootMargin: '-15% 0px -55% 0px' });
    io.observe(cards);

    window.addEventListener('scroll', function(){
      if(window.scrollY <= 4 && activated){
        activated = false;
        document.documentElement.classList.remove('cards-visible');
      }
    }, { passive: true });
  }

  // ---- Add to Home Screen ----

  // Builds a manual "Add to Home Screen" walkthrough tailored to the browser
  // and OS version actually in use — e.g. iOS 26's Safari redesign tucks the
  // Share icon behind a "•••" button, so the old two-step Share-first flow is
  // wrong there even though it still works on iOS 25 and earlier.
  function installStepsHTML(){
    var ua = navigator.userAgent || '';
    var isIOS = /iphone|ipad|ipod/i.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if(isIOS){
      var isCriOS = /CriOS/i.test(ua);
      var isFxiOS = /FxiOS/i.test(ua);
      var isEdgiOS = /EdgiOS/i.test(ua);
      var isSafari = !isCriOS && !isFxiOS && !isEdgiOS;

      var verMatch = ua.match(/OS (\d+)_\d+(?:_\d+)? like Mac OS X/);
      var iosVer = verMatch ? parseInt(verMatch[1], 10) : null;

      var steps;
      if(isSafari){
        if(iosVer !== null && iosVer >= 26){
          steps = [
            'Tap the <b>•••</b> button in Safari\u2019s toolbar (or the Share icon, if you see it directly)',
            'Tap <b>Share</b> in the menu that opens',
            'Scroll down and tap <b>Add to Home Screen</b>',
            'Tap <b>Add</b> &mdash; The Take opens full-screen, like an app'
          ];
        } else {
          steps = [
            'Tap the <b>Share</b> icon in Safari\u2019s toolbar',
            'Scroll down and tap <b>Add to Home Screen</b>',
            'Tap <b>Add</b> &mdash; The Take opens full-screen, like an app'
          ];
        }
      } else {
        var browserName = isCriOS ? 'Chrome' : isFxiOS ? 'Firefox' : isEdgiOS ? 'Edge' : 'your browser';
        steps = [
          'Tap the <b>Share</b> or menu icon in ' + browserName,
          'Choose <b>Add to Home Screen</b>',
          'Confirm &mdash; The Take opens full-screen, like an app'
        ];
      }
    } else {
      // Non-iOS fallback (e.g. Firefox, which has no beforeinstallprompt event)
      steps = [
        'Open your browser\u2019s menu',
        'Look for <b>Install app</b> or <b>Add to Home Screen</b>',
        'Confirm &mdash; The Take opens full-screen, like an app'
      ];
    }

    return steps.map(function(s, i){
      return '<div class="iospop-step"><span class="iospop-num">' + (i + 1) + '</span> ' + s + '</div>';
    }).join('');
  }

  function initInstallPrompt(){
    var btn = document.getElementById('installBtn');
    var iosPop = document.getElementById('iosInstallPop');
    var stepsEl = document.getElementById('iospopSteps');
    if(!btn) return;

    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if(isStandalone) return; // already installed, nothing to offer

    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    var deferredPrompt = null;
    var hideTimer = null;
    var everShown = false;
    var HIDE_AFTER_MS = 7000;

    function setInstallPopover(open){
      if(!iosPop) return;
      iosPop.classList.toggle('show', open);
      iosPop.setAttribute('aria-hidden', String(!open));
      iosPop.inert = !open;
      btn.setAttribute('aria-expanded', String(open));
      if(open){
        clearTimeout(hideTimer);
        requestAnimationFrame(function(){ iosPop.focus(); });
      }
    }

    function showBtn(){
      if(everShown) return;
      everShown = true;
      btn.removeAttribute('aria-hidden');
      btn.tabIndex = 0;
      btn.style.display = 'flex';
      hideTimer = setTimeout(hideBtn, HIDE_AFTER_MS);
    }
    function hideBtn(){
      clearTimeout(hideTimer);
      btn.classList.add('hide');
      btn.setAttribute('aria-hidden','true');
      btn.tabIndex = -1;
      setInstallPopover(false);
      if(document.activeElement === btn || (iosPop && iosPop.contains(document.activeElement))) btn.blur();
    }

    // Disappear the instant the user scrolls — the nudge shouldn't linger
    // over content once they're engaging with the page.
    window.addEventListener('scroll', hideBtn, { passive: true, once: true });

    var iosPopClose = document.getElementById('iosPopClose');
    if(iosPopClose && iosPop){
      iosPopClose.addEventListener('click', function(){
        setInstallPopover(false);
        btn.focus();
        hideTimer = setTimeout(hideBtn, 2000);
      });
      document.addEventListener('keydown', function(e){
        if(e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true'){
          setInstallPopover(false);
          btn.focus();
          hideTimer = setTimeout(hideBtn, 2000);
        }
      });
    }

    if(isIOS){
      // iOS has no beforeinstallprompt — show the button, and on tap, explain
      // the manual Share -> Add to Home Screen flow (worded for this device's
      // actual browser + iOS version).
      if(stepsEl) stepsEl.innerHTML = installStepsHTML();
      btn.addEventListener('click', function(){
        setInstallPopover(btn.getAttribute('aria-expanded') !== 'true');
      });
      showBtn();
    } else {
      window.addEventListener('beforeinstallprompt', function(e){
        e.preventDefault();
        deferredPrompt = e;
        showBtn();
      });
      btn.addEventListener('click', function(){
        if(!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function(){
          deferredPrompt = null;
          hideBtn();
        });
      });
      window.addEventListener('appinstalled', hideBtn);

      // Browsers with no beforeinstallprompt support at all (Firefox desktop
      // & Android, older Edge, etc.) — fall back to manual instructions
      // rather than never offering the button.
      setTimeout(function(){
        if(deferredPrompt || everShown) return;
        if(stepsEl) stepsEl.innerHTML = installStepsHTML();
        btn.addEventListener('click', function(){
          setInstallPopover(btn.getAttribute('aria-expanded') !== 'true');
        });
        showBtn();
      }, 2500);
    }
  }

  function initServiceWorker(){
    if('serviceWorker' in navigator){
      window.addEventListener('load', function(){
        navigator.serviceWorker.register('/sw.js?v=7', { updateViaCache: 'none' }).then(function(registration){
          registration.update().catch(function(){ /* the current shell remains usable offline */ });
        }).catch(function(){ /* offline caching is a bonus, not required */ });
      });
    }
  }

  applyLook();
  applyWorkerType();
  renderProductCatalog();
  populateStateDropdown();
  populateProfileSettings();
  renderSettingsForm();
  renderAll();
  initOnboarding();
  if(settings.onboardingComplete) initReveal();
  initPressMotion();
  initMotionFocus();
  initGlassLight();
  initProductSnapFocus();
  initRangeMotion();
  initProjectionDetails();
  initHeroScroll();
  initNetHeroSticky();
  initBgCardsObserver();
  initInstallPrompt();
  initServiceWorker();

})();
