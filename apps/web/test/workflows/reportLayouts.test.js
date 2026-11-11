// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { layoutWrapperPlugin } from "../../plugins/layouts";

const root = path.resolve(import.meta.dirname, "../..");
const sharedPath = path.join(
  root,
  "src/app/reports/lists/ConstituentListView.jsx",
);
function imports(source, filename) {
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  return parsed.statements
    .filter(
      (node) => ts.isImportDeclaration(node) || ts.isExportDeclaration(node),
    )
    .map((node) => node.moduleSpecifier?.text)
    .filter(Boolean);
}
function resolveImport(specifier, filename) {
  return specifier.startsWith("@/")
    ? path.join(root, "src", specifier.slice(2))
    : path.resolve(path.dirname(filename), specifier);
}

it.each([
  "lists/[listKey]/page.jsx",
  "project-prospecting/[listKey]/page.jsx",
  "future-made-phase-ii/page.jsx",
])(
  "wraps %s once and shares content without importing another wrapped route",
  async (route) => {
    const filename = path.join(root, "src/app/reports", route);
    const source = readFileSync(filename, "utf8");
    const dependencies = imports(source, filename);
    expect(
      dependencies.filter((specifier) =>
        /\/page(?:\.[jt]sx?)?$/.test(specifier),
      ),
    ).toEqual([]);
    expect(
      dependencies.some(
        (specifier) =>
          `${resolveImport(specifier, filename)}.jsx` === sharedPath,
      ),
    ).toBe(true);

    const plugin = layoutWrapperPlugin({ srcRoots: [path.join(root, "src")] });
    const context = { addWatchFile: vi.fn() };
    const wrapper = await plugin.transform.call(context, source, filename);
    expect(
      imports(wrapper, filename).filter((specifier) =>
        specifier.endsWith("/layout.jsx"),
      ),
    ).toEqual([path.join(root, "src/app/layout.jsx")]);
    expect(imports(wrapper, filename)).toContain(`${filename}?noLayout.jsx`);
    expect(wrapper.match(/<Layout0>/g)).toHaveLength(1);

    const shared = readFileSync(sharedPath, "utf8");
    expect(await plugin.transform.call(context, shared, sharedPath)).toBeNull();
    expect(
      imports(shared, sharedPath).filter((specifier) =>
        /\/page(?:\.[jt]sx?)?$/.test(specifier),
      ),
    ).toEqual([]);
  },
);
