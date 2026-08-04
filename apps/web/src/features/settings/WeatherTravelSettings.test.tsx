import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { WeatherTravelSettings } from "./WeatherTravelSettings";
const preferences = {
  enabled: false,
  preparationChecklistsEnabled: true,
  travelAdviceEnabled: true,
  weatherAdviceEnabled: true,
  documentAdviceEnabled: true,
  clothingAdviceEnabled: true,
  umbrellaAdviceEnabled: true,
  hydrationAdviceEnabled: true,
  notificationMode: "smart",
  defaultTravelMode: "driving",
  language: "en",
};
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => preferences }),
  ),
);
test("exposes simple assistant settings and saves through the API", async () => {
  render(<WeatherTravelSettings token="token" />);
  const toggle = await screen.findByLabelText("Enable Task Context Assistant");
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "Save Task Assistant" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Umbrella reminders")).toBeInTheDocument();
  expect(screen.getByLabelText("Notification timing")).toHaveValue("smart");
});
