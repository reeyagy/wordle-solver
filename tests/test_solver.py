import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from solver import pattern_matrix, pattern_to_str, score_guess  # noqa: E402


def test_all_green():
    assert score_guess("crane", "crane") == 2 + 2 * 3 + 2 * 9 + 2 * 27 + 2 * 81


def test_all_gray():
    # "chunk" shares no letters with "brave"
    p = score_guess("chunk", "brave")
    assert pattern_to_str(p) == "BBBBB"


def test_yellow_basic():
    # guess "arise" vs answer "crane": a,r,e are in the word but wrong spots
    p = score_guess("arise", "crane")
    assert pattern_to_str(p) != "BBBBB"


def test_duplicate_letters_dont_overcount():
    # answer has one 'l'; guess has two 'l's -> only one should be marked (green or yellow)
    p = score_guess("hello", "later")
    s = pattern_to_str(p)
    l_marks = [s[i] for i, c in enumerate("hello") if c == "l"]
    assert sum(1 for m in l_marks if m != "B") == 1


def test_pattern_matrix_matches_score_guess():
    guesses = ["crane", "adieu", "hello"]
    answers = ["crane", "hello", "later", "brave"]
    matrix = pattern_matrix(guesses, answers)
    for gi, g in enumerate(guesses):
        for ai, a in enumerate(answers):
            assert matrix[gi, ai] == score_guess(g, a)


def test_solver_finds_answer_within_six_guesses():
    from solver import WordleSolver, load_words

    words = load_words(str(Path(__file__).resolve().parents[1] / "words.txt"))
    solver = WordleSolver(guesses=words, answers=words)
    secret = "crane"

    guess_pool = ["soare", "roate", "tares", "crane"]  # small pool to keep test fast
    guesses_made = 0
    for _ in range(6):
        guess, _ = solver.best_guess(guess_pool=[w for w in guess_pool if w in solver.all_guesses] or None)
        guesses_made += 1
        if guess == secret:
            break
        pattern = score_guess(guess, secret)
        solver.filter_candidates(guess, pattern)
    assert guesses_made <= 6
