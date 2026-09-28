import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import DashboardAssistantAvatar from "./DashboardAssistantAvatar";
import nellieAvatar from "@/assets/nellie-ju-v1.png";

afterEach(cleanup);

it("uses the bundled Nellie artwork with reserved dimensions and no duplicate accessible name", () => {
  const { container } = render(<button>Check in with Nellie<DashboardAssistantAvatar /></button>);
  const image = container.querySelector("img");
  expect(image).toHaveAttribute("src", nellieAvatar);
  expect(image).toHaveAttribute("width", "64");
  expect(image).toHaveAttribute("height", "64");
  expect(image).toHaveAttribute("alt", "");
  expect(image).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByRole("button", { name: "Check in with Nellie" })).toBeVisible();
});

it("keeps the configurable compass option without loading the dolphin image", () => {
  const { container } = render(<DashboardAssistantAvatar avatar="compass" />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

it("falls back to the built-in compass if the image cannot load", () => {
  const { container } = render(<DashboardAssistantAvatar />);
  fireEvent.error(container.querySelector("img"));
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).toHaveAttribute("class", "dashboard-assistant-avatar");
});

it("updates immediately when the avatar setting changes", () => {
  const { container, rerender } = render(<DashboardAssistantAvatar avatar="compass" />);
  rerender(<DashboardAssistantAvatar avatar="dolphin" />);
  expect(container.querySelector("img")).toHaveAttribute("src", nellieAvatar);
  expect(container.querySelector("svg")).toBeNull();
});
