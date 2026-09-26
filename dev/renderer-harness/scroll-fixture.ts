/** Purpose-authored prose with enough height to exercise both conversation
 * viewports. The disclosure supplies late layout growth without a model turn. */
export const SCROLL_REPLY =
  Array.from(
    { length: 18 },
    (_, index) =>
      `### Reading ${String(index + 1)}\n\nThis synthetic reading follows a weather sensor through validation. Keep the original value visible, check its units, and explain why a missing measurement differs from zero. The next paragraph continues the same example so a reader can scroll a small distance while the tutor writes.`,
  ).join("\n\n") +
  `

<details><summary>Expand synthetic rich content</summary>

| Reading | Temperature | Result |
| --- | --- | --- |
${Array.from({ length: 24 }, (_, index) => `| ${String(index + 1)} | 18 C | Accepted |`).join("\n")}

</details>
`;

export const SCROLL_CHUNK = `

### Another streamed reading

The next synthetic measurement arrives with a timestamp and explicit units. Preserve the original value while checking each field. This paragraph adds enough wrapped lines to grow the transcript in both conversation layouts.

\`\`\`js
const reading = { temperature: 18, unit: "C" };
console.log(reading.temperature);
\`\`\`
`;
