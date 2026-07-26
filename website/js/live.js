/* Live weather for the landing pages.
   Reuses the TV app's own WMO / units / API modules (copied into vendor/ by
   tools/build-site.mjs) so labels, rounding and the request itself can never
   drift from what the television shows.

   One script drives the English, Danish and Persian pages. Non-English pages
   load a js/i18n/<lang>.js first, which sets window.CPHI18N; English needs no
   file because it is what the shared modules already speak. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var I = window.CPHI18N || {};

  if (I.days && I.months) { U.setLocale({ days: I.days, months: I.months }); }
  if (I.wmo) { WMO.setLabels(I.wmo); }

  var EN = {
    feels: 'Feels like', wind: 'Wind', humidity: 'Humidity', rain: 'Rain chance',
    now: 'Now', today: 'Today', updated: 'Updated',
    offline: 'Offline, last saved forecast',
    failed: 'Could not reach the forecast',
    place: 'Copenhagen, Denmark'
  };
  var t = {};
  for (var k in EN) {
    if (Object.prototype.hasOwnProperty.call(EN, k)) {
      t[k] = (I.ui && I.ui[k]) ? I.ui[k] : EN[k];
    }
  }

  /* The glow behind the television is the current condition, as light. */
  var GLOW = {
    clear: '#ffd257', 'clear-night': '#ffd257', partly: '#ffd257', 'partly-night': '#8fa8e8',
    cloudy: '#7d93c8', fog: '#7d93c8',
    drizzle: '#63c8ff', rain: '#63c8ff', showers: '#63c8ff', sleet: '#9fd8ff',
    snow: '#dfefff', thunder: '#a78bfa'
  };

  function icon(id, cls) {
    return '<svg class="' + cls + '" viewBox="0 0 64 64" aria-hidden="true">' +
           '<use href="#i-' + id + '"/></svg>';
  }
  function setUse(svg, id) {
    var u = svg.querySelector('use');
    if (u) { u.setAttribute('href', '#i-' + id); }
  }

  function hourIndex(model) {
    var cur = model.current.time;
    var key = cur.slice(0, 13);
    var last = 0;
    for (var i = 0; i < model.hourly.length; i++) {
      var h = model.hourly[i].time;
      if (h.slice(0, 13) === key) { return i; }
      if (h < cur) { last = i; }
    }
    return last;
  }

  function tile(label, value) {
    return '<div class="ntile"><dt>' + label + '</dt><dd>' + value + '</dd></div>';
  }

  function render(model, stale) {
    var c = model.current;
    var d0 = model.daily[0] || {};
    var start = hourIndex(model);
    var iconId = WMO.icon(c.weather_code, c.is_day);

    document.documentElement.style.setProperty('--glow', GLOW[iconId] || '#ffd257');

    setUse($('now-icon'), iconId);
    $('now-temp').innerHTML = U.temp(c.temperature_2m) + '<span>' + U.tempUnit() + '</span>';
    $('now-cond').textContent = WMO.label(c.weather_code);
    $('now-place').textContent = t.place + ' · ' + U.clock(c.time);

    $('now-tiles').innerHTML =
      tile(t.feels, U.tempFull(c.apparent_temperature)) +
      tile(t.wind, U.wind(c.wind_speed_10m)) +
      tile(t.humidity, U.percent(c.relative_humidity_2m)) +
      tile(t.rain, U.percent(d0.precipitation_probability_max));

    var status = $('now-status');
    status.className = 'tv-status' + (stale ? ' is-stale' : '');
    $('now-status-text').textContent = stale
      ? t.offline
      : t.updated + ' ' + U.clock(c.time);

    /* next 12 hours */
    var html = '';
    for (var i = start; i < Math.min(start + 12, model.hourly.length); i++) {
      var h = model.hourly[i];
      var pp = h.precipitation_probability;
      var dry = (pp === null || pp === undefined || pp < 5) ? ' dry' : '';
      html += '<div class="hour">' +
        '<div class="hour-t">' + (i === start ? t.now : U.hourLabel(h.time)) + '</div>' +
        icon(WMO.icon(h.weather_code, h.is_day), 'hour-i') +
        '<div class="hour-d">' + U.temp(h.temperature_2m) + '°</div>' +
        '<div class="hour-p' + dry + '">' + U.percent(pp) + '</div>' +
        '</div>';
    }
    $('hours').innerHTML = html;

    /* seven days */
    html = '';
    for (var k = 0; k < model.daily.length; k++) {
      var d = model.daily[k];
      html += '<li>' +
        '<span><span class="day-n">' + (k === 0 ? t.today : U.weekday(d.time)) + '</span>' +
        '<span class="day-sub"> · ' + U.dateLabel(d.time) + '</span></span>' +
        '<span class="day-c">' + WMO.label(d.weather_code) + '</span>' +
        icon(WMO.icon(d.weather_code, 1), '') +
        '<span class="day-t"><b>' + U.temp(d.temperature_2m_max) + '°</b>' +
        '<span>' + U.temp(d.temperature_2m_min) + '°</span></span>' +
        '</li>';
    }
    $('days').innerHTML = html;
  }

  function failed(message) {
    var status = $('now-status');
    status.className = 'tv-status is-error';
    $('now-status-text').textContent = message;
    $('now-cond').textContent = t.failed;
  }

  function load() {
    API.fetchForecast().then(function (model) {
      render(model, false);
    }, function (err) {
      var cached = API.loadCached();
      if (cached) { render(cached, true); }
      else { failed(String(err && err.message ? err.message : err)); }
    });
  }

  /* ---- the embedded TV app ----
     The app is a fixed 1920x1080 canvas, so it is scaled to whatever width the
     column has rather than reflowed. Same-origin, so keys can be handed to it
     directly. */
  function fitDemo() {
    var frame = $('demo-frame');
    var iframe = $('demo-iframe');
    if (!frame || !iframe) { return; }
    var scale = frame.clientWidth / 1920;
    iframe.style.transform = 'scale(' + scale + ')';
  }

  function sendKey(code) {
    var iframe = $('demo-iframe');
    if (!iframe) { return; }
    try {
      var doc = iframe.contentDocument;
      var e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: function () { return code; } });
      Object.defineProperty(e, 'which', { get: function () { return code; } });
      doc.dispatchEvent(e);
      iframe.focus();
    } catch (err) { /* cross-origin or not loaded yet */ }
  }

  function init() {
    var keys = document.querySelectorAll('.keycap');
    for (var i = 0; i < keys.length; i++) {
      keys[i].addEventListener('click', function () {
        sendKey(Number(this.getAttribute('data-key')));
      });
    }
    fitDemo();
    window.addEventListener('resize', fitDemo, false);
    var iframe = $('demo-iframe');
    if (iframe) { iframe.addEventListener('load', fitDemo, false); }

    load();
    /* Open-Meteo publishes hourly; refresh while the tab is open. */
    setInterval(load, 10 * 60 * 1000);
    window.CPHSITE = { load: load, render: render };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, false);
  } else {
    init();
  }
})();
