import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { feedbackClustersApi, type AdminFeedbackClusterDetail } from "./api/admin.api";
import { AdminFeedbackThemeDetail } from "./AdminArea";

const detail: AdminFeedbackClusterDetail = {
  id: "cluster-1",
  title: "Shared Focus Rooms",
  summary: "Users are asking for shared focus sessions.",
  confidence: "high",
  status: "active",
  memberCount: 2,
  totalVotes: 9,
  lastAnalyzedAt: "2026-08-14T10:00:00.000Z",
  members: [
    {
      id: "feedback-1",
      title: "Focus with friends",
      category: "idea",
      status: "in_development",
      voteCount: 5,
      createdAt: "2026-08-01T10:00:00.000Z",
    },
  ],
};

function renderDetail(onBack = vi.fn(), onOpenFeedback = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <AdminFeedbackThemeDetail
        token="token"
        id="cluster-1"
        onBack={onBack}
        onOpenFeedback={onOpenFeedback}
      />
    </QueryClientProvider>,
  );
  return { ...view, onBack, onOpenFeedback };
}

describe("AdminFeedbackThemeDetail", () => {
  it("renders theme metrics, readable member status, and navigation", async () => {
    vi.spyOn(feedbackClustersApi, "getById").mockResolvedValueOnce(detail);
    const { onBack, onOpenFeedback } = renderDetail();

    expect(await screen.findByText("Shared Focus Rooms")).toBeInTheDocument();
    expect(screen.getByText(detail.summary)).toBeInTheDocument();
    expect(screen.getByText("Related Ideas")).toBeInTheDocument();
    expect(screen.getByText("Total Votes")).toBeInTheDocument();
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.getByText(/Last Analyzed/)).toBeInTheDocument();
    expect(screen.getByText("Focus with friends")).toBeInTheDocument();
    expect(screen.getByText("In Development")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View feedback" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to AI Themes" }));
    expect(onOpenFeedback).toHaveBeenCalledWith("feedback-1");
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows the existing skeleton while theme data is loading", () => {
    vi.spyOn(feedbackClustersApi, "getById").mockReturnValueOnce(new Promise(() => {}));
    const { container } = renderDetail();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows a safe not-found state", async () => {
    vi.spyOn(feedbackClustersApi, "getById").mockRejectedValueOnce(
      new Error("Cluster not found."),
    );
    renderDetail();
    expect(await screen.findByText("AI theme not found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to AI Themes" })).toBeInTheDocument();
  });
});
