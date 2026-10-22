import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import QueryColumnMapper from "./QueryColumnMapper";
import {
  CONSTITUENT_LETTER_COLUMNS,
  CONSTITUENT_LETTER_LABELS,
} from "@/utils/societyLetters";
afterEach(() => vi.restoreAllMocks());
it("loads actual field names on request and applies only explicitly accepted suggestions", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      queryId: "31043",
      fields: ["Main ID", "Spouse ID", "Greeting"],
      suggestedColumns: { constituentId: "Main ID", spouseId: "Spouse ID" },
    }),
  );
  function Editor() {
    const [columns, setColumns] = useState(CONSTITUENT_LETTER_COLUMNS);
    return (
      <QueryColumnMapper
        queryId="31043"
        columns={columns}
        labels={CONSTITUENT_LETTER_LABELS}
        onChange={setColumns}
      />
    );
  }
  render(<Editor />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" }));
  await screen.findByRole("status");
  expect(screen.getByLabelText("Constituent system record ID")).toHaveValue(
    "System Record ID",
  );
  expect(screen.getByLabelText("Constituent system record ID")).toBeInvalid();
  fireEvent.click(
    screen.getByRole("button", { name: "Use recognized fields" }),
  );
  expect(screen.getByLabelText("Constituent system record ID")).toHaveValue(
    "Main ID",
  );
  expect(screen.getByLabelText("Constituent system record ID")).toBeValid();
  expect(
    screen.getByLabelText("Preferred street line 2 (optional)"),
  ).toHaveValue("");
  expect(
    screen.getByLabelText("Preferred street line 2 (optional)"),
  ).toBeValid();
  expect(screen.getByLabelText("Preferred street line 1")).toBeInvalid();
  fireEvent.change(screen.getByLabelText("Salutation"), {
    target: { value: "Greeting" },
  });
  expect(screen.getByLabelText("Salutation")).toHaveValue("Greeting");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    action: "inspect_query",
    queryId: "31043",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("ignores metadata that returns after the query ID changes", async () => {
  let finish;
  vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const props = {
    columns: CONSTITUENT_LETTER_COLUMNS,
    labels: CONSTITUENT_LETTER_LABELS,
    onChange: vi.fn(),
  };
  const view = render(<QueryColumnMapper {...props} queryId="1" />);
  fireEvent.click(screen.getByRole("button", { name: "Load query fields" }));
  view.rerender(<QueryColumnMapper {...props} queryId="2" />);
  finish(
    Response.json({ queryId: "1", fields: ["Old ID"], suggestedColumns: {} }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Load query fields" }),
    ).toBeEnabled(),
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(props.onChange).not.toHaveBeenCalled();
});
