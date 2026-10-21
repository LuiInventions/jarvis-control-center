import { describe, expect, it } from "vitest";
import {
  buildReviewContext,
  parseReviewResult,
  type ReviewItem,
} from "../session-review";

const item = (over: Partial<ReviewItem>): ReviewItem => ({
  id: "c_1",
  number: 1,
  projectName: "demo",
  status: "running",
  prompt: "add dark mode",
  output: "working on it",
  ...over,
});

describe("buildReviewContext", () => {
  it("numbers sessions ascending and includes project, status, prompt and output", () => {
    const ctx = buildReviewContext([
      item({ id: "b", number: 2, projectName: "two", output: "done two" }),
      item({ id: "a", number: 1, projectName: "one", output: "done one" }),
    ]);
    // sorted by number regardless of input order
    expect(ctx.indexOf("#1 · one")).toBeLessThan(ctx.indexOf("#2 · two"));
    expect(ctx).toContain("[running]");
    expect(ctx).toContain("Task: add dark mode");
    expect(ctx).toContain("done one");
    expect(ctx).toContain("done two");
  });

  it("handles empty prompt and empty output with placeholders", () => {
    const ctx = buildReviewContext([item({ prompt: "  ", output: "" })]);
    expect(ctx).toContain("(no prompt / interactive)");
    expect(ctx).toContain("(no output)");
  });

  it("returns a marker for an empty list", () => {
    expect(buildReviewContext([])).toBe("(no sessions)");
  });
});

describe("parseReviewResult", () => {
  it("parses a clean JSON object", () => {
    const r = parseReviewResult('{"markdown":"# Report","speech":"Alles gut."}');
    expect(r).toEqual({ markdown: "# Report", speech: "Alles gut." });
  });

  it("strips ```json fences before parsing", () => {
    const r = parseReviewResult('```json\n{"markdown":"x","speech":"y"}\n```');
    expect(r).toEqual({ markdown: "x", speech: "y" });
  });

  it("falls back to raw text as markdown when not valid JSON", () => {
    const r = parseReviewResult("just some text");
    expect(r.markdown).toBe("just some text");
    expect(r.speech.length).toBeGreaterThan(0);
  });
});
