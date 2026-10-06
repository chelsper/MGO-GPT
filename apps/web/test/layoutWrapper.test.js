// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  StaticRouter,
  Routes,
  Route,
  useParams,
  useLocation,
} from "react-router";
import { layoutWrapperPlugin } from "../plugins/layouts";

const root = "/__layout_wrapper_test__/app";
const transform = (route) => {
  const plugin = layoutWrapperPlugin({ srcRoots: [root] });
  return plugin.transform.call(
    { addWatchFile: vi.fn() },
    "",
    `${root}/${route}`,
  );
};

describe("layout wrapper router dependencies", () => {
  it("reads params and location from the app's router context", () => {
    function Probe() {
      const params = useParams();
      const location = useLocation();
      return createElement("span", null, `${params.id}:${location.pathname}`);
    }
    const output = renderToString(
      createElement(
        StaticRouter,
        { location: "/constituents/123" },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/constituents/:id",
            element: createElement(Probe),
          }),
        ),
      ),
    );
    expect(output).toContain("123:/constituents/123");
  });
  it("imports normal route hooks from the server's router package", async () => {
    const output = await transform("constituents/[id]/page.jsx");
    expect(output).toContain("import { useParams } from 'react-router';");
    expect(output).toContain("id={params.id}");
    expect(output).not.toContain("react-router-dom");
    expect(output).not.toContain("useLocation");
  });
  it("preserves catch-all location handling without the compatibility import", async () => {
    const output = await transform("files/[...path]/page.jsx");
    expect(output).toContain(
      "import { useParams, useLocation } from 'react-router';",
    );
    expect(output).toContain("const location = useLocation();");
    expect(output).toContain("path={location.pathname");
    expect(output).not.toContain("react-router-dom");
  });
  it("does not add router imports to static pages or rewrap original pages", async () => {
    expect(await transform("stewardship/page.jsx")).not.toContain(
      "react-router",
    );
    expect(
      await transform("constituents/[id]/page.jsx?noLayout.jsx"),
    ).toBeNull();
  });
});
