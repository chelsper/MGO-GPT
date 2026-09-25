import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SavedLetterPreview, { savedTemplateUrl } from "./SavedLetterPreview";

const { renderAsync } = vi.hoisted(() => ({ renderAsync: vi.fn() }));
vi.mock("docx-preview", () => ({ renderAsync }));
const template = {
  societyName: "President's Society",
  version: "a".repeat(64),
  filename: "saved.docx",
};
let fetchMock;
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
  });
  fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("Word bytes"));
  renderAsync.mockImplementation(async (_content, body) => {
    const text = body.ownerDocument.createElement("p");
    text.textContent = "Dear {salutation},";
    const link = body.ownerDocument.createElement("a");
    link.href = "https://example.org";
    body.append(text, link);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("saved letter preview", () => {
  it("fits embedded Word pages to the panel and disconnects its resize observer", async () => {
    let resize;
    const observe = vi.fn(),
      disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback) {
          resize = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    renderAsync.mockImplementation(async (_content, body) => {
      const page = body.ownerDocument.createElement("section");
      page.className = "docx";
      Object.defineProperty(page, "offsetWidth", { value: 800 });
      body.append(page);
    });
    const view = render(
      <SavedLetterPreview embedded template={template} onClose={vi.fn()} />,
    );
    const frame = screen.getByTitle("President's Society saved Word letter");
    Object.defineProperty(frame, "clientWidth", {
      configurable: true,
      value: 424,
    });
    fireEvent.load(frame);
    await waitFor(() => expect(frame).toHaveAttribute("aria-busy", "false"));
    expect(frame.contentDocument.body.style.zoom).toBe("0.5");
    expect(observe).toHaveBeenCalledWith(frame);
    Object.defineProperty(frame, "clientWidth", { value: 844 });
    resize();
    expect(frame.contentDocument.body.style.zoom).toBe("1");
    expect(fetchMock).toHaveBeenCalledOnce();
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("renders an on-demand fictional sample once and never marks failed loads as viewed", async () => {
    const onReady = vi.fn();
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Map the Word fields first." }, { status: 422 }),
    );
    const view = render(
      <SavedLetterPreview
        template={template}
        sample
        onReady={onReady}
        onClose={vi.fn()}
      />,
    );
    fireEvent.load(screen.getByTitle("President's Society sample letter"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Map the Word fields first.",
    );
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try preview again" }));
    await waitFor(() => expect(onReady).toHaveBeenCalledWith(template.version));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "preview_template_sample",
      templateVersion: template.version,
    });
    expect(screen.getByText("Sample only: fictional recipient")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    view.rerender(
      <SavedLetterPreview
        template={template}
        sample
        onReady={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(renderAsync).toHaveBeenCalledOnce();
  });
  it("renders an on-demand personalized draft without offering the unmerged template as a letter download", async () => {
    const draft = {
      name: "Alex Sample",
      request: {
        action: "preview_recipient_document",
        salutation: "Alex",
        householdId: "10",
        reviewToken: "current",
        templateVersion: template.version,
      },
    };
    render(
      <SavedLetterPreview
        template={template}
        draft={draft}
        onClose={vi.fn()}
      />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const frame = screen.getByTitle("Alex Sample personalized draft");
    fireEvent.load(frame);
    await waitFor(() => expect(renderAsync).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stewardship/society-letters",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(draft.request),
        cache: "no-store",
      }),
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Nothing is saved, sent, or marked complete/),
    ).toBeVisible();
  });
  it("loads only the saved version and renders in an isolated, non-networked frame", async () => {
    render(<SavedLetterPreview template={template} onClose={vi.fn()} />);
    const frame = screen.getByTitle("President's Society saved Word letter");
    fireEvent.load(frame);
    await waitFor(() => expect(frame).toHaveAttribute("aria-busy", "false"));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      savedTemplateUrl(template.version),
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    const [content, body, styles, options] = renderAsync.mock.calls[0];
    expect(new TextDecoder().decode(content)).toBe("Word bytes");
    expect(body.ownerDocument).toBe(frame.contentDocument);
    expect(styles.ownerDocument).toBe(frame.contentDocument);
    expect(options).toMatchObject({
      useBase64URL: true,
      renderAltChunks: false,
    });
    expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
    expect(frame.getAttribute("srcdoc")).toContain("connect-src 'none'");
    expect(frame.getAttribute("srcdoc")).toContain("script-src 'none'");
    expect(frame.contentDocument.body.textContent).toContain(
      "Dear {salutation},",
    );
    expect(frame.contentDocument.querySelector("a")).not.toHaveAttribute(
      "href",
    );
    expect(
      screen.getByRole("link", { name: "Download saved Word file" }),
    ).toHaveAttribute("href", savedTemplateUrl(template.version));
    expect(
      screen.getByText(/not unsaved edits or a personalized letter/),
    ).toBeVisible();
  });
  it("shows load errors, keeps download available, and retries only the read", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Please sign in." }, { status: 401 }),
    );
    render(<SavedLetterPreview template={template} onClose={vi.fn()} />);
    fireEvent.load(screen.getByTitle("President's Society saved Word letter"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please sign in.",
    );
    expect(renderAsync).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Download saved Word file" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try preview again" }));
    await waitFor(() => expect(renderAsync).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls.every(([, options]) => !options.method)).toBe(
      true,
    );
  });
  it("offers a fallback when rendering fails without altering the saved file", async () => {
    renderAsync.mockRejectedValueOnce(new Error("Preview unavailable."));
    render(<SavedLetterPreview template={template} onClose={vi.fn()} />);
    fireEvent.load(screen.getByTitle("President's Society saved Word letter"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preview unavailable.",
    );
    expect(
      screen.getByRole("link", { name: "Download saved Word file" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("cancels a pending read on close without rendering stale content", async () => {
    let resolve;
    fetchMock.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = render(
      <SavedLetterPreview template={template} onClose={vi.fn()} />,
    );
    fireEvent.load(screen.getByTitle("President's Society saved Word letter"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0][1].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    resolve(new Response("Word bytes"));
    await new Promise((done) => setTimeout(done, 0));
    expect(renderAsync).not.toHaveBeenCalled();
  });
  it("supports closing from the button or Escape inside the document", async () => {
    const onClose = vi.fn();
    render(<SavedLetterPreview template={template} onClose={onClose} />);
    const frame = screen.getByTitle("President's Society saved Word letter");
    fireEvent.load(frame);
    await waitFor(() => expect(renderAsync).toHaveBeenCalledOnce());
    fireEvent.keyDown(frame.contentDocument, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
