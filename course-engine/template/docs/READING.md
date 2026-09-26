# Saved Lesson passages

New courses advertise `passage-marks-v1` in `reading-capability.json`. The engine writer
`scripts/reading.mjs` owns portable `tutor/reading-marks.json`; the app has no private copy.
Do not create this capability or record in an older course as part of ordinary teaching.

Marks belong to the learner. Preserve them while editing teaching material. They are not
requests for explanation, evidence of confusion or understanding, completion, quiz answers,
or instructions to start work. The tutor must not silently create, rewrite, relocate or
remove them. Lesson edits may leave unmatched quotes, which remain readable with saved context.

The canonical writer takes JSON on stdin:

```text
node scripts/reading.mjs <course-root>
```

`read` takes `moduleId` or null and returns the course-wide marks plus conservative current
matches. `add` takes a UUID, expected record revision, module ID, source SHA-256, extraction
version, paragraph index, heading, paragraph text, UTF-16 start/end and quote. The writer
verifies all source bindings. `remove` takes ID, expected record revision and current module.
Retry an uncertain add with exactly the same ID and payload; do not invent another ID.

The schema is `docs/schema/reading-marks.schema.json`. Extraction `marked18-prose-v1` projects
top-level prose with Marked 18.0.9. Its pinned MIT source and license live in `scripts/vendor/`.
Same-source matches require exact paragraph/index/range; changed source requires a unique
full paragraph and heading. All other states retain the quote without a target.

Limits: 200 marks, 1 MiB record, 256 KiB Lesson, 16,000 UTF-16 units per paragraph/quote,
2,000 units of heading, 64,000 request characters. Bounds refuse a new mutation; they never
truncate saved text. Malformed/unknown records and conflicts remain untouched. Cooperative
writers serialize with an exclusive lock and atomic replacement; external edits must reconcile
explicitly. The writer changes no lesson, progress, quiz or assessment file.
