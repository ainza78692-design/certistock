import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";

const helperPath = join(process.cwd(), "supabase", "functions", "extract-tc", "helpers.ts");

const describeIfHelpersExist = existsSync(helperPath) ? describe : describe.skip;

describeIfHelpersExist("extract-tc helpers", () => {
  it("requires the legacy Supabase extract-tc helper module fixtures", async () => {
    const legacyModule = "../../supabase/functions/extract-tc/helpers";
    await import(/* @vite-ignore */ legacyModule);
  });
});

if (!existsSync(helperPath)) {
  describe.skip("extract-tc helpers", () => {
    it("skipped because supabase/functions/extract-tc/helpers.ts is not present in this local PostgreSQL package", () => {});
  });
}
