"""
Benchmark the solver's average performance over a sample of secret words.

Usage:
    python benchmark.py --sample 100
    python benchmark.py --sample 100 --opener soare
"""

import argparse
import random
import time

from solver import WordleSolver, load_words, score_guess


def solve_one(solver: WordleSolver, all_words: list[str], secret: str, opener: str | None) -> int:
    solver.reset(all_words)
    guesses = 0
    for turn in range(1, 7):
        guesses += 1
        if turn == 1 and opener:
            guess = opener
        elif len(solver.candidates) == 1:
            guess = solver.candidates[0]
        else:
            pool = solver.all_guesses if turn == 1 else solver.candidates
            guess, _ = solver.best_guess(guess_pool=pool)

        if guess == secret:
            return guesses

        pattern = score_guess(guess, secret)
        solver.filter_candidates(guess, pattern)
    return guesses  # capped at 6 even if not solved; treat as a "loss" at 6+


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", type=int, default=50, help="number of secret words to test")
    parser.add_argument("--opener", type=str, default=None, help="fixed first guess (skips searching turn 1)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    words = load_words("words.txt")
    rng = random.Random(args.seed)
    sample = rng.sample(words, min(args.sample, len(words)))

    solver = WordleSolver(guesses=words, answers=words)

    results = []
    start = time.time()
    for i, secret in enumerate(sample, 1):
        n = solve_one(solver, words, secret, args.opener)
        results.append(n)
        print(f"[{i}/{len(sample)}] {secret:>6} -> {n} guesses")

    elapsed = time.time() - start
    avg = sum(results) / len(results)
    solved_within_6 = sum(1 for r in results if r <= 6)

    print("\n--- Summary ---")
    print(f"Words tested:        {len(results)}")
    print(f"Average guesses:     {avg:.2f}")
    print(f"Solved within 6:     {solved_within_6}/{len(results)} ({100 * solved_within_6 / len(results):.1f}%)")
    print(f"Total time:          {elapsed:.1f}s")


if __name__ == "__main__":
    main()
