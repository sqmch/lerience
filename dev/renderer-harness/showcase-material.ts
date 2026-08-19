/* The finished modules' own material for the showcase.

   The harness fixture answers every lesson path with the same chapter, which
   is fine for probing the pane and wrong for a visitor walking the rail. The
   two finished modules get a short lesson and brief of their own here. All of
   it is purpose-authored synthetic course material; nothing was copied from a
   learner course or a provider transcript. */

import { readFixtureDoc } from "./course-fixture";

const LESSON_00 = `# Coordinates and displacement

A point on the map is a **position**: \`[2, 3]\` names one square. The
difference between two positions is a **displacement**: how far and which way
you moved. Both are written as a pair of numbers, which is exactly why people
mix them up.

## Same numbers, different question

| Written | Answers | Example |
| --- | --- | --- |
| \`[2, 3]\` as a position | "Where?" | the square two east, three north of the origin |
| \`[2, 3]\` as a displacement | "How did you move?" | two squares east, then three north, from anywhere |

Adding two positions means nothing. Adding a displacement to a position gives a
new position. Subtracting one position from another gives a displacement.

## Vocabulary

- position and origin
- displacement
- component
`;

const BRIEF_00 = `# Brief — move a marker

Complete two functions in \`scaffold/src/move.ts\`:

1. \`displace(position, displacement)\`
2. \`between(from, to)\`

The checks cover a move, a move back, and the zero displacement.

**Time budget:** about 45 minutes.
`;

const LESSON_01 = `# Vector length

A displacement has a size as well as a direction. Its **length** (or
**magnitude**) is the straight-line distance it covers, and it comes from a
right triangle: the two components are the legs, the displacement is the
hypotenuse.

## From components to a number

\`\`\`ts
function magnitude(vector: number[]): number {
  return Math.hypot(...vector);
}
\`\`\`

\`Math.hypot\` squares each component, adds them, and takes the square root. It
handles any number of components, which matters later: the same formula gives
the length of a 384-number embedding.

## Vocabulary

- magnitude
- hypotenuse
- unit vector
`;

const BRIEF_01 = `# Brief — measure a route segment

Complete \`magnitude(vector)\` and \`normalize(vector)\` in
\`scaffold/src/length.ts\`. The checks cover a 3-4-5 triangle, a vector along one
axis, and the unit length of a normalized vector.

**Time budget:** about one hour.
`;

export function readShowcaseDoc(path: string): string | null {
  if (path.startsWith("curriculum/00-")) {
    if (path.endsWith("/LESSON.md")) return LESSON_00;
    if (path.endsWith("/BRIEF.md")) return BRIEF_00;
    return null;
  }
  if (path.startsWith("curriculum/01-")) {
    if (path.endsWith("/LESSON.md")) return LESSON_01;
    if (path.endsWith("/BRIEF.md")) return BRIEF_01;
    return null;
  }
  return readFixtureDoc(path);
}
