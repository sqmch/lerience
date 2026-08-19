# Brief — compare two route segments

Read `LESSON.md` first, including the section on the zero vector.

## The task

`scaffold/src/direction.ts` has three `TODO(you)` gaps:

1. `magnitude(vector)`, as in module 01. Bring it across or use `Math.hypot`.
2. `dot(left, right)` returns the dot product of two vectors of the same dimension.
3. `cosineSimilarity(left, right)` returns the cosine of the angle between them, in the range
   −1 to 1.

All three must work for any dimension, and none may change its arguments.

## Acceptance criteria

- `cosineSimilarity([3, 4], [6, 8])` is `1` within floating-point tolerance.
- `cosineSimilarity([3, 4], [4, -3])` is `0`.
- `cosineSimilarity([3, 4], [-3, -4])` is `-1`.
- `dot([1, 2, 3], [4, 5, 6])` is `32`.
- `cosineSimilarity` with a zero vector on either side does not return `NaN`: it throws with a
  clear message, or returns a value you have documented in a comment above the function.

## Running the checks

`npm run check` in the module folder, or **Run checks** in Lerience. Five checks. The two
zero-vector checks are the ones that fail against a formula that has not decided anything; that is
what they are for.

**Time budget:** about one hour. Ask for a hint after two serious attempts.

The last thing the checks look at is the zero vector. Decide what your function does with a vector
that has no direction, and write the decision where the next reader will see it.
