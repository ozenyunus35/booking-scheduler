import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n";
import { TR } from "@/lib/tr";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("Turkish interface", () => {
  it("has a translation for every literal passed to t()", () => {
    const keys = new Set<string>();
    for (const f of files("src")) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
      // t(cond ? "a" : "b", ...) picks between two literals.
      for (const m of src.matchAll(/\bt\([^()]*?\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
        keys.add(JSON.parse(`"${m[1]}"`));
        keys.add(JSON.parse(`"${m[2]}"`));
      }
    }
    const missing = [...keys].filter((k) => TR[k] === undefined);
    expect(missing).toEqual([]);
    expect(keys.size).toBeGreaterThan(200);
  });

  it("translates sentences built in code, keeping numbers and names", () => {
    expect(translate("tr", "Maya doesn't offer this service.")).toBe("Maya bu hizmeti vermiyor.");
    expect(translate("tr", "Every 15 min")).toBe("15 dakikada bir");
    expect(translate("tr", "Moved to {time} with {staff}.", { time: "10:30", staff: "Maya" })).toBe("Maya ile 10:30 saatine taşındı.");
  });
});

