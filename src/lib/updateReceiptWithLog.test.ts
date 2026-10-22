import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// update_receipt_with_log runs in Postgres, out of the suite's reach, so this
// reads its definition from the migration — the way ProductDetail.test.tsx
// reads index.css.
const migration = readFileSync(
  join(__dirname, "../../supabase/migrations/20261010000001_stores.sql"),
  "utf8"
);

function functionBody(name: string): string {
  const start = migration.indexOf(`function public.${name}(`);
  const bodyStart = migration.indexOf("$$", start);
  return migration.slice(bodyStart, migration.indexOf("$$;", bodyStart));
}

describe("update_receipt_with_log", () => {
  // Issue 29: its error reaches the page as display text (errorMessage), so
  // it says what went wrong without putting the receipt's id in front of
  // the user.
  it("raises its error without the receipt's id", () => {
    const raises = functionBody("update_receipt_with_log").match(/raise exception[^;]*;/g) ?? [];

    expect(raises).not.toEqual([]);
    for (const raise of raises) {
      expect(raise).not.toMatch(/p_receipt_id/);
      expect(raise).not.toMatch(/%/);
    }
  });
});
