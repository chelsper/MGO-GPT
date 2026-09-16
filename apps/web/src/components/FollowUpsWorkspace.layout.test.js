// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { layoutWrapperPlugin } from "../../plugins/layouts";

it("wraps each follow-up route once without wrapping the shared component again", async () => {
  const plugin = layoutWrapperPlugin();
  const context = { addWatchFile: vi.fn() };
  for (const route of ["follow-ups", "team-discussion"]) {
    const path = fileURLToPath(new URL(`../app/${route}/page.jsx`, import.meta.url));
    const source = readFileSync(path, "utf8");
    expect(source).toContain('from "@/components/FollowUpsWorkspace"');
    expect(source).not.toMatch(/from ["'][^"']*\/page["']/);
    const transformed = await plugin.transform.call(context, source, path);
    expect(transformed.match(/<Layout\d>/g)).toHaveLength(1);
  }
  const componentPath = fileURLToPath(new URL("./FollowUpsWorkspace.jsx", import.meta.url));
  expect(await plugin.transform.call(context, readFileSync(componentPath, "utf8"), componentPath)).toBeNull();
});
