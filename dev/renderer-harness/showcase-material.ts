/* The showcase's course material.

   The harness fixture answers every lesson path with one short chapter, which
   is right for probing the pane and wrong for a visitor walking the rail. The
   showcase course carries full material for the three modules that exist so
   far: the two finished ones and the one in progress. Each module folder holds
   a LESSON.md written as a textbook chapter, a BRIEF.md with the task and its
   acceptance criteria, and a quiz.md of retrieval questions, in the course
   format the Course Engine documents. All of it is purpose-authored synthetic
   course material; nothing was copied from a learner course or a provider
   transcript. */

import LESSON_00 from "./showcase-course/00-coordinate-vocabulary/LESSON.md?raw";
import BRIEF_00 from "./showcase-course/00-coordinate-vocabulary/BRIEF.md?raw";
import QUIZ_00 from "./showcase-course/00-coordinate-vocabulary/quiz.md?raw";
import LESSON_01 from "./showcase-course/01-vector-length/LESSON.md?raw";
import BRIEF_01 from "./showcase-course/01-vector-length/BRIEF.md?raw";
import QUIZ_01 from "./showcase-course/01-vector-length/quiz.md?raw";
import LESSON_02 from "./showcase-course/02-direction-comparison/LESSON.md?raw";
import BRIEF_02 from "./showcase-course/02-direction-comparison/BRIEF.md?raw";
import QUIZ_02 from "./showcase-course/02-direction-comparison/quiz.md?raw";

const MATERIAL: Record<string, Record<string, string>> = {
  "00-coordinate-vocabulary": { "LESSON.md": LESSON_00, "BRIEF.md": BRIEF_00, "quiz.md": QUIZ_00 },
  "01-vector-length": { "LESSON.md": LESSON_01, "BRIEF.md": BRIEF_01, "quiz.md": QUIZ_01 },
  "02-direction-comparison": { "LESSON.md": LESSON_02, "BRIEF.md": BRIEF_02, "quiz.md": QUIZ_02 },
};

/** Answers a course-relative path such as `curriculum/01-vector-length/LESSON.md`. */
export function readShowcaseDoc(path: string): string | null {
  const match = /^curriculum\/([^/]+)\/([^/]+)$/.exec(path);
  if (match === null) return null;
  return MATERIAL[match[1] ?? ""]?.[match[2] ?? ""] ?? null;
}
