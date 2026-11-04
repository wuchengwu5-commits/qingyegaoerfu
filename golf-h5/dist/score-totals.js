(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.GolfScoreTotals = factory(root.GolfRules);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R) {
  'use strict';
  function summary(round, playerId) {
    const actual = R.rawSummary(round, playerId);
    const roundPar = round.holes.reduce((total, hole) => total + R.par(round, playerId, hole.number), 0);
    // This is a live display value. Missing holes remain unrecorded in the round.
    return {...actual, roundPar, liveTotal: roundPar + actual.diff};
  }
  return {summary};
});
