import { apiFetch } from "./apiClient";
import { listInvitations } from "./focusRoomsApi";

jest.mock("./apiClient", () => ({
  apiFetch: jest.fn(),
  readJsonOrThrow: jest.fn(),
}));

describe("mobile Focus Rooms API", () => {
  it("lists current-user invitations from the canonical route", async () => {
    jest.mocked(apiFetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue([]),
    } as unknown as Response);

    await expect(listInvitations("token")).resolves.toEqual([]);
    expect(apiFetch).toHaveBeenCalledWith(
      "/focus-rooms/invitations/mine",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });
});
