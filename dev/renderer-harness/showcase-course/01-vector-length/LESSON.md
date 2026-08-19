# Vector length

A displacement is a move with a size and a direction. Module 00 gave you the move; this chapter
gives you its size. By the end you will be able to say how far a displacement carries you in a
straight line, turn any displacement into one of size exactly 1, and explain why the same two
lines of code work for a pair of numbers and for a list of 384 of them.

From here on, "vector" means a displacement. A position is a vector from the origin, which is why
the word gets used for both; but everything in this chapter is about moves.

## Two kinds of "how big"

Ask how big `[3, 4]` is and you can mean two things.

You might mean _how many numbers are in it_. That is 2. It is the vector's **dimension**, and in
code it is `vector.length`. Every vector on our map has dimension 2.

Or you might mean _how far does it carry you_. Three east and four north is not seven squares of
travel; it is five, as the crow flies. That is the vector's **magnitude**, written `‖v‖`, and it
is what this chapter is about.

The two are easy to confuse because JavaScript calls the first one `.length`. The lab in module 02
puts them side by side for exactly that reason. For now, fix the rule: `.length` is how many
components, `magnitude()` is how far.

## Where the five comes from

Draw `[3, 4]` on the grid: three squares east, then four north. You have drawn two sides of a
right triangle. The displacement itself, the straight line from start to finish, is the
hypotenuse. Pythagoras tells you its length:

```text
magnitude² = 3² + 4² = 9 + 16 = 25
magnitude  = √25 = 5
```

The same works for any components, including negative ones, because squaring a negative number
gives a positive result. `[-3, 4]` also has magnitude 5; it points a different way, and that is
the direction's business, not the length's.

```ts
function magnitude(vector: number[]): number {
  let sum = 0;
  for (const component of vector) sum += component * component;
  return Math.sqrt(sum);
}

magnitude([3, 4]); // 5
magnitude([-3, 4]); // 5
magnitude([1, 0]); // 1
magnitude([0, 0]); // 0
```

Notice that nothing in that loop cares that there are two components. Give it `[1, 2, 2]` and it
returns 3. Give it 384 numbers and it returns the length of that 384-dimensional move, which is
not something you can draw but is exactly as well defined. This is the first place the course
earns the array: the formula you can see in two dimensions is the one that runs in any number.

JavaScript ships this as `Math.hypot`, and you should use it once you have written it yourself
once. It also avoids an overflow trap the naive version has with very large components:

```ts
const magnitude = (vector: number[]): number => Math.hypot(...vector);
```

## Annotated examples

| Vector       | Working        | Magnitude |
| ------------ | -------------- | --------- |
| `[3, 4]`     | √(9 + 16)      | 5         |
| `[1, 1]`     | √(1 + 1)       | 1.41…     |
| `[0, -7]`    | √(0 + 49)      | 7         |
| `[2, 3, 6]`  | √(4 + 9 + 36)  | 7         |
| `[0, 0]`     | √0             | 0         |
| `[0.6, 0.8]` | √(0.36 + 0.64) | 1         |

The last row matters. A vector of magnitude exactly 1 is a **unit vector**. It carries pure
direction and no size, and the next module leans on it hard.

## Normalizing

Any non-zero vector can be scaled down to a unit vector pointing the same way. Divide every
component by the magnitude:

```ts
function normalize(vector: number[]): number[] {
  const size = magnitude(vector);
  return vector.map((component) => component / size);
}

normalize([3, 4]); // [0.6, 0.8]
normalize([0, -7]); // [0, -1]
```

Check it: `[0.6, 0.8]` has magnitude 1, and it points the same way as `[3, 4]` because both
components were divided by the same number. Normalizing throws away how far and keeps which way.

One case is not covered by that code, and the brief will make you decide about it. `[0, 0]` has
magnitude 0, so `normalize([0, 0])` divides by zero and returns `[NaN, NaN]`. That is not a
direction; the zero vector does not have one. A function can throw, return `null`, or return the
zero vector back, and all three are defensible. What is not defensible is returning `NaN` by
accident and letting it flow into the rest of the program. Decide, and say so in the code.

## A worked example

A hiker's GPS logs a leg as `[1.2, -3.5]` kilometres. How far did they walk in a straight line,
and which way, as a unit vector?

1. Magnitude: √(1.2² + 3.5²) = √(1.44 + 12.25) = √13.69 = 3.7 km.
2. Normalize: `[1.2 / 3.7, -3.5 / 3.7]` = `[0.32, -0.95]`, rounded. A little east, mostly south.
3. Sanity check: 0.32² + 0.95² ≈ 0.10 + 0.90 = 1. It is a unit vector.

```ts
const leg = [1.2, -3.5];
const distance = magnitude(leg); // 3.7
const heading = normalize(leg); // [0.32, -0.95]
```

If a second hiker walked `[2.4, -7.0]`, twice as far along the same line, their `distance` is 7.4
and their `heading` is the same `[0.32, -0.95]`. That is the whole point of separating the two:
"same direction, different distance" becomes two numbers you can compare independently.

## Why it is built this way

The brief asks for `magnitude` and `normalize` as two functions rather than one `describe()` that
returns both. That is deliberate. Module 02 needs `magnitude` on its own, inside a formula, and
module 03 needs `normalize` on its own, to compare headings. Small functions with one job each
compose into later modules; a convenience bundle does not.

It also asks you to write `magnitude` by hand before switching to `Math.hypot`. Writing it is
how you find out that the loop has no idea how many dimensions it is in, and that realization is
worth more than the three lines it costs.

## Common mistakes

- Returning `vector.length` from `magnitude`. It type-checks. It is wrong.
- Forgetting the square root and returning 25 for `[3, 4]`. The checks use a 3-4-5 triangle
  precisely so this is obvious.
- Normalizing by dividing by the largest component instead of the magnitude. The result points
  the right way but is not a unit vector.
- Letting `normalize([0, 0])` return `[NaN, NaN]`.

## Vocabulary

- **vector**: a displacement; a move with size and direction
- **dimension**: how many components a vector has; `.length` in code
- **magnitude**: how far a vector carries you; `‖v‖`; `Math.hypot`
- **unit vector**: a vector of magnitude 1; pure direction
- **normalize**: scale a vector to magnitude 1 without changing its direction
