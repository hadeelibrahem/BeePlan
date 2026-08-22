import { describe, expect, it } from "vitest";
import { feedbackLifecycleLabel, formatAdminProfileDate, pageFor } from "./AdminArea";

describe("Admin feedback routes", () => {
  it("keeps AI theme list, theme detail, and feedback detail distinct", () => {
    expect(pageFor("/admin/feedback/clusters")).toBe("feedbackClusters");
    expect(pageFor("/admin/feedback/clusters/cluster-123")).toBe(
      "feedbackClusterDetail",
    );
    expect(pageFor("/admin/feedback/feedback-123")).toBe("feedbackDetail");
  });

  it("routes the signed-in admin profile to the profile page", () => {
    expect(pageFor("/admin/profile")).toBe("profile");
  });
});

describe("feedback lifecycle labels", () => {
  it("uses readable labels for related feedback", () => {
    expect(feedbackLifecycleLabel("in_development")).toBe("In Development");
    expect(feedbackLifecycleLabel("submitted")).toBe("Submitted");
  });
});

describe("Admin profile formatting", () => {
  it("formats joined dates using the selected locale", () => {
    expect(formatAdminProfileDate("2026-06-26T00:00:00.000Z", "en")).toContain("Jun");
    expect(formatAdminProfileDate("2026-06-26T00:00:00.000Z", "en")).toContain("2026");
    expect(formatAdminProfileDate("2026-06-26T00:00:00.000Z", "ar")).not.toBe("—");
  });

  it("safely handles missing and invalid joined dates", () => {
    expect(formatAdminProfileDate(null, "en")).toBe("—");
    expect(formatAdminProfileDate("not-a-date", "en")).toBe("—");
  });
});
