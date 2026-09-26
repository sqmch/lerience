import { useState } from "react";
import { LabOverlay } from "../../src/renderer/src/course/lab-overlay";
import { labFixtureCourse } from "./lab-fixture";

export function LabFixture(): React.JSX.Element {
  const [course, setCourse] = useState(labFixtureCourse);
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [contextModuleId, setContextModuleId] = useState("00-position");
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open lab fixture</button>
      <button onClick={() => setCourse(labFixtureCourse())}>Refresh lab fixture</button>
      {course.modules.map((module) => (
        <button key={module.id} onClick={() => setContextModuleId(module.id)}>
          Context: {module.title}
        </button>
      ))}
      <LabOverlay
        open={open}
        onOpenChange={setOpen}
        course={course}
        contextModuleId={contextModuleId}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
      />
    </div>
  );
}
