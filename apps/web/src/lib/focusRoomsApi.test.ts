import { afterEach, describe, expect, it, vi } from "vitest";
import { listRoomInvitations } from "./focusRoomsApi";

describe("Focus Rooms API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists current-user invitations from the canonical route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRoomInvitations("token")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/focus-rooms/invitations/mine",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
