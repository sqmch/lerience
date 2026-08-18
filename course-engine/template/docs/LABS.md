# Course visualizations

Lerience is a permanent safe stage for two kinds of course-authored teaching tools:

- **Stock labs** are polished interactives shipped by the Desktop app. A module claims one by
  carrying its id as a key in `lab.json`. The canonical ids and display metadata live in
  `stock-labs.json`.
- **Custom visuals** are self-contained HTML files under a module's `visuals/` directory and
  declared in `lab.json`. Lerience renders them in a null-origin, no-network sandbox with no
  filesystem or application bridge.

A course with no claims shows no Lab affordance. Visuals own no durable state and must remain
supplementary: use one only when a picture materially teaches the module's concept.

## Module contract

```jsonc
{
  "provenance": "tutor-generated",
  "focus": "the live misconception this picture should target",
  "focusLab": "chunking",
  "chunking": {
    "text": "The example from this module's lesson",
    "size": 5,
    "overlap": 0
  },
  "visuals": [
    {
      "file": "event-loop.html",
      "title": "The event loop, animated",
      "blurb": "What the learner should notice"
    }
  ]
}
```

All stock-lab configuration fields are optional and fall back to neutral defaults. Custom HTML
must use inline CSS and JavaScript only: no remote URLs, network APIs, or relative assets. Embed a
declared visual in `LESSON.md` where it belongs with a `visual` fence:

````markdown
```visual
{ "file": "event-loop.html", "height": 420, "title": "The event loop" }
```
````

At module generation, derive the picture from the lesson and brief so its examples and language
agree. During a session, adapting `focus`, presets, labels, or a custom visual to a specific
misconception is ordinary course work.
