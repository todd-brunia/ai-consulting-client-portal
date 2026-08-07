import { describe, expect, it, vi } from "vitest";

import {
  childBody,
  childLabels,
  publishSplit,
  splitChildMarker,
} from "./codex-split-publisher.mjs";

const digest = "a".repeat(64);
const parent = {
  number: 60,
  state: "open",
  labels: [
    { name: "devops" },
    { name: "workflow" },
    { name: "approved-for-split" },
    { name: "blocked" },
  ],
};
const children = ["schema", "publisher"].map((id) => ({
  id,
  title: `Implement ${id} controls`,
  outcome: `Deliver the bounded ${id} outcome without unrelated changes.`,
  acceptanceCriteria: [`The ${id} behavior has focused tests.`],
  dependencies: ["None"],
  includedScope: [`The ${id} implementation.`],
  excludedScope: ["Unrelated workflow changes."],
  suggestedLabels: ["workflow", "approved-for-build"],
}));
const result = {
  classification: "split-required",
  markdown: "This issue needs decomposition into independently valuable outcomes.",
  blockingDecision: null,
  splitReason: "The outcomes use unrelated change surfaces and validation paths.",
  children,
};

function mockGithub({ existing = [], comments = [], failOnCreate = null } = {}) {
  let nextNumber = 100;
  const created = [];
  const issues = {
    listForRepo: vi.fn(),
    listComments: vi.fn(),
    create: vi.fn(async (input) => {
      if (input.title === failOnCreate) throw new Error("simulated child creation failure");
      const data = { number: nextNumber++, title: input.title, body: input.body };
      created.push(data);
      return { data };
    }),
    createComment: vi.fn(async () => ({ data: { id: 1 } })),
    updateComment: vi.fn(async () => ({})),
    removeLabel: vi.fn(async () => ({})),
    addLabels: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
  };
  const paginate = vi.fn(async (method) => method === issues.listComments ? comments : existing);
  paginate.iterator = vi.fn(async function* () {
    yield { data: existing };
  });
  return { github: { rest: { issues }, paginate }, issues, created };
}

describe("split publisher", () => {
  it("builds bounded child text with needs-planning and excludes other state labels", () => {
    expect(childLabels(parent.labels, children[0].suggestedLabels)).toEqual(["needs-planning", "workflow"]);
    expect(childLabels(
      [...parent.labels, { name: "workflow" }, { name: "plan-ready" }, { name: "in-progress" }],
      [...children[0].suggestedLabels, "workflow", "needs-planning", "plan-ready", "in-progress"],
    )).toEqual(["needs-planning", "workflow"]);
    expect(childBody({ parentNumber: 60, child: children[0], digest })).toContain(
      splitChildMarker(60, "schema", digest),
    );
    expect(childBody({ parentNumber: 60, child: children[0], digest })).toContain(
      "begins in `needs-planning` for read-only planning",
    );
    expect(childBody({ parentNumber: 60, child: children[0], digest })).not.toContain("apply `needs-planning`");
  });

  it("creates all missing children, reconciles a checklist, then closes the parent", async () => {
    const { github, issues, created } = mockGithub();
    const confirmed = await publishSplit({ github, owner: "todd-brunia", repo: "site", parent, result, digest });

    expect(created).toHaveLength(2);
    expect(confirmed.map(({ number }) => number)).toEqual([100, 101]);
    expect(issues.create).toHaveBeenCalledWith(expect.objectContaining({
      labels: ["needs-planning", "workflow"],
    }));
    expect(issues.createComment).toHaveBeenCalledOnce();
    expect(issues.update).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 60,
      state: "closed",
      state_reason: "not_planned",
    }));
  });

  it("publishes a structured v2 split without changing split behavior", async () => {
    const structuredResult = {
      contractVersion: "plan/v2",
      classification: "split-required",
      objective: "Split the parent into bounded implementation outcomes.",
      executiveSummary: "Create independently actionable children while preserving the existing approval, marker, retry, and parent-close behavior.",
      keyDecisions: ["Keep the existing split publication transaction unchanged."],
      tradeoffs: [],
      risks: [],
      openQuestions: [],
      fileChanges: [{ path: ".github/scripts/codex-split-publisher.mjs", change: "Accept the versioned planning result." }],
      implementationOrder: ["Validate the structured result before publishing its children."],
      teachMe: [],
      reviewerChallengePoints: [],
      machineImplementationDetails: "Preserve child markers, idempotent retry behavior, checklist reconciliation, and parent closure.",
      blockingDecision: null,
      splitReason: result.splitReason,
      children,
    };
    const { github, issues, created } = mockGithub();
    const confirmed = await publishSplit({
      github,
      owner: "todd-brunia",
      repo: "site",
      parent,
      result: structuredResult,
      digest,
    });

    expect(created).toHaveLength(2);
    expect(confirmed.map(({ number }) => number)).toEqual([100, 101]);
    expect(issues.createComment).toHaveBeenCalledOnce();
    expect(issues.update).toHaveBeenCalledOnce();
  });

  it("reuses a marked child on retry instead of creating a duplicate", async () => {
    const existing = [{
      number: 88,
      title: children[0].title,
      body: childBody({ parentNumber: 60, child: children[0], digest }),
    }];
    const { github, issues, created } = mockGithub({ existing });
    const confirmed = await publishSplit({ github, owner: "todd-brunia", repo: "site", parent, result, digest });

    expect(created).toHaveLength(1);
    expect(confirmed.map(({ number }) => number)).toEqual([88, 100]);
    expect(issues.create).toHaveBeenCalledWith(expect.objectContaining({
      title: children[1].title,
      labels: ["needs-planning", "workflow"],
    }));
    expect(issues.addLabels.mock.calls.every(([input]) => input.issue_number === parent.number)).toBe(true);
    expect(issues.update).toHaveBeenCalledOnce();
  });

  it("leaves the parent open when child creation partially fails", async () => {
    const { github, issues, created } = mockGithub({ failOnCreate: children[1].title });
    await expect(publishSplit({ github, owner: "todd-brunia", repo: "site", parent, result, digest }))
      .rejects.toThrow(/simulated/);

    expect(created).toHaveLength(1);
    expect(issues.update).not.toHaveBeenCalled();
    expect(issues.removeLabel).not.toHaveBeenCalled();
  });

  it("blocks conflicting duplicate markers", async () => {
    const body = childBody({ parentNumber: 60, child: children[0], digest });
    const { github, issues } = mockGithub({
      existing: [
        { number: 88, title: children[0].title, body },
        { number: 89, title: children[0].title, body },
      ],
    });
    await expect(publishSplit({ github, owner: "todd-brunia", repo: "site", parent, result, digest }))
      .rejects.toThrow(/Multiple issues/);
    expect(issues.create).not.toHaveBeenCalled();
    expect(issues.update).not.toHaveBeenCalled();
  });
});
