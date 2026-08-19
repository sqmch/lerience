# Coordinates and displacement

Everything in this course is built from one idea: a pair of numbers can mean two different things,
and most of the bugs you will write in the next eight modules come from confusing them. This
chapter gives the two things their names, shows you how to tell them apart in code, and works one
example end to end so the pattern is familiar before the brief asks you to build it.

## The map

Picture a town map laid over a square grid. Every square has an address: how many squares east of
the town hall, and how many squares north. The town hall itself is `[0, 0]`, the **origin**. The
library is three squares east and four squares north, so its address is `[3, 4]`. The station is
one square west and two squares north: `[-1, 2]`.

```ts
const townHall = [0, 0];
const library = [3, 4];
const station = [-1, 2];
```

An address like this is a **position**. It answers the question _where?_ and it only makes sense
relative to the origin. Move the town hall and every address changes.

Now walk from the station to the library. You go four squares east and two squares north. That
walk is also a pair of numbers, `[4, 2]`, but it is a different kind of thing. It answers _how did
you move?_ and it does not care where you started: four east and two north from the town hall lands
you somewhere else entirely, but it is the same walk. This is a **displacement**.

| Written  | Kind         | Answers          | Depends on the origin? |
| -------- | ------------ | ---------------- | ---------------------- |
| `[3, 4]` | position     | where is it?     | yes                    |
| `[4, 2]` | displacement | how did it move? | no                     |

Both are written as two numbers. Nothing in `[3, 4]` tells you which it is. That is the whole
problem, and the rest of this chapter is about keeping them straight anyway.

## Components and axes

Each number in the pair is a **component**. The first is the **x component**, measured along the
east-west axis; the second is the **y component**, along the north-south axis. East and north are
positive, west and south are negative. `[-1, 2]` is one square west, two north.

The order is a convention, not a law of nature. Screens put y downward, geographers put latitude
first, and some libraries use `{ x, y }` objects instead of arrays. This course uses `[x, y]`
arrays with y pointing north, because the checks do, and because an array is the shape that
generalizes later when a "position" has 384 components instead of two.

## The three legal operations

There are exactly three things you can do with positions and displacements, and one thing you
cannot.

**Position + displacement = position.** Start at the station, walk `[4, 2]`, arrive at the
library. Add the components one by one:

```ts
function displace(position: number[], displacement: number[]): number[] {
  return [position[0] + displacement[0], position[1] + displacement[1]];
}

displace([-1, 2], [4, 2]); // [3, 4], the library
```

**Position − position = displacement.** "How do I get from the station to the library?" is
`library − station`, component by component, and the answer is a walk:

```ts
function between(from: number[], to: number[]): number[] {
  return [to[0] - from[0], to[1] - from[1]];
}

between([-1, 2], [3, 4]); // [4, 2]
```

Note the order: the walk _from_ A _to_ B is `B − A`. Reversing the subtraction gives you the
walk back, `[-4, -2]`, which is also meaningful. Getting it backwards is the single most common
mistake in this module, and the checks probe it directly.

**Displacement + displacement = displacement.** Walk `[4, 2]`, then walk `[1, -3]`. The combined
walk is `[5, -1]`. This is why a route can be described as a list of legs and summed.

**Position + position is meaningless.** The library plus the station is `[2, 6]`, and `[2, 6]` is
not a place anyone asked about. If you ever find yourself adding two positions, one of them was a
displacement in disguise, or you have a bug. Some languages give positions and displacements
different types so the compiler refuses this line. TypeScript will not refuse it for two arrays,
so the discipline is yours.

## A worked example

A delivery rider starts at the depot, `[2, -1]`, and has three stops to make. The dispatcher hands
over the route as a list of legs, each a displacement:

```ts
const depot = [2, -1];
const legs = [
  [3, 0], // east along the main road
  [0, 4], // north up the hill
  [-2, 1], // cut through the park
];
```

Where does the rider end up, and how far from the depot is the last stop as the crow flies? Take
it one operation at a time, and say which kind of thing each value is.

1. Sum the legs. Displacement plus displacement is a displacement: `[3, 0] + [0, 4] + [-2, 1]`
   is `[1, 5]`. That is the rider's total walk, and it would be the same from any depot.
2. Apply it to the depot. Position plus displacement is a position: `[2, -1] + [1, 5]` is
   `[3, 4]`. The last stop is the library.
3. The crow's flight back is `between(lastStop, depot)`: `[2 − 3, −1 − 4]` = `[-1, -5]`. That is a
   displacement. Its length, which you will learn to compute in the next module, is the
   straight-line distance; for now it is enough that it is a walk, not a place.

Write it as code, and notice that every intermediate value has a kind you can name:

```ts
const total = legs.reduce((sum, leg) => displace(sum, leg), [0, 0]); // displacement
const lastStop = displace(depot, total); // position
const home = between(lastStop, depot); // displacement
```

The `reduce` starts from `[0, 0]` because the zero displacement is "no walk at all", and summing
legs onto it is displacement plus displacement. It would be wrong to start the reduce from
`depot`: that would be position plus displacement at each step, which also produces the right
final position, but the intermediate values would silently switch kind. Either works today.
Only one of them survives contact with a second rider.

## Why it is built this way

You could write a single `add(a, b)` and use it for everything. The reason this module gives you
two functions with different names, `displace` and `between`, is that the names carry the kind of
thing you are handling even though the arrays do not. When you read `displace(depot, total)`
three weeks from now you know the first argument is a place and the second is a walk. When you
read `add(depot, total)` you have to reconstruct it.

The same discipline is what makes the later modules possible. Length, direction, and similarity
are all properties of displacements. Asking "what is the direction of the library?" is a question
about the walk from the origin to it, and being precise about that now is what keeps cosine
similarity from turning into a pile of special cases in module 02.

## Common mistakes

- Subtracting in the wrong order and getting the walk back instead of the walk there. Say it out
  loud: _to minus from_.
- Treating `[0, 0]` as "nothing". As a position it is the origin, which is a real place. As a
  displacement it is "stay put". The checks include both.
- Mutating the input arrays. `position[0] += displacement[0]` changes the caller's depot. Return a
  new array.

## Vocabulary

- **position**: a place on the map, relative to the origin
- **origin**: the position `[0, 0]` that every other position is measured from
- **displacement**: a move, with a size and a direction, independent of where it starts
- **component**: one number of the pair; x is east-west, y is north-south
- **zero displacement**: `[0, 0]` as a move: stay where you are
