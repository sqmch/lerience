# ADR-016 — The app draws its own frame, but the OS keeps drawing the caption buttons

Date: 2026-08-12 · Status: accepted

## Decision

The window loses its native title bar and gains an app-drawn one, using the **overlay** form
rather than a fully frameless window:

- `titleBarStyle: "hidden"` plus `titleBarOverlay` on Windows. The app draws the bar's content
  (course identity, navigation); **Windows keeps drawing the minimise / maximise / close
  buttons** inside a reserved region at the end of the bar.
- The overlay's colours are theme-dependent, so `setTitleBarOverlay` is called whenever the
  resolved theme changes. A caption button that stays dark on a light window is the tell that
  this was bolted on.
- Bar content is draggable via `-webkit-app-region: drag`, and every interactive child opts back
  out with `no-drag`.
- The status bar at the bottom is ordinary app content, full-bleed and thin, not a page footer
  inside the content column.
- macOS, when it arrives, uses `titleBarStyle: "hiddenInset"` for the same bar with traffic
  lights; the bar's content is shared, its inset is not.

## Why

- The frame is the strongest signal that a window is an application. The audit named it exactly:
  with a default frame above our chrome, and a footer styled like a page footer below it, the
  dashboard read as a web page hosted in a window.
- Choosing the overlay over a fully frameless window keeps behaviour we would otherwise have to
  rebuild badly: Windows 11 Snap Layouts on maximise-button hover, correct maximise/restore and
  double-click semantics, and caption buttons that are accessible and hit-target-correct by
  construction. Hand-drawn controls look identical in a screenshot and cost all of that.
- The app needs the top-left of the window for course identity anyway. The audit found the
  current in-page "Courses / title" row weak precisely because it duplicated, below the native
  bar, what a title bar is for. One owned bar resolves that instead of stacking two.

## Rejected

Keeping the native frame with `autoHideMenuBar` (today's state): the app can never own the
identity area, and every surface inherits a dead native strip above its own chrome. A fully
frameless window with hand-drawn caption buttons (the first mock's form): it buys pixel control
over three glyphs and pays with Snap Layouts, native window semantics, and accessibility we would
have to re-implement. Custom in-window "chrome" while leaving the native bar visible: two title
bars, which is worse than either alone.

## Reopens if

- A design need collides with the overlay's reserved caption region — it is fixed-width and lives
  at the end of the bar, so a design wanting controls in that corner would force the frameless
  form and its costs.
- macOS packaging shows the two platforms' bars diverging enough that a shared bar component
  stops being honest.
