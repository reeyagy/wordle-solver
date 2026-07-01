/* app.js — game state + UI wiring for Entropy */

const MAX_GUESSES = 6;
const START_BITS = Math.log2(WORDS.length);

const el = {
  status: document.getElementById("status"),
  board: document.getElementById("board"),
  keyboard: document.getElementById("keyboard"),
  btnSuggest: document.getElementById("btn-suggest"),
  btnNew: document.getElementById("btn-new"),
  bitsValue: document.getElementById("bits-value"),
  candCount: document.getElementById("cand-count"),
  bitsBar: document.getElementById("bits-bar"),
  suggestWord: document.getElementById("suggest-word"),
  suggestMeta: document.getElementById("suggest-meta"),
  ledger: document.getElementById("ledger"),
  modePlay: document.getElementById("mode-play"),
  modeAssist: document.getElementById("mode-assist"),
};

const state = {
  mode: "play", // 'play' | 'assist'
  secret: null,
  candidates: WORDS,
  rows: [], // {word, colors: [..5], pattern, expectedBits, actualBits}
  currentLetters: [],
  rowPhase: "typing", // 'typing' | 'coloring'
  currentColors: ["gray", "gray", "gray", "gray", "gray"],
  gameOver: false,
  keyStatus: {}, // letter -> 'green' | 'yellow' | 'gray'
};

const WORD_SET = new Set(WORDS);

function pickSecret() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function resetGame() {
  state.secret = state.mode === "play" ? pickSecret() : null;
  state.candidates = WORDS;
  state.rows = [];
  state.currentLetters = [];
  state.rowPhase = "typing";
  state.currentColors = ["gray", "gray", "gray", "gray", "gray"];
  state.gameOver = false;
  state.keyStatus = {};
  render();
  setStatus(
    state.mode === "play"
      ? "Guess a 5-letter word to begin."
      : "Type your real guess, then click each tile to match the colors Wordle gave you."
  );
  updateSuggestion();
}

function setStatus(msg, kind) {
  el.status.textContent = msg;
  el.status.className = "status-line" + (kind ? " " + kind : "");
}

/* ---------------- rendering ---------------- */

function render() {
  renderBoard();
  renderKeyboard();
  renderLedger();
  renderBits();
}

function renderBoard() {
  el.board.innerHTML = "";
  for (let r = 0; r < MAX_GUESSES; r++) {
    const rowDiv = document.createElement("div");
    rowDiv.className = "board-row";

    const committed = state.rows[r];
    const isCurrent = r === state.rows.length && !state.gameOver;

    for (let c = 0; c < 5; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";

      if (committed) {
        tile.classList.add("filled", committed.colors[c]);
        tile.textContent = committed.word[c];
      } else if (isCurrent) {
        const letter = state.currentLetters[c];
        if (letter) {
          tile.classList.add("filled");
          tile.textContent = letter;
        }
        if (state.rowPhase === "coloring" && c < state.currentLetters.length) {
          tile.classList.add("clickable", state.currentColors[c]);
          tile.tabIndex = 0;
          tile.setAttribute("role", "button");
          tile.setAttribute("aria-label", "Set feedback color for letter " + (c + 1));
          tile.addEventListener("click", () => cycleColor(c));
          tile.addEventListener("keydown", (e) => {
            if (e.key === " ") { e.preventDefault(); cycleColor(c); }
          });
        }
      }
      rowDiv.appendChild(tile);
    }
    el.board.appendChild(rowDiv);
  }
}

const KB_ROWS = [
  "qwertyuiop".split(""),
  "asdfghjkl".split(""),
  ["ENTER", ..."zxcvbnm".split(""), "⌫"],
];

function renderKeyboard() {
  el.keyboard.innerHTML = "";
  for (const rowLetters of KB_ROWS) {
    const rowDiv = document.createElement("div");
    rowDiv.className = "kb-row";
    for (const k of rowLetters) {
      const btn = document.createElement("button");
      btn.className = "key";
      btn.textContent = k;
      if (k === "ENTER" || k === "⌫") btn.classList.add("wide");
      const lower = k.toLowerCase();
      if (state.keyStatus[lower]) btn.classList.add(state.keyStatus[lower]);
      btn.addEventListener("click", () => handleKey(k === "ENTER" ? "Enter" : k === "⌫" ? "Backspace" : k));
      rowDiv.appendChild(btn);
    }
    el.keyboard.appendChild(rowDiv);
  }
}

function renderBits() {
  const n = state.candidates.length;
  const bits = n > 0 ? Math.log2(n) : 0;
  el.bitsValue.textContent = bits.toFixed(2);
  el.candCount.textContent = n.toLocaleString();
  const pct = START_BITS > 0 ? Math.max(2, (bits / START_BITS) * 100) : 0;
  el.bitsBar.style.width = pct + "%";
}

function renderLedger() {
  if (state.rows.length === 0) {
    el.ledger.innerHTML = '<p class="ledger-empty">No guesses yet.</p>';
    return;
  }
  el.ledger.innerHTML = "";
  state.rows.forEach((row, i) => {
    const div = document.createElement("div");
    div.className = "ledger-row";
    div.innerHTML = `
      <span class="ledger-idx">${i + 1}</span>
      <span class="ledger-word">${row.word.toUpperCase()}</span>
      <span class="ledger-bits">${row.actualBits.toFixed(1)}b act / ${row.expectedBits.toFixed(1)}b exp</span>
    `;
    el.ledger.appendChild(div);
  });
}

/* ---------------- suggestion ---------------- */

function updateSuggestion() {
  if (state.gameOver) return;
  el.btnSuggest.disabled = true;

  if (state.rows.length === 0) {
    // Turn 1: use the precomputed opener instead of a live full-list search.
    el.suggestWord.textContent = PRECOMPUTED_OPENER.toUpperCase();
    el.suggestMeta.textContent = "Precomputed opener · expected 6.16 bits";
    el.btnSuggest.disabled = false;
    return;
  }

  el.suggestWord.textContent = "…";
  el.suggestMeta.textContent = "Thinking…";

  // Defer so the "Thinking…" state actually paints before the (synchronous,
  // but now-small since candidates shrank) search runs.
  setTimeout(() => {
    if (state.candidates.length === 0) {
      el.suggestWord.textContent = "—";
      el.suggestMeta.textContent = "No candidates left.";
      return;
    }
    if (state.candidates.length === 1) {
      el.suggestWord.textContent = state.candidates[0].toUpperCase();
      el.suggestMeta.textContent = "Only word left — this is the answer.";
      el.btnSuggest.disabled = false;
      return;
    }
    const pool = state.candidates.length <= 3000 ? state.candidates : sampleWords(state.candidates, 800);
    const { word, bits } = bestGuess(pool, state.candidates);
    el.suggestWord.textContent = word.toUpperCase();
    el.suggestMeta.textContent = `Expected ${bits.toFixed(2)} bits · ${state.candidates.length.toLocaleString()} candidates remain`;
    el.btnSuggest.disabled = false;
  }, 10);
}

function sampleWords(arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0 && copy.length - i <= n; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(-n);
}

/* ---------------- input handling ---------------- */

function handleKey(key) {
  if (state.gameOver) return;

  if (state.rowPhase === "coloring") {
    if (key === "Enter") confirmColoring();
    return; // letter/backspace ignored while coloring in assist mode
  }

  if (key === "Enter") {
    submitTypedGuess();
    return;
  }
  if (key === "Backspace") {
    state.currentLetters.pop();
    renderBoard();
    return;
  }
  if (/^[a-z]$/i.test(key) && state.currentLetters.length < 5) {
    state.currentLetters.push(key.toLowerCase());
    renderBoard();
  }
}

function submitTypedGuess() {
  if (state.currentLetters.length !== 5) {
    setStatus("Word needs 5 letters.");
    return;
  }
  const guess = state.currentLetters.join("");
  if (!WORD_SET.has(guess)) {
    setStatus(`"${guess.toUpperCase()}" isn't in the word list — try another.`);
    return;
  }

  if (state.mode === "play") {
    commitRow(guess, scoreGuess(guess, state.secret));
  } else {
    state.rowPhase = "coloring";
    state.currentColors = ["gray", "gray", "gray", "gray", "gray"];
    setStatus("Click each tile to match the colors your real Wordle game showed.");
    renderBoard();
  }
}

function cycleColor(index) {
  const order = ["gray", "yellow", "green"];
  const next = order[(order.indexOf(state.currentColors[index]) + 1) % order.length];
  state.currentColors[index] = next;
  renderBoard();
}

function confirmColoring() {
  const guess = state.currentLetters.join("");
  const pattern = colorsToPattern(state.currentColors);
  commitRow(guess, pattern);
}

function commitRow(guess, pattern) {
  const before = state.candidates.length;
  const expectedBits = entropyForGuess(guess, state.candidates);

  state.candidates = filterCandidates(state.candidates, guess, pattern);
  const after = Math.max(state.candidates.length, 1);
  const actualBits = Math.log2(before / after);

  const colors = patternToColors(pattern);
  state.rows.push({ word: guess, colors, pattern, expectedBits, actualBits });
  state.currentLetters = [];
  state.rowPhase = "typing";

  colors.forEach((c, i) => {
    const letter = guess[i];
    const rank = { gray: 0, yellow: 1, green: 2 };
    if (!state.keyStatus[letter] || rank[c] > rank[state.keyStatus[letter]]) {
      state.keyStatus[letter] = c;
    }
  });

  const won = colors.every((c) => c === "green");
  if (won) {
    state.gameOver = true;
    setStatus(`Solved in ${state.rows.length} guess${state.rows.length === 1 ? "" : "es"}.`, "win");
  } else if (state.rows.length >= MAX_GUESSES) {
    state.gameOver = true;
    const reveal = state.mode === "play" ? ` The word was ${state.secret.toUpperCase()}.` : "";
    setStatus(`Out of guesses.${reveal}`, "lose");
  } else {
    setStatus(
      state.mode === "play"
        ? "Keep going."
        : "Type your next guess, then match its colors."
    );
  }

  render();
  updateSuggestion();
}

/* ---------------- mode switching ---------------- */

function setMode(mode) {
  state.mode = mode;
  el.modePlay.classList.toggle("active", mode === "play");
  el.modePlay.setAttribute("aria-selected", mode === "play");
  el.modeAssist.classList.toggle("active", mode === "assist");
  el.modeAssist.setAttribute("aria-selected", mode === "assist");
  resetGame();
}

/* ---------------- wire up ---------------- */

el.btnSuggest.addEventListener("click", () => {
  if (state.rowPhase === "coloring") return;
  const word = el.suggestWord.textContent.toLowerCase();
  if (WORD_SET.has(word)) {
    state.currentLetters = word.split("");
    renderBoard();
  }
});

el.btnNew.addEventListener("click", resetGame);
el.modePlay.addEventListener("click", () => setMode("play"));
el.modeAssist.addEventListener("click", () => setMode("assist"));

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Enter" || e.key === "Backspace") { handleKey(e.key); return; }
  if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key);
});

// Buttons shouldn't retain keyboard focus after a mouse click — otherwise a
// focused button (e.g. the mode toggle, or a re-rendered on-screen key) could
// intercept a later physical Enter keypress as a native click, double-firing
// alongside our own Enter handling (this was a real bug: it silently reset
// the game mid-guess). Delegated on document since keyboard keys are
// re-rendered on every state change.
document.addEventListener("mousedown", (e) => {
  if (e.target.closest("button")) e.preventDefault();
});

resetGame();
