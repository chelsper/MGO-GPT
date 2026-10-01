import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
vi.mock("@/utils/stewardshipPhoto", async original => ({ ...await original(), prepareGiftPhoto: vi.fn() }));
import { prepareGiftPhoto } from "@/utils/stewardshipPhoto";
import Editor from "./StewardshipGiftPhotoEditor";
import { GiftPhotoImage } from "./StewardshipGiftPhoto";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVh0AAAAASUVORK5CYII=";
const item = { id: "1", has_photo: true, photo_version: 1, photo_alt: "Green blanket" };
const change = vi.fn(), busy = vi.fn();
function Harness({ saved = item }) {
  const [value, setValue] = useState();
  return <Editor item={saved} value={value} onChange={next => { change(next); setValue(next); }} onBusyChange={busy} />;
}
beforeEach(() => { vi.clearAllMocks(); prepareGiftPhoto.mockResolvedValue(png); });
const upload = label => fireEvent.change(screen.getByLabelText(label), { target: { files: [new File(["image"], "gift.png", { type: "image/png" })] } });
it("previews a replacement locally and preserves its description", async () => {
  render(<Harness />); upload("Replace photo");
  await waitFor(() => expect(change).toHaveBeenCalledWith({ operation: "replace", dataUrl: png, alt: "Green blanket" }));
  expect(screen.getByRole("img")).toHaveAttribute("src", png);
  fireEvent.change(screen.getByLabelText(/Photo description/), { target: { value: "A soft blanket" } });
  expect(change).toHaveBeenLastCalledWith({ operation: "replace", dataUrl: png, alt: "A soft blanket" });
  fireEvent.click(screen.getByRole("button", { name: "Undo photo changes" }));
  expect(screen.getByRole("img")).toHaveAttribute("src", "/api/stewardship/inventory/photo?id=1&v=1");
});
it("supports description edits, removal, and undo without uploading again", () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText(/Photo description/), { target: { value: "Green with JU logo" } });
  expect(change).toHaveBeenLastCalledWith({ operation: "describe", alt: "Green with JU logo" });
  fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
  expect(change).toHaveBeenLastCalledWith({ operation: "remove" });
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Undo photo changes" }));
  expect(screen.getByRole("img")).toBeVisible();
  expect(prepareGiftPhoto).not.toHaveBeenCalled();
});
it("requires a description for a new photo and clears an unsaved photo cleanly", async () => {
  render(<Harness saved={null} />); upload("Choose photo");
  await screen.findByRole("img");
  expect(screen.getByLabelText(/Photo description/)).toBeRequired();
  expect(screen.getByLabelText(/Photo description/)).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
  expect(change).toHaveBeenLastCalledWith(undefined);
});
it("keeps the saved image when a file fails validation", async () => {
  prepareGiftPhoto.mockRejectedValue(new Error("Choose a PNG, JPEG, or WebP image."));
  render(<Harness />); upload("Replace photo");
  await screen.findByRole("alert");
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByRole("img")).toHaveAttribute("src", "/api/stewardship/inventory/photo?id=1&v=1");
  expect(busy).toHaveBeenLastCalledWith(false);
});
it("ignores an upload that finishes after its editor closes", async () => {
  let finish; prepareGiftPhoto.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<Harness />); upload("Replace photo"); view.unmount();
  finish(png); await Promise.resolve();
  expect(change).not.toHaveBeenCalled();
});
it("shows a graceful fallback and retries only when the image source changes", () => {
  const view = render(<GiftPhotoImage src="/photo/1" alt="Gift" />);
  fireEvent.error(screen.getByRole("img")); expect(screen.getByText("Photo unavailable")).toBeVisible();
  view.rerender(<GiftPhotoImage src="/photo/2" alt="Updated gift" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/photo/2");
});
