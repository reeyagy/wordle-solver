/* solver.js
 * Entropy-based Wordle solver — browser port of solver.py.
 * Same algorithm: score every guess by the Shannon entropy (bits) of the
 * feedback-pattern distribution it produces across remaining candidates,
 * and play the guess that maximizes expected information gain.
 */

const WORD_LENGTH = 5;
const PRECOMPUTED_OPENER = "tares"; // matches the offline full-search result in solver.py

// Feedback pattern for `guess` against `answer`, base-3 encoded (0=gray,1=yellow,2=green).
function scoreGuess(guess, answer) {
  const result = [0, 0, 0, 0, 0];
  const remaining = {};
  for (let i = 0; i < WORD_LENGTH; i++) {
    remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
  }

  // Greens first.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i] = 2;
      remaining[guess[i]]--;
    }
  }
  // Then yellows, respecting remaining counts.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 2) continue;
    const c = guess[i];
    if (remaining[c] > 0) {
      result[i] = 1;
      remaining[c]--;
    }
  }

  let pattern = 0;
  for (let i = 0; i < WORD_LENGTH; i++) pattern += result[i] * Math.pow(3, i);
  return pattern;
}

function patternToColors(pattern) {
  const colors = [];
  for (let i = 0; i < WORD_LENGTH; i++) {
    const digit = pattern % 3;
    colors.push(digit === 2 ? "green" : digit === 1 ? "yellow" : "gray");
    pattern = Math.floor(pattern / 3);
  }
  return colors;
}

function colorsToPattern(colors) {
  const map = { gray: 0, yellow: 1, green: 2 };
  let pattern = 0;
  for (let i = 0; i < WORD_LENGTH; i++) pattern += map[colors[i]] * Math.pow(3, i);
  return pattern;
}

// Expected information (bits) a guess would yield against a candidate list.
function entropyForGuess(guess, candidates) {
  const counts = new Map();
  for (const answer of candidates) {
    const p = scoreGuess(guess, answer);
    counts.set(p, (counts.get(p) || 0) + 1);
  }
  const n = candidates.length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

// Best guess from `pool` against `candidates`. Returns {word, bits}.
// Callers should keep `pool` small (e.g. just `candidates`) once the
// candidate list has shrunk, to stay fast on the main thread.
function bestGuess(pool, candidates) {
  let bestWord = null;
  let bestBits = -1;
  for (const word of pool) {
    const bits = entropyForGuess(word, candidates);
    if (bits > bestBits) {
      bestBits = bits;
      bestWord = word;
    }
  }
  return { word: bestWord, bits: bestBits };
}

function filterCandidates(candidates, guess, pattern) {
  return candidates.filter((a) => scoreGuess(guess, a) === pattern);
}
