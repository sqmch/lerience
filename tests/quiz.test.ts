import { describe, expect, it } from "vitest";

import {
  addDays,
  applyGrade,
  countLegacyRescheduled,
  daysBetween,
  listDue,
  migrateBank,
  nextInterval,
  rescheduleItem,
  seedItem,
  serializeBank,
  todayISO,
} from "../src/shared/engine/quiz";
import type { GradeResult, QuizBank } from "../src/shared/engine/quiz";

function bankWithOneItem(): QuizBank {
  return {
    items: [
      {
        id: "01-retrieval",
        module: "01-foundations",
        question: "What makes retrieval durable?",
        interval: 3,
        due: "2026-08-05",
        history: [],
      },
    ],
  };
}

describe("date helpers", () => {
  it("formats the supplied local calendar date", () => {
    expect(todayISO(new Date(2026, 7, 5, 23, 59, 59))).toBe("2026-08-05");
  });

  it("treats a DST boundary as ordinary whole UTC days", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("crosses month and year boundaries without special cases", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("nextInterval", () => {
  const cases: {
    name: string;
    previous: number | undefined;
    result: GradeResult;
    expected: number;
  }[] = [
    {
      name: "fresh first correct rounds 2.5 up to the live-bank value of 3",
      previous: undefined,
      result: "correct",
      expected: 3,
    },
    { name: "correct floors at two", previous: 0, result: "correct", expected: 2 },
    { name: "partial resets to two", previous: 13, result: "partial", expected: 2 },
    { name: "wrong resets to one", previous: 13, result: "wrong", expected: 1 },
    { name: "tutored resets to one", previous: 13, result: "tutored", expected: 1 },
  ];

  it.each(cases)("$name", ({ previous, result, expected }) => {
    expect(nextInterval(previous, result)).toBe(expected);
  });

  it("matches the repeated-correct growth sequence", () => {
    let interval: number | undefined;
    const sequence: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      interval = nextInterval(interval, "correct");
      sequence.push(interval);
    }

    expect(sequence).toEqual([3, 8, 20, 50]);
  });
});

describe("applyGrade", () => {
  it("appends a grade without a note, returns the transition report, and stays pure", () => {
    const input = bankWithOneItem();
    const before = structuredClone(input);
    const result = applyGrade(input, "01-retrieval", "correct", "2026-08-05");

    expect(result).toEqual({
      bank: {
        items: [
          {
            id: "01-retrieval",
            module: "01-foundations",
            question: "What makes retrieval durable?",
            interval: 8,
            due: "2026-08-13",
            history: [{ date: "2026-08-05", result: "correct" }],
          },
        ],
      },
      report: {
        id: "01-retrieval",
        result: "correct",
        oldInterval: 3,
        newInterval: 8,
        oldDue: "2026-08-05",
        newDue: "2026-08-13",
      },
    });
    expect(input).toEqual(before);
  });

  it("includes a supplied note in the appended grade", () => {
    const result = applyGrade(
      bankWithOneItem(),
      "01-retrieval",
      "partial",
      "2026-08-05",
      "Needed one prompt.",
    );

    expect(result.bank.items[0]?.history).toEqual([
      { date: "2026-08-05", result: "partial", note: "Needed one prompt." },
    ]);
  });
});

describe("seedItem", () => {
  it("seeds tomorrow at interval one with empty history without mutating the input", () => {
    const input: QuizBank = { items: [] };
    const seeded = seedItem(
      input,
      "02-vector-store",
      "02-index-shape",
      "Why does index shape affect recall?",
      "2026-08-05",
    );

    expect(seeded).toEqual({
      items: [
        {
          id: "02-index-shape",
          module: "02-vector-store",
          question: "Why does index shape affect recall?",
          interval: 1,
          due: "2026-08-06",
          history: [],
        },
      ],
    });
    expect(input).toEqual({ items: [] });
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      seedItem(
        bankWithOneItem(),
        "02-vector-store",
        "01-retrieval",
        "A duplicate question",
        "2026-08-05",
      ),
    ).toThrowError('quiz item "01-retrieval" already exists');
  });
});

describe("rescheduleItem grades-vs-moves regression", () => {
  it("moves due-date bookkeeping into moves without touching interval or grade history", () => {
    const input = bankWithOneItem();
    const item = input.items[0];
    if (!item) throw new Error("fixture lost its quiz item");
    item.history.push({ date: "2026-08-01", result: "correct", note: "Clean recall." });
    const before = structuredClone(input);

    const rescheduled = rescheduleItem(
      input,
      "01-retrieval",
      "2026-08-10",
      "2026-08-05",
      "Learner is travelling.",
    );

    expect(rescheduled.items[0]).toEqual({
      ...before.items[0],
      due: "2026-08-10",
      moves: [
        {
          date: "2026-08-05",
          action: "rescheduled",
          to: "2026-08-10",
          note: "Learner is travelling.",
        },
      ],
    });
    expect(rescheduled.items[0]?.interval).toBe(3);
    expect(rescheduled.items[0]?.history).toEqual(before.items[0]?.history);
    expect(input).toEqual(before);
  });
});

describe("legacy migration", () => {
  const legacyBank = (): QuizBank => ({
    items: [
      {
        id: "00-memory",
        module: "00-orientation",
        question: "Where does durable memory live?",
        interval: 3,
        due: "2026-08-05",
        history: [
          { date: "2026-07-01", result: "correct" },
          { date: "2026-07-02", result: "rescheduled", note: "Away." },
          { date: "2026-07-03", result: "wrong" },
          { date: "2026-07-04", result: "rescheduled" },
          { date: "2026-07-05", result: "partial" },
        ],
        moves: [
          {
            date: "2026-06-30",
            action: "rescheduled",
            to: "2026-07-01",
            note: "Existing move.",
          },
        ],
      },
    ],
  });

  it("counts and relocates legacy bookkeeping while preserving grade order", () => {
    const input = legacyBank();
    const before = structuredClone(input);
    expect(countLegacyRescheduled(input)).toBe(2);

    const migrated = migrateBank(input);

    expect(migrated.moved).toBe(2);
    expect(migrated.bank.items[0]?.history).toEqual([
      { date: "2026-07-01", result: "correct" },
      { date: "2026-07-03", result: "wrong" },
      { date: "2026-07-05", result: "partial" },
    ]);
    expect(migrated.bank.items[0]?.moves).toEqual([
      {
        date: "2026-06-30",
        action: "rescheduled",
        to: "2026-07-01",
        note: "Existing move.",
      },
      { date: "2026-07-02", action: "rescheduled", note: "Away." },
      { date: "2026-07-04", action: "rescheduled" },
    ]);
    expect(countLegacyRescheduled(migrated.bank)).toBe(0);
    expect(input).toEqual(before);
  });

  it("is idempotent on a second pass", () => {
    const first = migrateBank(legacyBank());
    const second = migrateBank(first.bank);

    expect(second.moved).toBe(0);
    expect(second.bank).toEqual(first.bank);
  });
});

describe("listDue", () => {
  it("sorts most-overdue first, breaks due-date ties by id, and excludes future items", () => {
    const bank: QuizBank = {
      items: [
        {
          id: "z-tie",
          module: "01",
          question: "Z",
          interval: 1,
          due: "2026-08-03",
          history: [],
        },
        {
          id: "oldest",
          module: "01",
          question: "Oldest",
          interval: 1,
          due: "2026-08-01",
          history: [],
        },
        {
          id: "a-tie",
          module: "01",
          question: "A",
          interval: 1,
          due: "2026-08-03",
          history: [],
        },
        {
          id: "future",
          module: "01",
          question: "Future",
          interval: 1,
          due: "2026-08-06",
          history: [],
        },
      ],
    };

    expect(
      listDue(bank, "2026-08-05").map(({ item, overdueDays }) => [item.id, overdueDays]),
    ).toEqual([
      ["oldest", 4],
      ["a-tie", 2],
      ["z-tie", 2],
    ]);
  });
});

describe("serializeBank", () => {
  const bank: QuizBank = {
    items: [
      {
        id: "01-first",
        module: "01-foundations",
        question: "First question?",
        interval: 3,
        due: "2026-08-05",
        history: [{ date: "2026-08-01", result: "correct", note: "Solid." }],
        moves: [{ date: "2026-08-02", action: "rescheduled", to: "2026-08-05" }],
      },
      {
        id: "02-empty",
        module: "02-retrieval",
        question: "Second question?",
        interval: 1,
        due: "2026-08-06",
        history: [],
        moves: [],
      },
    ],
  };

  it("emits the exact byte-stable hand format", () => {
    const expected = `{
  "items": [
    {
      "id": "01-first",
      "module": "01-foundations",
      "question": "First question?",
      "interval": 3,
      "due": "2026-08-05",
      "history": [
        { "date": "2026-08-01", "result": "correct", "note": "Solid." }
      ],
      "moves": [
        { "date": "2026-08-02", "action": "rescheduled", "to": "2026-08-05" }
      ]
    },
    {
      "id": "02-empty",
      "module": "02-retrieval",
      "question": "Second question?",
      "interval": 1,
      "due": "2026-08-06",
      "history": [],
      "moves": []
    }
  ]
}
`;

    expect(serializeBank(bank)).toBe(expected);
  });

  it("round-trips through JSON without changing the bank", () => {
    expect(JSON.parse(serializeBank(bank))).toEqual(bank);
  });
});
