import type { HTMLElement } from "node-html-parser";

/** Boards pad their markup with newlines and tabs, so every field is collapsed on the way in. */
export function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** The cleaned text of an element the markup may not contain at all. */
export function elementText(element: HTMLElement | null | undefined): string {
  return cleanText(element?.text);
}

/** An optional `RawVacancy` field is absent, never an empty string. */
export function optionalText(value: string | undefined): string | undefined {
  return cleanText(value) || undefined;
}
