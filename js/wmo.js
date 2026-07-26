/* WMO weather-interpretation codes -> label + icon id.
   Reference: https://open-meteo.com/en/docs (weather_code)
   Written for Chromium 69+: no ?., no ??, no Object spread in hot paths. */
(function (global) {
  'use strict';

  var CODES = {
    0:  ['Clear sky',            'clear'],
    1:  ['Mainly clear',         'clear'],
    2:  ['Partly cloudy',        'partly'],
    3:  ['Overcast',             'cloudy'],
    45: ['Fog',                  'fog'],
    48: ['Freezing fog',         'fog'],
    51: ['Light drizzle',        'drizzle'],
    53: ['Drizzle',              'drizzle'],
    55: ['Dense drizzle',        'drizzle'],
    56: ['Freezing drizzle',     'sleet'],
    57: ['Freezing drizzle',     'sleet'],
    61: ['Light rain',           'rain'],
    63: ['Rain',                 'rain'],
    65: ['Heavy rain',           'rain'],
    66: ['Freezing rain',        'sleet'],
    67: ['Freezing rain',        'sleet'],
    71: ['Light snow',           'snow'],
    73: ['Snow',                 'snow'],
    75: ['Heavy snow',           'snow'],
    77: ['Snow grains',          'snow'],
    80: ['Light showers',        'showers'],
    81: ['Showers',              'showers'],
    82: ['Violent showers',      'showers'],
    85: ['Snow showers',         'snow'],
    86: ['Heavy snow showers',   'snow'],
    95: ['Thunderstorm',         'thunder'],
    96: ['Thunderstorm, hail',   'thunder'],
    99: ['Thunderstorm, hail',   'thunder']
  };

  /* Icons that have a distinct night variant. */
  var NIGHT = { clear: 'clear-night', partly: 'partly-night' };

  var labels = null;   /* set by setLabels() for a non-English page */

  /* Swap in translated condition names (website Danish/Persian pages) without
     forking this table — the icon mapping stays shared. */
  function setLabels(map) { labels = map || null; }

  function label(code) {
    if (labels && labels[code]) { return labels[code]; }
    var e = CODES[code];
    return e ? e[0] : 'Unknown';
  }

  /* isDay: 1/0 from the API (or truthy/falsy). Falls back to day icons. */
  function icon(code, isDay) {
    var e = CODES[code];
    var id = e ? e[1] : 'cloudy';
    if (!isDay && NIGHT[id]) { id = NIGHT[id]; }
    return id;
  }

  global.WMO = { label: label, icon: icon, setLabels: setLabels };
})(window);
