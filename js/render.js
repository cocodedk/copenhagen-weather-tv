/* DOM rendering. Rebuilds the hourly strip / day row and re-registers their
   focusables with Nav. Markup is assembled as strings (fast on a weak TV CPU);
   every interpolated value comes from the numeric API or a fixed label table. */
(function (global) {
  'use strict';

  var XLINK = 'http://www.w3.org/1999/xlink';

  function $(id) { return document.getElementById(id); }

  /* Both attributes: SVG2 `href` is honoured by the TV WebView, `xlink:href` is
     the fallback older engines need. */
  function useMarkup(iconId, cls) {
    var ref = '#i-' + iconId;
    return '<svg class="' + cls + '" viewBox="0 0 64 64">' +
           '<use href="' + ref + '" xlink:href="' + ref + '"/></svg>';
  }
  function setUse(useEl, iconId) {
    var ref = '#i-' + iconId;
    useEl.setAttribute('href', ref);
    try { useEl.setAttributeNS(XLINK, 'xlink:href', ref); } catch (e) { /* older engine */ }
  }

  /* Index of the hourly row covering the current wall-clock hour. The API's local
     ISO strings sort lexicographically, so if the exact hour is missing we can
     still fall back to the latest hour that has already started — never to 0,
     which would label midnight as "Now". */
  function nowIndex(model) {
    var cur = model.current.time;
    if (!cur) { return 0; }
    var hourKey = cur.slice(0, 13);
    var last = 0;
    for (var i = 0; i < model.hourly.length; i++) {
      var t = model.hourly[i].time;
      if (t.slice(0, 13) === hourKey) { return i; }
      if (t < cur) { last = i; }
    }
    return last;
  }

  function hoursForDay(model, dayIdx) {
    if (dayIdx === 0) {
      var start = nowIndex(model);
      return { rows: model.hourly.slice(start, start + 24), nowAt: 0, note: 'next 24 hours' };
    }
    var key = U.dayKey(model.daily[dayIdx].time);
    var out = [];
    for (var i = 0; i < model.hourly.length; i++) {
      if (U.dayKey(model.hourly[i].time) === key) { out.push(model.hourly[i]); }
    }
    return { rows: out, nowAt: -1, note: U.longDate(model.daily[dayIdx].time) };
  }

  function uvBand(uv) {
    if (uv === null || uv === undefined) { return ''; }
    if (uv < 3) { return 'Low'; }
    if (uv < 6) { return 'Moderate'; }
    if (uv < 8) { return 'High'; }
    if (uv < 11) { return 'Very high'; }
    return 'Extreme';
  }

  function tile(icon, key, value, sub) {
    return '<div class="stat">' + useMarkup(icon, 'stat-ico wx-icon') +
      '<div class="stat-body"><div class="stat-k">' + key + '</div>' +
      '<div class="stat-v">' + value + '</div>' +
      '<div class="stat-sub">' + (sub || '&nbsp;') + '</div></div></div>';
  }

  function statsToday(model) {
    var c = model.current;
    var d0 = model.daily[0] || {};
    var hNow = model.hourly[nowIndex(model)] || {};
    return [
      tile('thermo', 'Feels like', U.tempFull(c.apparent_temperature),
           'Actual ' + U.tempFull(c.temperature_2m)),
      tile('wind', 'Wind', U.wind(c.wind_speed_10m),
           'From ' + U.bearing(c.wind_direction_10m) + ' · max ' + U.wind(d0.wind_speed_10m_max)),
      tile('drop', 'Humidity', U.percent(c.relative_humidity_2m), 'Relative'),
      tile('rain', 'Precipitation', U.precip(c.precipitation),
           'Last hour · ' + U.percent(hNow.precipitation_probability) + ' chance'),
      tile('gauge', 'Pressure', U.pressure(c.surface_pressure), 'At surface'),
      tile('sunrise', 'Sunrise', U.clock(d0.sunrise), 'Sunset ' + U.clock(d0.sunset))
    ].join('');
  }

  function statsDay(model, dayIdx) {
    var d = model.daily[dayIdx] || {};
    return [
      tile('thermo', 'High / low', U.temp(d.temperature_2m_max) + ' / ' +
           U.temp(d.temperature_2m_min) + U.tempUnit(), 'Daily range'),
      tile('wind', 'Wind', U.wind(d.wind_speed_10m_max), 'Strongest of the day'),
      tile('drop', 'Chance of rain', U.percent(d.precipitation_probability_max), 'Peak for the day'),
      tile('rain', 'Precipitation', U.precip(d.precipitation_sum), 'Total for the day'),
      tile('uv', 'UV index', d.uv_index_max === null || d.uv_index_max === undefined
           ? '--' : d.uv_index_max.toFixed(1), uvBand(d.uv_index_max)),
      tile('sunrise', 'Sunrise', U.clock(d.sunrise), 'Sunset ' + U.clock(d.sunset))
    ].join('');
  }

  function renderHero(model, dayIdx) {
    var isNight;
    if (dayIdx === 0) {
      var c = model.current;
      var d0 = model.daily[0] || {};
      isNight = !c.is_day;
      setUse($('hero-use'), WMO.icon(c.weather_code, c.is_day));
      $('hero-temp').innerHTML = U.temp(c.temperature_2m) +
        '<span id="hero-unit">' + U.tempUnit() + '</span>';
      $('hero-cond').textContent = WMO.label(c.weather_code);
      var sum = d0.precipitation_sum;
      var wet = (sum !== null && sum !== undefined && sum > 0)
        ? U.precip(sum) + ' today' : 'Dry day';
      $('hero-range').textContent = 'High ' + U.temp(d0.temperature_2m_max) +
        '° · Low ' + U.temp(d0.temperature_2m_min) + '° · ' + wet;
      $('stats').innerHTML = statsToday(model);
    } else {
      var d = model.daily[dayIdx] || {};
      isNight = false;
      setUse($('hero-use'), WMO.icon(d.weather_code, 1));
      $('hero-temp').innerHTML = U.temp(d.temperature_2m_max) +
        '<span id="hero-unit">' + U.tempUnit() + '</span>';
      $('hero-cond').textContent = WMO.label(d.weather_code);
      $('hero-range').textContent = U.weekday(d.time) + ' ' + U.dateLabel(d.time) +
        ' · Low ' + U.temp(d.temperature_2m_min) + U.tempUnit();
      $('stats').innerHTML = statsDay(model, dayIdx);
    }
    return isNight;
  }

  function renderHourly(model, dayIdx, onFocusHour) {
    var win = hoursForDay(model, dayIdx);
    var strip = $('hourly-strip');
    var html = '';
    for (var i = 0; i < win.rows.length; i++) {
      var h = win.rows[i];
      var pp = h.precipitation_probability;
      var dry = (pp === null || pp === undefined || pp < 5) ? ' dry' : '';
      html += '<div class="hour' + (i === win.nowAt ? ' now' : '') + '">' +
        '<div class="hour-t">' + (i === win.nowAt ? 'Now' : U.hourLabel(h.time)) + '</div>' +
        useMarkup(WMO.icon(h.weather_code, h.is_day), 'hour-ic wx-icon') +
        '<div class="hour-tp">' + U.temp(h.temperature_2m) + '°</div>' +
        '<div class="hour-pp' + dry + '">' + U.percent(pp) + '</div>' +
        '</div>';
    }
    strip.innerHTML = html;
    $('hourly-scope').textContent = '— ' + win.note;

    var cells = strip.children;
    for (var c = 0; c < cells.length; c++) {
      Nav.add(cells[c], 0, c, { onFocus: onFocusHour ? onFocusHour(win.rows[c]) : null });
    }
    return win;
  }

  function renderDaily(model, dayIdx, onSelect) {
    var row = $('daily-row');
    var html = '';
    for (var i = 0; i < model.daily.length; i++) {
      var d = model.daily[i];
      var pp = d.precipitation_probability_max;
      var dry = (pp === null || pp === undefined || pp < 5) ? ' dry' : '';
      html += '<div class="day' + (i === dayIdx ? ' selected' : '') + '">' +
        '<div class="day-n">' + (i === 0 ? 'Today' : U.weekday(d.time)) + '</div>' +
        '<div class="day-d">' + U.dateLabel(d.time) + '</div>' +
        useMarkup(WMO.icon(d.weather_code, 1), 'day-ic wx-icon') +
        '<div class="day-t"><span class="day-hi">' + U.temp(d.temperature_2m_max) + '°</span>' +
        '<span class="day-lo">' + U.temp(d.temperature_2m_min) + '°</span></div>' +
        '<div class="day-pp' + dry + '">' + U.percent(pp) + '</div>' +
        '</div>';
    }
    row.innerHTML = html;

    var cells = row.children;
    for (var c = 0; c < cells.length; c++) {
      (function (idx) {
        Nav.add(cells[idx], 1, idx, { onEnter: function () { onSelect(idx); } });
      })(c);
    }
  }

  /* Full repaint. Keeps the focus cell (row,col) across rebuilds. */
  function all(model, dayIdx, onSelect) {
    var prev = Nav.focused();
    var keep = prev && prev.scope === 'main' ? { row: prev.row, col: prev.col } : null;

    Nav.clear('main');
    var isNight = renderHero(model, dayIdx);
    renderHourly(model, dayIdx, null);
    renderDaily(model, dayIdx, onSelect);

    document.body.classList.toggle('is-night', !!isNight);
    /* Only steal focus if the main grid still owns the arrows — a background
       refresh must not move the highlight inside an open dialog. */
    if (Nav.getScope() === 'main') {
      if (keep) { Nav.focusAt(keep.row, keep.col); } else { Nav.focusAt(1, dayIdx); }
    }
  }

  global.Render = { all: all, nowIndex: nowIndex, useMarkup: useMarkup, setUse: setUse };
})(window);
