"""
Interactive assistant: use this alongside a real Wordle game.

Run it, and after each guess you make on the actual Wordle site/app,
type the guess and the feedback you got (using g/y/b for green/yellow/gray)
back into this tool. It will tell you the next best guess.

Example:
    $ python play.py
    Best opening guess: soare (expected 5.88 bits)
    Enter the word you guessed: soare
    Enter the result (g/y/b per letter, e.g. gybbb): bybgb
    ...
"""

from solver import WordleSolver, load_words, pattern_to_str


def parse_feedback(s: str) -> int:
    s = s.strip().lower()
    if len(s) != 5 or any(c not in "gyb" for c in s):
        raise ValueError("Feedback must be exactly 5 characters using g/y/b")
    digit_map = {"b": 0, "y": 1, "g": 2}
    return sum(digit_map[c] * (3 ** i) for i, c in enumerate(s))


# Precomputed via `python benchmark.py` / a one-off full search (see README) —
# searching all ~14.8k x 14.8k word pairs from scratch takes ~45-60s, so the
# turn-1 guess is cached here. Delete this default (pass --search-opener) to
# recompute it live instead.
PRECOMPUTED_OPENER = "tares"


def main():
    import sys

    search_opener = "--search-opener" in sys.argv

    words = load_words("words.txt")
    solver = WordleSolver(guesses=words, answers=words)

    print(f"Loaded {len(words)} words.\n")

    for turn in range(1, 7):
        if len(solver.candidates) == 1:
            print(f"Only one candidate left: {solver.candidates[0].upper()}. That's the answer!")
            return
        if len(solver.candidates) == 0:
            print("No candidates left — check that your feedback was entered correctly.")
            return

        # Full brute-force search is slow after turn 1 once the guess pool
        # is still huge; restricting to remaining candidates keeps it snappy
        # while staying optimal in practice for most games.
        if turn == 1 and not search_opener:
            guess, bits = PRECOMPUTED_OPENER, None
        else:
            pool = solver.all_guesses if turn == 1 else solver.candidates
            guess, bits = solver.best_guess(guess_pool=pool)

        print(f"Turn {turn} — {len(solver.candidates)} candidates remaining.")
        if bits is not None:
            print(f"Suggested guess: {guess.upper()}  (expected info: {bits:.2f} bits)")
        else:
            print(f"Suggested guess: {guess.upper()}  (precomputed opener)")

        actual_guess = input("What word did you actually guess? [enter to accept suggestion]: ").strip().lower()
        if not actual_guess:
            actual_guess = guess

        while True:
            fb = input("Result (5 chars, g/y/b, e.g. gybbb): ").strip().lower()
            try:
                pattern = parse_feedback(fb)
                break
            except ValueError as e:
                print(e)

        if pattern_to_str(pattern) == "GGGGG":
            print(f"\nSolved in {turn} guesses: {actual_guess.upper()}")
            return

        solver.filter_candidates(actual_guess, pattern)
        print()

    print("Out of guesses — the word wasn't found in 6 turns.")


if __name__ == "__main__":
    main()
