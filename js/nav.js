/* D-pad focus engine.
   Focus moves by LOGICAL (row, col) integers, never by pixel geometry — a chip
   scrolled under a header shares the header's viewport top, and geometry-based
   navigation then jumps to the wrong element. Scopes let a modal dialog take over
   the arrows without disturbing the main grid's remembered position. */
(function (global) {
  'use strict';

  var items = [];          // { el, row, col, scope, onEnter, onFocus }
  var scope = 'main';
  var current = null;      // the focused item, or null
  var memory = {};         // scope -> last focused {row, col}, survives a rebuild

  function clear(sc) {
    if (!sc) { items = []; return; }
    items = items.filter(function (it) { return it.scope !== sc; });
  }

  function add(el, row, col, opts) {
    opts = opts || {};
    var it = {
      el: el, row: row, col: col,
      scope: opts.scope || 'main',
      onEnter: opts.onEnter || null,
      onFocus: opts.onFocus || null
    };
    items.push(it);
    return it;
  }

  function inScope() {
    return items.filter(function (it) { return it.scope === scope; });
  }

  function paint(it) {
    for (var i = 0; i < items.length; i++) { items[i].el.classList.remove('focused'); }
    if (!it) { current = null; return; }
    current = it;
    memory[it.scope] = { row: it.row, col: it.col };
    it.el.classList.add('focused');
    /* block:'nearest' keeps the focused item on screen without yanking the page. */
    try { it.el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    catch (e) { it.el.scrollIntoView(false); }
    if (it.onFocus) { it.onFocus(it); }
  }

  function focusAt(row, col) {
    var pool = inScope();
    if (!pool.length) { paint(null); return false; }
    var best = null, bestScore = Infinity;
    for (var i = 0; i < pool.length; i++) {
      var it = pool[i];
      var score = Math.abs(it.row - row) * 1000 + Math.abs(it.col - col);
      if (score < bestScore) { bestScore = score; best = it; }
    }
    paint(best);
    return true;
  }

  function first() {
    var pool = inScope();
    if (!pool.length) { return false; }
    var best = pool[0];
    for (var i = 1; i < pool.length; i++) {
      if (pool[i].row < best.row || (pool[i].row === best.row && pool[i].col < best.col)) {
        best = pool[i];
      }
    }
    paint(best);
    return true;
  }

  /* Nearest item strictly in the requested direction: prefer the smallest step
     along the axis of travel, then the smallest drift on the other axis. */
  function move(dRow, dCol) {
    var pool = inScope();
    if (!pool.length) { return false; }
    if (!current || current.scope !== scope) { return first(); }

    var best = null, bestPrimary = Infinity, bestSecondary = Infinity;
    for (var i = 0; i < pool.length; i++) {
      var it = pool[i];
      if (it === current) { continue; }
      var primary, secondary;
      if (dRow !== 0) {
        primary = (it.row - current.row) * dRow;
        secondary = Math.abs(it.col - current.col);
      } else {
        if (it.row !== current.row) { continue; }
        primary = (it.col - current.col) * dCol;
        secondary = 0;
      }
      if (primary <= 0) { continue; }
      if (primary < bestPrimary || (primary === bestPrimary && secondary < bestSecondary)) {
        bestPrimary = primary; bestSecondary = secondary; best = it;
      }
    }
    if (!best) { return false; }
    paint(best);
    return true;
  }

  function enter() {
    if (!current || current.scope !== scope) { return false; }
    if (current.onEnter) { current.onEnter(current); return true; }
    current.el.click();
    return true;
  }

  /* Returning to a scope restores where focus was, even if that scope's elements
     were rebuilt while another scope had the arrows. */
  function setScope(sc) {
    scope = sc;
    var m = memory[sc];
    if (m) { focusAt(m.row, m.col); } else { first(); }
  }

  function getScope() { return scope; }
  function focused() { return current; }
  function count() { return inScope().length; }

  global.Nav = {
    add: add, clear: clear, move: move, enter: enter, first: first, focusAt: focusAt,
    setScope: setScope, getScope: getScope, focused: focused, count: count
  };
})(window);
