/* Bootstrap, remote-control key routing, refresh loop, and the on-screen
   diagnostics overlay (the only DevTools substitute on a retail TV). */
(function () {
  'use strict';

  var BUILD = 'b2';                 /* bump every deploy — see #build-stamp */
  var REFRESH_MS = 10 * 60 * 1000;  /* Open-Meteo publishes hourly; 10 min is plenty */
  var PREFS_KEY = 'cphwx.prefs.v1';

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 10009, ESC: 27,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406
  };
  var THEMES = ['auto', 'day', 'night'];

  var state = {
    model: null,
    dayIdx: 0,
    theme: 'auto',
    imperial: false,
    debug: false,
    loading: false,
    lastError: '',
    lastFetchMs: 0,
    stale: false
  };
  var toastTimer = null;
  var refreshTimer = null;

  function $(id) { return document.getElementById(id); }

  /* ---------- preferences ---------- */
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (typeof p.imperial === 'boolean') { state.imperial = p.imperial; }
      if (THEMES.indexOf(p.theme) >= 0) { state.theme = p.theme; }
    } catch (e) { /* first run / storage disabled */ }
    U.setImperial(state.imperial);
    applyTheme();
    $('legend-unit').textContent = state.imperial ? '°C' : '°F';
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY,
        JSON.stringify({ imperial: state.imperial, theme: state.theme }));
    } catch (e) { /* ignore */ }
  }
  function applyTheme() {
    var b = document.body;
    b.classList.remove('theme-auto', 'theme-day', 'theme-night');
    b.classList.add('theme-' + state.theme);
  }

  /* ---------- Copenhagen wall clock, derived from the API's UTC offset ---------- */
  function cphNow() {
    var off = state.model ? state.model.utcOffset : 0;
    return new Date(Date.now() + off * 1000);
  }
  function tickClock() {
    var d = cphNow();
    $('clock').textContent = U.pad2(d.getUTCHours()) + ':' + U.pad2(d.getUTCMinutes());
    var iso = d.getUTCFullYear() + '-' + U.pad2(d.getUTCMonth() + 1) + '-' + U.pad2(d.getUTCDate());
    $('clock-date').textContent = U.longDate(iso);
  }

  /* ---------- status + toast ---------- */
  function setStatus(text, kind) {
    var el = $('status');
    el.textContent = text;
    el.className = kind || '';
  }
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  /* ---------- render ---------- */
  function selectDay(idx) {
    if (!state.model || idx < 0 || idx >= state.model.daily.length) { return; }
    state.dayIdx = idx;
    paint();
    Nav.focusAt(1, idx);
  }

  function paint() {
    if (!state.model) { return; }
    Render.all(state.model, state.dayIdx, selectDay);
    if (state.debug) { renderDebug(); }
  }

  function showStatusForModel() {
    if (state.stale) {
      setStatus('Offline, showing data from ' + U.clock(state.model.current.time), 'stale');
    } else {
      setStatus('Updated ' + U.clock(state.model.current.time), '');
    }
  }

  function adoptModel(model, isStale) {
    state.model = model;
    state.stale = !!isStale;
    if (state.dayIdx >= model.daily.length) { state.dayIdx = 0; }
    paint();
    tickClock();
    showStatusForModel();
  }

  /* ---------- data ---------- */
  function refresh(userInitiated) {
    if (state.loading) { return; }
    state.loading = true;
    if (userInitiated) { toast('Refreshing…'); }
    if (!state.model) { setStatus('Loading forecast…', ''); }

    API.fetchForecast().then(function (model) {
      state.loading = false;
      state.lastError = '';
      state.lastFetchMs = Date.now();
      adoptModel(model, false);
      if (userInitiated) { toast('Forecast updated'); }
      if (state.debug) { renderDebug(); }
    }, function (err) {
      state.loading = false;
      state.lastError = String(err && err.message ? err.message : err);
      if (state.model) {
        state.stale = true;
        showStatusForModel();
        toast('Could not reach the weather service');
      } else {
        var cached = API.loadCached();
        if (cached) {
          adoptModel(cached, true);
          toast('Offline, showing the last saved forecast');
        } else {
          $('hero-cond').textContent = 'No connection';
          $('hero-range').textContent = 'Press the RED key to try again';
          setStatus('Failed: ' + state.lastError, 'err');
        }
      }
      if (state.debug) { renderDebug(); }
    });
  }

  /* ---------- exit dialog ---------- */
  function openDialog() {
    $('dialog').hidden = false;
    Nav.setScope('dialog');
    Nav.focusAt(0, 1); /* default to "Stay" */
  }
  function closeDialog() {
    $('dialog').hidden = true;
    Nav.setScope('main');
  }
  function exitApp() {
    try {
      tizen.application.getCurrentApplication().exit();
    } catch (e) {
      closeDialog();
      toast('Exit is only available on the TV');
    }
  }

  /* ---------- diagnostics overlay ---------- */
  function size(id) {
    var el = $(id);
    if (!el) { return id + ': (missing)'; }
    return id + ': ' + el.offsetWidth + 'x' + el.offsetHeight;
  }
  function firstChildSize(id, label) {
    var el = $(id);
    var c = el && el.children.length ? el.children[0] : null;
    return label + ': ' + (c ? c.offsetWidth + 'x' + c.offsetHeight + ' (n=' +
           el.children.length + ')' : 'none');
  }
  function renderDebug() {
    var f = Nav.focused();
    var m = state.model;
    var lines = [
      'COPENHAGEN WEATHER / diagnostics   build ' + BUILD,
      '',
      'window       : ' + window.innerWidth + 'x' + window.innerHeight +
        '  dpr=' + (window.devicePixelRatio || 1),
      'screen       : ' + screen.width + 'x' + screen.height,
      'tizen api    : ' + (typeof tizen === 'undefined' ? 'absent (desktop)' : 'present') +
        '   webapis: ' + (typeof webapis === 'undefined' ? 'absent' : 'present'),
      'ua           : ' + navigator.userAgent,
      '',
      'model        : ' + (m ? m.daily.length + ' days, ' + m.hourly.length + ' hours' : 'none') +
        (state.stale ? '  [STALE CACHE]' : ''),
      'utc offset   : ' + (m ? m.utcOffset + 's' : '-') + '   cph now: ' +
        (m ? cphNow().toISOString().slice(0, 16).replace('T', ' ') : '-'),
      'api time     : ' + (m ? m.current.time : '-') +
        '   code=' + (m ? m.current.weather_code : '-') +
        '   is_day=' + (m ? m.current.is_day : '-'),
      'last fetch   : ' + (state.lastFetchMs
        ? Math.round((Date.now() - state.lastFetchMs) / 1000) + 's ago' : 'never'),
      'last error   : ' + (state.lastError || 'none'),
      'loading      : ' + state.loading,
      '',
      'day index    : ' + state.dayIdx + '   units: ' + (state.imperial ? 'imperial' : 'metric') +
        '   theme: ' + state.theme + (document.body.classList.contains('is-night') ? ' (night)' : ''),
      'nav          : scope=' + Nav.getScope() + ' items=' + Nav.count() +
        ' focus=' + (f ? 'r' + f.row + 'c' + f.col : 'none'),
      '',
      '--- measured layout (collapse detector) ---',
      size('app') + '   ' + size('hdr'),
      size('hero') + '   ' + size('stats'),
      firstChildSize('stats', 'stat tile'),
      size('hourly-strip') + '   ' + firstChildSize('hourly-strip', 'hour cell'),
      size('daily-row') + '   ' + firstChildSize('daily-row', 'day card'),
      'scrollWidth  : hourly=' + $('hourly-strip').scrollWidth +
        '  scrollLeft=' + $('hourly-strip').scrollLeft
    ];
    $('debug').textContent = lines.join('\n');
  }
  function toggleDebug() {
    state.debug = !state.debug;
    $('debug').hidden = !state.debug;
    if (state.debug) { renderDebug(); }
  }

  /* ---------- key handling ---------- */
  function onKey(e) {
    var code = e.keyCode;

    if (Nav.getScope() === 'dialog') {
      if (code === KEY.LEFT) { Nav.move(0, -1); }
      else if (code === KEY.RIGHT) { Nav.move(0, 1); }
      else if (code === KEY.OK) { Nav.enter(); }
      else if (code === KEY.BACK || code === KEY.ESC) { closeDialog(); }
      else if (code === KEY.BLUE) { toggleDebug(); }
      else { return; }
      e.preventDefault();
      return;
    }

    switch (code) {
      case KEY.LEFT:  Nav.move(0, -1); break;
      case KEY.RIGHT: Nav.move(0, 1); break;
      case KEY.UP:    Nav.move(-1, 0); break;
      case KEY.DOWN:  Nav.move(1, 0); break;
      case KEY.OK:    Nav.enter(); break;

      case KEY.BACK:
      case KEY.ESC:
        /* Back steps out of a selected future day first; only then offers exit. */
        if (state.dayIdx !== 0) { selectDay(0); } else { openDialog(); }
        break;

      case KEY.RED:
        refresh(true);
        break;

      case KEY.GREEN:
        state.imperial = !state.imperial;
        U.setImperial(state.imperial);
        $('legend-unit').textContent = state.imperial ? '°C' : '°F';
        savePrefs();
        paint();
        toast(state.imperial ? 'Fahrenheit / mph' : 'Celsius / m/s');
        break;

      case KEY.YELLOW:
        state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
        applyTheme();
        savePrefs();
        paint();
        toast('Theme: ' + state.theme);
        break;

      case KEY.BLUE:
        toggleDebug();
        break;

      default:
        if (code >= 49 && code <= 55) { selectDay(code - 49); break; }  /* keys 1-7 */
        return;
    }
    e.preventDefault();
  }

  /* ---------- startup ---------- */
  function registerRemoteKeys() {
    var keys = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
                '1', '2', '3', '4', '5', '6', '7'];
    for (var i = 0; i < keys.length; i++) {
      try { tizen.tvinputdevice.registerKey(keys[i]); } catch (e) { /* desktop / unsupported */ }
    }
  }

  function init() {
    $('build-stamp').textContent = BUILD;
    loadPrefs();
    registerRemoteKeys();

    Nav.add($('dlg-yes'), 0, 0, { scope: 'dialog', onEnter: exitApp });
    Nav.add($('dlg-no'), 0, 1, { scope: 'dialog', onEnter: closeDialog });

    document.addEventListener('keydown', onKey, false);

    /* Paint the cache immediately so the screen is never empty, then go online. */
    var cached = API.loadCached();
    if (cached) { adoptModel(cached, true); }
    tickClock();
    setInterval(tickClock, 1000);

    refresh(false);
    refreshTimer = setInterval(function () { refresh(false); }, REFRESH_MS);

    /* Coming back from standby/another app: refresh if the data has gone cold. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Date.now() - state.lastFetchMs > REFRESH_MS) { refresh(false); }
    }, false);

    window.CPHWX = { state: state, refresh: refresh, paint: paint, debug: renderDebug };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, false);
  } else {
    init();
  }
})();
