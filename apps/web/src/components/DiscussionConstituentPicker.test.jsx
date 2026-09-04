import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DiscussionConstituentPicker from "./DiscussionConstituentPicker";

function Picker() {
  const [selected, setSelected] = useState([]);
  return (
    <DiscussionConstituentPicker
      selected={selected}
      onChange={setSelected}
    />
  );
}

describe("DiscussionConstituentPicker", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const query = new URL(String(url), "https://example.com").searchParams.get("q");
        const result = query === "Anna"
          ? { blackbaudConstituentId: "242718", name: "Anna Arribas", lookupId: "702226" }
          : { blackbaudConstituentId: "227337", name: "Rafael Arribas", lookupId: "702227" };
        return {
          ok: true,
          json: async () => ({ results: [result] }),
        };
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("searches NXT and adds and removes multiple constituent topics", async () => {
    render(<Picker />);
    const search = screen.getByLabelText(/Constituents to discuss/);

    fireEvent.change(search, { target: { value: "Anna" } });
    fireEvent.click(await screen.findByRole("button", { name: /Anna Arribas/ }));
    expect(screen.getByRole("button", { name: "Remove Anna Arribas" })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Rafael" } });
    fireEvent.click(await screen.findByRole("button", { name: /Rafael Arribas/ }));
    expect(screen.getByRole("button", { name: "Remove Rafael Arribas" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Anna Arribas" }));
    expect(screen.queryByRole("button", { name: "Remove Anna Arribas" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Rafael Arribas" })).toBeInTheDocument();
  });

  it("keeps a prospect workspace's primary constituent anchored", () => {
    render(
      <DiscussionConstituentPicker
        selected={[
          {
            blackbaudConstituentId: "242718",
            name: "Anna Arribas",
            isPrimaryAnchor: true,
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Anna Arribas is the primary prospect" }),
    ).toBeDisabled();
    expect(screen.getByText("Prospect")).toBeInTheDocument();
  });
});
