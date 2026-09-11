# Potential settings

Status: living candidate list, started 2026-08-14

Lerience does not have a Settings surface yet. That is deliberate: preferences should live at
the point of use until enough genuinely revisitable choices exist to justify a coherent place.

Promote this list into a Settings surface when there are at least three choices that learners
are likely to revisit and that cannot be edited more naturally where their effect is visible.

## Existing preferences with direct controls

| Preference | Current home | Notes |
| --- | --- | --- |
| Theme: system / light / dark | App-shell theme control | Persisted app-wide; a Settings page would only duplicate it today. |
| Course-workspace pane widths | Directly draggable separators | Persisted app-wide; direct manipulation is the better control. |
| Preferred tutor provider | M4.5 tutor connection surface | Persist the learner's explicit choice; switch only between sessions. |
| Default editor | The "Open in editor" control's menu, beside Run checks (ADR-034) | Persisted app-wide; chosen where its effect is visible — the button is relabelled with the editor's name. |

## Candidates

| Candidate | Why it may earn a setting | Add when |
| --- | --- | --- |
| Default course parent folder | Repeated course creators may not want `~/Lerience` | The per-creation folder picker becomes recurring friction. |
| Update channel | Stable/beta choice may matter after auto-update exists | M5 defines channels and there is a real second channel. |
| Reduced motion override | OS preference should remain the default | Learners ask for an app override the OS setting cannot express. |
| Reading size/density | Long-form course material may need accessibility tuning | Evidence shows browser/OS scaling is insufficient. |

## Deliberately not settings

- Provider credentials, credential locations, login/logout, or API keys. Providers own auth.
- App-wide model, reasoning effort, autonomy, or access defaults. ADR-040 remembers the learner's
  explicit choices per course, at the point of use, and shows them on the session bar; a global
  default would re-create what ADR-004 forbids.
- Course-derived facts such as title, progress, current module, or due count.
- Per-course pane widths; window arrangement is app-wide under ADR-019.
