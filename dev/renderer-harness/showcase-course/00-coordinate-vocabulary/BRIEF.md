# Brief — move a marker

Read `LESSON.md` first. This brief assumes you have.

## The task

`scaffold/src/move.ts` has two functions with their bodies cut out, each marked `TODO(you)`:

1. `displace(position, displacement)` returns the position you reach by making that move from
   that place.
2. `between(from, to)` returns the displacement that takes you from the first position to the
   second.

Both take and return `[x, y]` arrays of numbers. Neither may change its arguments.

## Acceptance criteria

- `displace([-1, 2], [4, 2])` is `[3, 4]`.
- `displace(p, [0, 0])` is `p` for any position: the zero move goes nowhere.
- `between(a, b)` followed by `displace(a, between(a, b))` lands on `b`. The checks try this with
  several pairs, including pairs where a component goes negative.
- `between(a, a)` is `[0, 0]`.
- Calling either function leaves the arrays you passed in unchanged.

## Running the checks

From the module folder, `npm run check`, or press **Run checks** in Lerience. There are six
checks. All of them fail against the scaffold as handed to you; that is the point.

## Scope

Stay in two dimensions and stay with arrays. Do not reach for a vector library; the next two
modules build the pieces you would otherwise import, and you need to have written them once.

**Time budget:** about 45 minutes. If you are past an hour, ask for a hint rather than pushing
on. The first hint is a nudge, not a spoiler.
