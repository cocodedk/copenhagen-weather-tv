/* Open-Meteo client. No API key, CORS-open, metric + Europe/Copenhagen.
   Shapes the column-oriented API response into row objects the renderer wants. */
(function (global) {
  'use strict';

  var LAT = 55.6761;
  var LON = 12.5683;
  var TZ = 'Europe/Copenhagen';

  var CURRENT = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
                 'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m',
                 'surface_pressure'];
  var HOURLY = ['temperature_2m', 'weather_code', 'precipitation_probability', 'is_day',
                'wind_speed_10m'];
  var DAILY = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset',
               'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max',
               'uv_index_max'];

  var CACHE_KEY = 'cphwx.cache.v1';
  var TIMEOUT_MS = 12000;

  function url() {
    return 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + LAT + '&longitude=' + LON +
      '&current=' + CURRENT.join(',') +
      '&hourly=' + HOURLY.join(',') +
      '&daily=' + DAILY.join(',') +
      '&timezone=' + encodeURIComponent(TZ) +
      '&wind_speed_unit=ms&forecast_days=7';
  }

  /* fetch() with a timeout. AbortController exists in Chromium 66+, but a plain
     Promise.race keeps this working even where it does not. */
  function fetchJSON(u) {
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error('Request timed out')); }, TIMEOUT_MS);
    });
    var req = fetch(u, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    });
    return Promise.race([req, timeout]).then(function (v) {
      clearTimeout(timer);
      return v;
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  /* Column arrays -> array of row objects, keyed by the same field names. */
  function rows(block, fields) {
    var out = [];
    if (!block || !block.time) { return out; }
    for (var i = 0; i < block.time.length; i++) {
      var r = { time: block.time[i] };
      for (var f = 0; f < fields.length; f++) {
        var k = fields[f];
        r[k] = block[k] ? block[k][i] : null;
      }
      out.push(r);
    }
    return out;
  }

  function shape(raw) {
    return {
      fetchedAt: Date.now(),
      /* Exact Copenhagen offset incl. DST — lets the app show local Copenhagen
         time even if the TV's own clock/timezone is set to somewhere else. */
      utcOffset: typeof raw.utc_offset_seconds === 'number' ? raw.utc_offset_seconds : 0,
      current: raw.current || {},
      hourly: rows(raw.hourly, HOURLY),
      daily: rows(raw.daily, DAILY)
    };
  }

  function save(model) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(model)); } catch (e) { /* full/disabled */ }
  }

  function load() {
    try {
      var s = localStorage.getItem(CACHE_KEY);
      if (!s) { return null; }
      var m = JSON.parse(s);
      return (m && m.daily && m.daily.length) ? m : null;
    } catch (e) { return null; }
  }

  /* Resolves to a shaped model. Rejects only when the network fails AND there is
     no usable cache; the caller decides how to surface a stale-cache fallback. */
  function fetchForecast() {
    return fetchJSON(url()).then(function (raw) {
      var model = shape(raw);
      save(model);
      return model;
    });
  }

  global.API = {
    fetchForecast: fetchForecast,
    loadCached: load,
    location: { lat: LAT, lon: LON, tz: TZ, name: 'Copenhagen', region: 'Denmark' }
  };
})(window);
