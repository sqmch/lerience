import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const TAR_BLOCK_SIZE = 512;
const SAFE_ARCHIVE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export async function createCorrespondingSourceArchive(options) {
  const entries = [
    ...options.sourceFileNames.map((fileName) => ({
      fileName,
      filePath: path.join(options.sourceDirectory, fileName),
    })),
    {
      fileName: "THIRD-PARTY-NOTICES.md",
      filePath: options.noticesPath,
    },
  ].sort((left, right) => left.fileName.localeCompare(right.fileName));

  if (
    new Set(entries.map((entry) => entry.fileName)).size !== entries.length ||
    entries.some((entry) => !SAFE_ARCHIVE_NAME.test(entry.fileName))
  ) {
    throw new Error("The corresponding-source archive contains an unsafe or duplicate filename.");
  }

  const chunks = [];
  for (const entry of entries) {
    const contents = await readFile(path.resolve(entry.filePath));
    if (contents.length === 0) {
      throw new Error(`${entry.fileName} is empty.`);
    }
    chunks.push(createHeader(entry.fileName, contents.length), contents);
    const paddingLength = (TAR_BLOCK_SIZE - (contents.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
    if (paddingLength > 0) chunks.push(Buffer.alloc(paddingLength));
  }
  chunks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2));

  return gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
}

function createHeader(fileName, size) {
  const header = Buffer.alloc(TAR_BLOCK_SIZE);
  writeText(header, 0, 100, fileName);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeText(header, 156, 1, "0");
  writeText(header, 257, 6, "ustar\0");
  writeText(header, 263, 2, "00");
  const checksum = header.reduce((total, byte) => total + byte, 0);
  writeText(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function writeText(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "ascii");
  if (bytes.length > length) throw new Error(`Archive field is too long: ${value}`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const encoded = `${value.toString(8).padStart(length - 1, "0")}\0`;
  writeText(buffer, offset, length, encoded);
}
