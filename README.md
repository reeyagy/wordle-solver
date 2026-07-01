# Entropy-Based Wordle Solver

A Wordle solver that picks each guess by maximizing **expected information
gain** (Shannon entropy), instead of just guessing likely words. This is the
same idea 3Blue1Brown popularized in his Wordle video: the best guess isn't
necessarily the one most likely to be correct — it's the one that splits
the remaining candidate words as evenly as possible across all 243 possible
feedback patterns, so that whatever feedback you get, you've eliminated the
most possibilities.

## How it works

1. Every guess/answer pair produces one of `3^5 = 243` feedback patterns
   (green/yellow/gray per letter, with correct duplicate-letter handling).
2. For a candidate guess, group all remaining possible answers by the
   pattern they'd produce, and compute the Shannon entropy of that
   distribution:
   `H = -Σ p(pattern) * log2(p(pattern))`
3. Guess the word with the highest entropy — the one expected to narrow
   down the answer the most, regardless of what the real answer turns out
   to be.
4. After each real guess, filter the candidate list down to only the words
   consistent with the feedback received, and repeat.

Pattern computation is vectorized with NumPy across the answer axis, so
scoring one candidate guess against the ~14.8k possible answers is fast
even though the underlying feedback rules (duplicate-letter handling) are
non-trivial.

## Results

Benchmarked over 40 held-out secret words, using the precomputed opener
`TARES`:

| Metric | Value |
|---|---|
| Average guesses to solve | 4.35 |
| Solved within 6 guesses | 40/40 (100%) |

Run `python benchmark.py --sample 100` to reproduce (or test a larger
sample) on your machine.

Note: this uses an open 5-letter word list (~14.8k words, including many
uncommon/archaic words) rather than the NYT's curated ~2,300-word answer
list, so average performance here is a bit worse than it would be against
the real Wordle answer set, which skews toward common words.

## Web app

The `docs/` folder is a full browser port (vanilla JS, no build step, no
backend) — a playable Wordle board with a live "bits remaining" gauge and a
guess ledger showing expected vs. actual information gained each turn. It
runs entirely client-side, so it can be hosted for free with GitHub Pages:

**Settings → Pages → Deploy from branch → `main` / `docs`**, then visit
`https://reeyagy.github.io/wordle-solver/`.

Two modes:
- **Play** — the site picks a random secret word and scores your guesses automatically.
- **Assist a real game** — type the guess you actually made in a real Wordle game, then click each tile to match the colors it gave you; the solver suggests your next move.

## Usage

```bash
pip install -r requirements.txt

# Play interactively alongside a real Wordle game:
python play.py

# Benchmark solver performance over a random sample of words:
python benchmark.py --sample 100

# Force a fresh full-search for the best opening word (takes ~45-60s):
python play.py --search-opener
```

Example interactive session:

```
$ python play.py
Loaded 14855 words.

Turn 1 — 14855 candidates remaining.
Suggested guess: TARES  (precomputed opener)
What word did you actually guess? [enter to accept suggestion]:
Result (5 chars, g/y/b, e.g. gybbb): bybbb

Turn 2 — 462 candidates remaining.
Suggested guess: CLOUD  (expected info: 4.71 bits)
...
```

## Project structure

```
wordle-solver/
├── solver.py          # core entropy/scoring engine (Python)
├── play.py             # interactive CLI to use alongside a real game
├── benchmark.py         # measures average solver performance
├── words.txt             # 5-letter word list
├── docs/                   # browser port — playable site (GitHub Pages)
│   ├── index.html
│   ├── style.css
│   ├── solver.js            # entropy engine, ported from solver.py
│   ├── app.js                # game state + UI
│   └── words.js                # word list as a JS array
├── tests/
│   └── test_solver.py    # correctness tests for scoring + solver
└── requirements.txt
```

## Testing

```bash
pip install -r requirements.txt pytest
pytest tests/ -v
```

## Possible extensions

- Swap in the real NYT answer list to more directly compare against
  published average-guess stats.
- Add a "hard mode" flag (must reuse all revealed greens/yellows).
- Precompute and cache the full pattern matrix to disk so later turns
  don't recompute patterns already seen in earlier games.
- Explore alternative scoring functions (e.g. minimax worst-case
  candidates remaining) instead of pure entropy.

