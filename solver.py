"""
Entropy-based Wordle solver.

Core idea: at every step, score each candidate guess by the *information*
(Shannon entropy, in bits) it's expected to reveal, and play the guess
that maximizes that expected information gain. This is the same idea
popularized by 3Blue1Brown's Wordle video: a good guess isn't the one
most likely to be the answer, it's the one that splits the remaining
possibility space as evenly as possible across the 3^5 = 243 feedback
patterns.

Feedback encoding
------------------
Each letter in a guess gets a result relative to the secret word:
  2 = green  (correct letter, correct position)
  1 = yellow (correct letter, wrong position)
  0 = gray   (letter not in the word, accounting for duplicates)

A full 5-letter result is encoded as a single base-3 integer in [0, 242]:
    pattern = sum(result[i] * 3**i for i in range(5))
"""

from __future__ import annotations

import math
from collections import Counter
from pathlib import Path

import numpy as np

WORD_LENGTH = 5
NUM_PATTERNS = 3 ** WORD_LENGTH


def load_words(path: str | Path = "words.txt") -> list[str]:
    """Load the newline-separated word list into a sorted list of 5-letter words."""
    with open(path) as f:
        words = [line.strip().lower() for line in f if line.strip()]
    words = sorted({w for w in words if len(w) == WORD_LENGTH and w.isalpha()})
    return words


def score_guess(guess: str, answer: str) -> int:
    """
    Compute the Wordle feedback pattern for `guess` against `answer`,
    correctly handling duplicate letters, and return it as a base-3 int.
    """
    result = [0] * WORD_LENGTH

    # First pass: greens.
    remaining = Counter(answer)
    for i, (g, a) in enumerate(zip(guess, answer)):
        if g == a:
            result[i] = 2
            remaining[g] -= 1

    # Second pass: yellows, respecting remaining letter counts.
    for i, g in enumerate(guess):
        if result[i] == 2:
            continue
        if remaining.get(g, 0) > 0:
            result[i] = 1
            remaining[g] -= 1

    return sum(digit * (3 ** i) for i, digit in enumerate(result))


def pattern_matrix(guesses: list[str], answers: list[str]) -> np.ndarray:
    """
    Build a (len(guesses), len(answers)) matrix of base-3 feedback patterns,
    vectorized across the answer axis so it stays fast even for the full
    ~14.8k word list.
    """
    guess_arr = np.array([[ord(c) for c in w] for w in guesses], dtype=np.int8)
    answer_arr = np.array([[ord(c) for c in w] for w in answers], dtype=np.int8)

    n_guesses, n_answers = len(guesses), len(answers)
    patterns = np.zeros((n_guesses, n_answers), dtype=np.int16)

    for gi in range(n_guesses):
        g = guess_arr[gi]  # shape (5,)
        result = np.zeros((n_answers, WORD_LENGTH), dtype=np.int8)

        # Greens: letter matches at the same position.
        green_mask = answer_arr == g  # (n_answers, 5)
        result[green_mask] = 2

        # Vectorized yellow pass: for each letter position in the guess,
        # check whether that letter appears (in excess of consumed greens)
        # anywhere else in the answer.
        answer_counts = np.zeros((n_answers, 26), dtype=np.int16)
        for pos in range(WORD_LENGTH):
            answer_counts[np.arange(n_answers), answer_arr[:, pos] - 97] += 1
        # subtract greens from available counts
        for pos in range(WORD_LENGTH):
            greens_here = green_mask[:, pos]
            answer_counts[greens_here, g[pos] - 97] -= 1

        used = np.zeros((n_answers, 26), dtype=np.int16)
        for pos in range(WORD_LENGTH):
            if green_mask[:, pos].all():
                continue
            letter_idx = g[pos] - 97
            not_green = ~green_mask[:, pos]
            available = (answer_counts[:, letter_idx] - used[:, letter_idx]) > 0
            is_yellow = not_green & available
            result[is_yellow, pos] = 1
            used[is_yellow, letter_idx] += 1

        patterns[gi] = (result * (3 ** np.arange(WORD_LENGTH))).sum(axis=1)

    return patterns


def entropy_for_guess(guess_row: np.ndarray) -> float:
    """Shannon entropy (bits) of the feedback-pattern distribution for one guess row."""
    counts = np.bincount(guess_row, minlength=NUM_PATTERNS)
    probs = counts[counts > 0] / guess_row.size
    return float(-(probs * np.log2(probs)).sum())


class WordleSolver:
    def __init__(self, guesses: list[str], answers: list[str]):
        self.all_guesses = guesses
        self.candidates = list(answers)  # remaining possible answers

    def best_guess(self, guess_pool: list[str] | None = None) -> tuple[str, float]:
        """
        Return (word, expected_bits) for the guess in `guess_pool` (default:
        full valid-guess list) that maximizes expected information gain
        against the current candidate set.
        """
        pool = guess_pool if guess_pool is not None else self.all_guesses
        matrix = pattern_matrix(pool, self.candidates)
        entropies = np.array([entropy_for_guess(row) for row in matrix])
        best_idx = int(entropies.argmax())
        return pool[best_idx], float(entropies[best_idx])

    def filter_candidates(self, guess: str, pattern: int) -> None:
        """Narrow self.candidates to answers consistent with the observed pattern."""
        self.candidates = [a for a in self.candidates if score_guess(guess, a) == pattern]

    def reset(self, answers: list[str]) -> None:
        self.candidates = list(answers)


def pattern_to_str(pattern: int) -> str:
    """Render a base-3 pattern as a 5-char string of B/Y/G for display."""
    chars = []
    for _ in range(WORD_LENGTH):
        digit = pattern % 3
        chars.append({0: "B", 1: "Y", 2: "G"}[digit])
        pattern //= 3
    return "".join(chars)
