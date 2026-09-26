import { useState } from "react";
import { CourseView } from "../../src/renderer/src/course/course-view";
import { Menu } from "../../src/renderer/src/components/menu";
import { READING_COURSE } from "./reading-material";
import { READING_REVISIONS, type ReadingRevision } from "./reading-state";
import { readingPreviewStore } from "./reading-store";
export type ReadingTutor = "ready" | "busy" | "unavailable";
export const readingBridge: { setTutor: (state: ReadingTutor) => void } = {
  setTutor: () => undefined,
};
export function ReadingFixture(): React.JSX.Element {
  const requested = new URLSearchParams(window.location.search).get("reading");
  const initial = READING_REVISIONS.find((entry) => entry === requested) ?? "original";
  const [revision, setRevision] = useState<ReadingRevision>(initial);
  const [tutor, setTutor] = useState<ReadingTutor>("ready");
  return (
    <>
      <CourseView course={READING_COURSE} onLeaveCourse={() => undefined} />
      <div className="bg-surface-raised border-line text-ink-dim fixed bottom-8 left-3 z-10 flex max-w-(--container-read) flex-wrap items-center gap-1 rounded-lg border px-3 py-1 text-2xs">
        <span>Reading preview · memory only</span>
        <Menu
          label="Lesson version"
          value={revision}
          options={READING_REVISIONS.map((value) => ({ value, label: value }))}
          onChange={(value) => {
            setRevision(value);
            readingPreviewStore.setRevision(value);
          }}
        />
        <Menu<ReadingTutor>
          label="Preview tutor state"
          value={tutor}
          options={["ready", "busy", "unavailable"].map((value) => ({
            value: value as ReadingTutor,
            label: value,
          }))}
          onChange={(value) => {
            setTutor(value);
            readingBridge.setTutor(value);
          }}
        />
      </div>
    </>
  );
}
