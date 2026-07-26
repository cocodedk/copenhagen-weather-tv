/* Unit conversion + formatting. Metric is the source of truth (Open-Meteo is asked
   for degC and m/s); imperial is derived on the client so switching needs no refetch. */
(function (global) {
  'use strict';

  var COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var imperial = false;

  function setImperial(on) { imperial = !!on; }
  function isImperial() { return imperial; }

  /* Day and month names are swappable so the Danish and Persian pages on the
     website can share this one formatting implementation instead of forking it.
     English stays the default, which is what the TV app uses. */
  function setLocale(loc) {
    if (loc && loc.days && loc.days.length === 7) { DAYS = loc.days; }
    if (loc && loc.months && loc.months.length === 12) { MONTHS = loc.months; }
  }

  /* --- temperature --- */
  function tempValue(c) {
    if (c === null || c === undefined) { return null; }
    return imperial ? (c * 9 / 5 + 32) : c;
  }
  function temp(c) {
    var v = tempValue(c);
    return v === null ? '--' : String(Math.round(v));
  }
  function tempUnit() { return imperial ? '°F' : '°C'; }
  function tempFull(c) { return temp(c) + tempUnit(); }

  /* --- wind: API gives m/s --- */
  function wind(ms) {
    if (ms === null || ms === undefined) { return '--'; }
    var v = imperial ? ms * 2.236936 : ms;
    return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + (imperial ? ' mph' : ' m/s');
  }
  function bearing(deg) {
    if (deg === null || deg === undefined) { return ''; }
    return COMPASS[Math.round(deg / 22.5) % 16];
  }

  /* --- precipitation: API gives mm --- */
  function precip(mm) {
    if (mm === null || mm === undefined) { return '--'; }
    if (imperial) { return (mm / 25.4).toFixed(2) + ' in'; }
    return (mm < 10 ? mm.toFixed(1) : String(Math.round(mm))) + ' mm';
  }

  function percent(p) {
    return (p === null || p === undefined) ? '--' : Math.round(p) + '%';
  }
  function pressure(hpa) {
    return (hpa === null || hpa === undefined) ? '--' : Math.round(hpa) + ' hPa';
  }

  /* --- time: Open-Meteo returns local wall-clock strings ("2026-07-26T22:15")
     already in the requested timezone. Parse the digits directly instead of
     new Date(), so the TV's own clock/timezone cannot shift them. --- */
  function parseLocal(iso) {
    if (!iso) { return null; }
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
    if (!m) { return null; }
    return {
      y: +m[1], mo: +m[2], d: +m[3],
      h: m[4] === undefined ? 0 : +m[4],
      mi: m[5] === undefined ? 0 : +m[5]
    };
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /* 24-hour clock (Danish convention). */
  function clock(iso) {
    var t = parseLocal(iso);
    return t ? pad2(t.h) + ':' + pad2(t.mi) : '--:--';
  }
  function hourLabel(iso) {
    var t = parseLocal(iso);
    return t ? pad2(t.h) + ':00' : '--';
  }

  /* Day-of-week without Date-parsing pitfalls: Sakamoto's algorithm. */
  function weekday(iso) {
    var t = parseLocal(iso);
    if (!t) { return ''; }
    var tbl = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    var y = t.y;
    if (t.mo < 3) { y -= 1; }
    var idx = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) +
               tbl[t.mo - 1] + t.d) % 7;
    return DAYS[idx];
  }
  function weekdayShort(iso) { return weekday(iso).slice(0, 3); }

  function dateLabel(iso) {
    var t = parseLocal(iso);
    return t ? t.d + ' ' + MONTHS[t.mo - 1] : '';
  }
  function longDate(iso) {
    var t = parseLocal(iso);
    return t ? weekday(iso) + ' ' + t.d + ' ' + MONTHS[t.mo - 1] + ' ' + t.y : '';
  }
  function dayKey(iso) {
    var t = parseLocal(iso);
    return t ? t.y + '-' + pad2(t.mo) + '-' + pad2(t.d) : '';
  }

  global.U = {
    setImperial: setImperial, isImperial: isImperial, setLocale: setLocale,
    temp: temp, tempUnit: tempUnit, tempFull: tempFull, tempValue: tempValue,
    wind: wind, bearing: bearing, precip: precip, percent: percent, pressure: pressure,
    parseLocal: parseLocal, pad2: pad2, clock: clock, hourLabel: hourLabel,
    weekday: weekday, weekdayShort: weekdayShort,
    dateLabel: dateLabel, longDate: longDate, dayKey: dayKey
  };
})(window);
