import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { feedbackClustersApi, type AdminFeedbackClusterDetail } from "./api/admin.api";
import { AdminFeedbackThemeDetail, EnglishChallengeDateTimeField, serializeChallengeDateTime, splitChallengeDateTime } from "./AdminArea";

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
  it("keeps challenge date/time text English and serializes independent fields in RTL", () => {
    const onStartChange = vi.fn();
    const onEndChange = vi.fn();
    render(
      <div dir="rtl">
        <EnglishChallengeDateTimeField label="تاريخ البدء" value="2026-05-04T13:30" onChange={onStartChange} />
        <EnglishChallengeDateTimeField label="تاريخ الانتهاء" value="2026-06-05T09:15" onChange={onEndChange} />
      </div>,
    );

    expect(screen.getByTestId("تاريخ البدء-date")).toHaveValue("05/04/2026");
    expect(screen.getByTestId("تاريخ البدء-time")).toHaveValue("01:30 PM");
    expect(screen.getByTestId("تاريخ الانتهاء-date")).toHaveValue("06/05/2026");
    expect(screen.getByTestId("تاريخ الانتهاء-time")).toHaveValue("09:15 AM");

    fireEvent.change(screen.getByTestId("تاريخ البدء-date"), { target: { value: "12/31/2027" } });
    expect(onStartChange).toHaveBeenLastCalledWith("2027-12-31T13:30");
    expect(onEndChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("تاريخ البدء-time"), { target: { value: "11:05 AM" } });
    expect(onStartChange).toHaveBeenLastCalledWith("2027-12-31T11:05");
    expect(serializeChallengeDateTime("02/29/2025", "10:00 AM")).toBe("");
    expect(splitChallengeDateTime("2026-01-02T00:05")).toEqual({ date: "01/02/2026", time: "12:05 AM" });
  });

  it("uses read-only display fields and native picker values", () => {
    const onChange = vi.fn();
    render(<EnglishChallengeDateTimeField label="Start" value="2026-05-04T13:30" onChange={onChange} />);

    expect(screen.getByTestId("Start-date")).toHaveAttribute("readonly");
    expect(screen.getByTestId("Start-time")).toHaveAttribute("readonly");
    expect(screen.getByTestId("Start-date-picker")).toHaveAttribute("type", "date");
    expect(screen.getByTestId("Start-time-picker")).toHaveAttribute("type", "time");

    fireEvent.change(screen.getByTestId("Start-date-picker"), { target: { value: "2026-05-05" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-05-05T13:30");
    fireEvent.change(screen.getByTestId("Start-time-picker"), { target: { value: "09:15" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-05-05T09:15");
  });

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
