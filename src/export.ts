import { strToU8, zipSync } from "fflate";
import { get } from "idb-keyval";
import { imageSrc } from "./store";
import { STATUS, type Item } from "./types";

const HEADER = ["問題", "解答", "ステータス", "印", "作成日時", "問題の画像", "解答の画像"];

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function stamp(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Windows/macOS-safe file name. */
const safeName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "mnemo";

/** CSV with a UTF-8 BOM and CRLF line endings, so Excel opens Japanese text correctly. */
function toCsv(items: Item[], names?: Map<string, string>) {
  const list = (keys: string[] | null | undefined) => (names ? (keys ?? []).map((k) => names.get(k) ?? "").filter(Boolean).join(" ") : "");
  const rows = items.map((it) => [
    it.body,
    it.answer ?? "",
    STATUS[it.status]?.label ?? "",
    it.marked ? "あり" : "",
    stamp(it.createdAt),
    list(it.images),
    list(it.answerImages),
  ]);
  return "﻿" + [HEADER, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const extOf = (type: string) => ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" })[type] ?? "webp";

/** Oldest first, the order the cards were written in. */
const ordered = (items: Item[]) => [...items].sort((a, b) => a.createdAt - b.createdAt);

export function downloadCsv(name: string, items: Item[]) {
  save(new Blob([toCsv(ordered(items))], { type: "text/csv;charset=utf-8" }), `${safeName(name)}.csv`);
}

/** CSV plus every question/answer image, referenced from the CSV by file name. */
export async function downloadZip(name: string, items: Item[], onProgress?: (done: number, total: number) => void) {
  const sorted = ordered(items);
  const jobs: { key: string; path: string }[] = [];
  const names = new Map<string, string>();
  sorted.forEach((it, i) => {
    const n = String(i + 1).padStart(3, "0");
    const add = (keys: string[] | null | undefined, side: "q" | "a") =>
      (keys ?? []).forEach((key, j) => {
        if (names.has(key)) return; // an image shared by question and answer is stored once
        const path = `images/${n}-${side}${j + 1}`;
        names.set(key, path);
        jobs.push({ key, path });
      });
    add(it.images, "q");
    add(it.answerImages, "a");
  });

  const files: Record<string, Uint8Array> = {};
  let done = 0;
  for (const job of jobs) {
    // Unsynced images live only in IndexedDB until their memo uploads.
    const src = imageSrc(job.key);
    const res = src ? await fetch(src).catch(() => null) : null;
    const blob = res?.ok ? await res.blob() : await get<Blob>(`blob:${job.key}`).catch(() => undefined);
    if (blob) {
      const path = `${job.path}.${extOf(blob.type)}`;
      names.set(job.key, path);
      files[path] = new Uint8Array(await blob.arrayBuffer());
    } else {
      names.delete(job.key);
    }
    onProgress?.(++done, jobs.length);
  }
  files[`${safeName(name)}.csv`] = strToU8(toCsv(sorted, names));
  // Images are already compressed, so store them without deflating again.
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: k.endsWith(".csv") ? 6 : 0 }]])));
  save(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }), `${safeName(name)}.zip`);
}
