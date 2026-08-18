import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLedger, collectReleaseSources } from "../scripts/collect-release-sources.mjs";

const roots: string[] = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-release-sources-"));
  roots.push(root);
  const bytes = Buffer.from("reviewed corresponding source");
  const source = {
    component: "Fixture",
    version: "1.0.0",
    revision: "fixture-revision",
    fileName: "fixture-source.tar.gz",
    url: "https://github.com/example/fixture/archive/revision.tar.gz",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const ledgerPath = path.join(root, "ledger.json");
  fs.writeFileSync(ledgerPath, `${JSON.stringify({ schemaVersion: 1, sources: [source] })}\n`);
  return { root, bytes, source, ledgerPath, output: path.join(root, "output") };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("release corresponding-source collector", () => {
  it("downloads only ledger bytes and emits a self-describing verified source set", async () => {
    const value = fixture();
    const fetcher = vi.fn(async () => new Response(value.bytes));

    await collectReleaseSources({
      ledgerPath: value.ledgerPath,
      output: value.output,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(value.source.url, { redirect: "follow" });
    expect(fs.readFileSync(path.join(value.output, value.source.fileName))).toEqual(value.bytes);
    expect(fs.readFileSync(path.join(value.output, "SOURCE-SHA256SUMS"), "utf8")).toBe(
      `${value.source.sha256}  ${value.source.fileName}\n`,
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(value.output, "release-source-ledger.json"), "utf8")),
    ).toMatchObject({ schemaVersion: 1, sources: [{ component: "Fixture" }] });
  });

  it("fails closed on changed archive bytes and existing output", async () => {
    const value = fixture();
    await expect(
      collectReleaseSources({
        ledgerPath: value.ledgerPath,
        output: value.output,
        fetcher: async () => new Response("changed"),
      }),
    ).rejects.toThrow("unexpected size");

    fs.rmSync(value.output, { recursive: true, force: true });
    const fetcher = async () => new Response(value.bytes);
    await collectReleaseSources({ ledgerPath: value.ledgerPath, output: value.output, fetcher });
    await expect(
      collectReleaseSources({ ledgerPath: value.ledgerPath, output: value.output, fetcher }),
    ).rejects.toThrow(/exist/u);
  });

  it("rejects insecure and duplicate ledger entries", () => {
    const value = fixture();
    expect(() =>
      assertLedger({
        schemaVersion: 1,
        sources: [{ ...value.source, url: "http://github.com/example/source.tar.gz" }],
      }),
    ).toThrow("unsafe or duplicate");
    expect(() => assertLedger({ schemaVersion: 1, sources: [value.source, value.source] })).toThrow(
      "unsafe or duplicate",
    );
  });
});
