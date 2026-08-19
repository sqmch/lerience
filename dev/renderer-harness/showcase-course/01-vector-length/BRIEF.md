# Brief — measure a route segment

Read `LESSON.md` first, including the section on the zero vector.

## The task

`scaffold/src/length.ts` has two `TODO(you)` gaps:

1. `magnitude(vector)` returns how far the vector carries you in a straight line. Write the
   sum-of-squares version yourself; once the checks pass, you may replace the body with
   `Math.hypot(...vector)`.
2. `normalize(vector)` returns a vector of magnitude 1 pointing the same way. For the zero
   vector, decide what the function does, and make the decision visible: a thrown error with a
   clear message, or a documented return value. The checks accept either, and reject `NaN`.

Both functions must work for vectors of any dimension, not only two.

## Acceptance criteria

- `magnitude([3, 4])` is `5`; `magnitude([2, 3, 6])` is `7`.
- `magnitude([0, 0])` is `0`.
- `magnitude([-3, 4])` equals `magnitude([3, 4])`.
- `normalize([3, 4])` is `[0.6, 0.8]` within floating-point tolerance, and `magnitude` of the
  result is `1`.
- `normalize([0, -7])` is `[0, -1]`.
- `normalize([0, 0])` either throws or returns a value with no `NaN` in it.
- Neither function mutates its argument.

## Running the checks

`npm run check` in the module folder, or **Run checks** in Lerience. Seven checks; the zero-vector
one is written to accept both of the defensible behaviours.

**Time budget:** about one hour. Ask for a hint after two serious attempts.
