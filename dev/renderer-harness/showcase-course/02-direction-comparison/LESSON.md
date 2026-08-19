# Comparing directions on a map

You can now say how far a move carries you. This chapter is about _which way_, and specifically
about a question that comes up everywhere from route planning to search engines: given two moves,
how much do they point the same way? The answer is one number between −1 and 1, it is called
cosine similarity, and you will build it from two pieces you already half-own.

## The question

Two walkers leave the town hall. One walks `[3, 4]`. The other walks `[6, 8]`. They take
different-sized steps, and the second ends up twice as far away, but anyone watching would say
they went _the same way_. A third walker heads `[4, -3]`, off at a right angle. A fourth goes
`[-3, -4]`, straight back the way the first one came.

We want a score that says "same way" for the first pair, "unrelated" for the right angle, and
"opposite" for the last, and that does not care about step size at all. Length was module 01's
business; this score has to be blind to it.

## Piece one: the dot product

The **dot product** of two vectors multiplies them component by component and adds the results
up:

```ts
function dot(left: number[], right: number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += left[index] * right[index];
  }
  return sum;
}

dot([3, 4], [6, 8]); // 3·6 + 4·8 = 18 + 32 = 50
dot([3, 4], [4, -3]); // 12 − 12 = 0
dot([3, 4], [-3, -4]); // −9 − 16 = −25
```

Read those three results as a story. When the vectors agree on an axis, that axis contributes a
positive number. When they disagree, it contributes a negative one. Agreement on both axes gives a
big positive total; disagreement on both gives a big negative one; and a right angle is the case
where the agreements and disagreements cancel to exactly zero. The dot product is a measure of
_agreement_.

It is not yet the score we want, because it also grows with length. `dot([3, 4], [6, 8])` is 50,
but `dot([3, 4], [3, 4])` is 25, and both pairs point the same way. The dot product is agreement
weighted by size.

## Piece two: divide the size out

Module 01 taught you to strip size from a vector by dividing by its magnitude. Do that to both
vectors and the dot product of the results is the score we want:

```text
cosine(a, b) = dot(a, b) / (‖a‖ · ‖b‖)
```

It is called **cosine similarity** because the number is the cosine of the angle between the two
vectors. You do not need trigonometry to use it; you need to know three landmarks.

| Pair                 | Geometric relationship | dot | ‖a‖ · ‖b‖ | Cosine similarity |
| -------------------- | ---------------------- | --- | --------- | ----------------- |
| `[3, 4]`, `[6, 8]`   | same direction         | 50  | 5 · 10    | `1`               |
| `[3, 4]`, `[4, -3]`  | right angle            | 0   | 5 · 5     | `0`               |
| `[3, 4]`, `[-3, -4]` | opposite directions    | −25 | 5 · 5     | `-1`              |
| `[1, 0]`, `[1, 1]`   | 45° apart              | 1   | 1 · 1.41  | `0.71`            |

Everything lands between −1 and 1. `1` is "identical direction", `0` is "unrelated", `-1` is
"opposite", and the values in between say how close. Step size has vanished: `[3, 4]` against
`[6, 8]` scores exactly the same as `[3, 4]` against `[3, 4]`.

## The calculation

Put the pieces together. The dot product is the numerator; the two magnitudes, multiplied, are
the denominator:

```ts
function cosineSimilarity(left: number[], right: number[]): number {
  const agreement = dot(left, right);
  const leftLength = magnitude(left);
  const rightLength = magnitude(right);
  return agreement / (leftLength * rightLength);
}
```

Three lines, and the first two are module 00 and module 01. That is not a coincidence; the course
was built so that this module is assembly.

## The boundary worth naming

There is one input this formula cannot handle, and it is the same one `normalize` could not. A
zero vector has magnitude 0, so for `cosineSimilarity([0, 0], anything)` the denominator is 0 and
the division returns `NaN`.

That is the formula being honest: the zero vector has no direction, so "how much does it point
the same way as B" has no answer. A function still has to do _something_ when asked. It can
throw, which says "you asked a question with no answer". It can return 0, which says "treat no
direction as unrelated to everything". It can return a documented sentinel. Production code
picks one and writes it down. What it must not do is let `NaN` leak out and turn every downstream
average into `NaN` too, which is how this bug is usually discovered, several files away from where
it happened.

The brief asks you to decide. The checks will accept a sensible decision and reject an accidental
one.

## A worked example

A library catalogue describes each book with a two-number "topic vector": how much it is about
history, and how much it is about cooking. A reader liked a book scored `[4, 1]`. Which of these is
the best next recommendation?

```ts
const liked = [4, 1];
const shelf = {
  romanEmpire: [8, 2],
  breadBaking: [1, 5],
  medievalFeasts: [3, 3],
};
```

Work each one through the formula:

1. **Roman Empire.** `dot = 32 + 2 = 34`. Magnitudes are √17 ≈ 4.12 and √68 ≈ 8.25, product
   ≈ 34.0. Cosine ≈ `1.0`. It is `[4, 1]` doubled: the same topic mix, a longer book.
2. **Bread baking.** `dot = 4 + 5 = 9`. Magnitudes √17 ≈ 4.12 and √26 ≈ 5.10, product ≈ 21.0.
   Cosine ≈ `0.43`. Some overlap, but it leans the other way.
3. **Medieval feasts.** `dot = 12 + 3 = 15`. Magnitudes √17 ≈ 4.12 and √18 ≈ 4.24, product
   ≈ 17.5. Cosine ≈ `0.86`. Close, and a bit more cooking than the reader's usual.

Rank by cosine: Roman Empire, then Medieval feasts, then Bread baking. Notice that if you had
ranked by the dot product alone, Roman Empire would still win but for the wrong reason: it is
simply the longest vector. A very long book about bread, `[2, 20]`, would have `dot = 28` and beat
Medieval feasts on raw agreement while being a much worse match. Dividing the size out is what
makes the score mean "similar", not "big".

Two numbers per book is a toy. Real catalogues, and real search engines, use hundreds of numbers
per item, and the code above does not change by a character. That is the reason this course has
been so insistent about arrays and loops that never mention "2".

## Why it is built this way

The brief asks for three functions, `magnitude`, `dot`, and `cosineSimilarity`, even though the
last one is the only one with a new idea in it. `dot` is asked for on its own because module 04
will use it alone, for projection: the dot product of a vector with a unit vector is how far the
vector goes _along_ that direction, which is the piece you need to answer "how far north did the
route go in total". Build the pieces once, named, and the later modules are short.

## Common mistakes

- Summing the components of one vector instead of multiplying across the two. `dot([3, 4], ...)`
  is not 7.
- Dividing by the sum of the magnitudes instead of the product. The score leaves the −1 to 1
  range and the checks notice.
- Normalizing both vectors first and then also dividing by the magnitudes. Harmless in theory,
  but with the zero vector it divides by zero twice, and it doubles the rounding error.
- Returning `NaN` for the zero vector by not thinking about it.

## Vocabulary

- **dot product**: component-wise multiply and add; agreement weighted by size
- **cosine similarity**: the dot product with size divided out; −1 to 1
- **right angle**: dot product 0; cosine 0; "unrelated"
- **zero-vector boundary**: no direction, so no cosine; decide what the function does
