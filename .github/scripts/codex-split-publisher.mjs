import {
  SPLIT_CHECKLIST_PREFIX,
  SPLIT_CHILD_PREFIX,
  STATE_LABELS,
  transitionFor,
  validatePublicText,
} from "./codex-workflow-state.mjs";

function list(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function splitChildMarker(parentNumber, childId, digest) {
  return `${SPLIT_CHILD_PREFIX}parent-${parentNumber}:${childId}:${digest} -->`;
}

export function splitChecklistMarker(digest) {
  return `${SPLIT_CHECKLIST_PREFIX}${digest} -->`;
}

export function childLabels(parentLabels, suggestedLabels) {
  const stateLabels = new Set(STATE_LABELS);
  const suggested = new Set(suggestedLabels);
  const topics = parentLabels
    .map((label) => typeof label === "string" ? label : label.name)
    .filter((label) => !stateLabels.has(label) && suggested.has(label));
  return ["needs-planning", ...new Set(topics)];
}

export function childBody({ parentNumber, child, digest }) {
  const body = `${splitChildMarker(parentNumber, child.id, digest)}
## Parent issue

Split from #${parentNumber}.

## Bounded outcome

${child.outcome}

## Acceptance criteria

${list(child.acceptanceCriteria)}

## Dependencies

${list(child.dependencies)}

## Scope boundaries

Included:

${list(child.includedScope)}

Excluded:

${list(child.excludedScope)}

## Planning status

This child begins in \`needs-planning\` for read-only planning. It has not been approved for implementation.`;
  validatePublicText(body);
  return body;
}

async function findMarkedChildren({ github, owner, repo, markers }) {
  const found = new Map();
  for await (const response of github.paginate.iterator(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: "all",
    per_page: 100,
  })) {
    for (const issue of response.data) {
      if (issue.pull_request) continue;
      for (const [id, marker] of markers) {
        if (!issue.body?.includes(marker)) continue;
        if (found.has(id)) throw new Error(`Multiple issues contain the split marker for ${id}.`);
        found.set(id, issue);
      }
    }
  }
  return found;
}

async function reconcileChecklist({ github, owner, repo, parentNumber, digest, children }) {
  const marker = splitChecklistMarker(digest);
  const body = `${marker}\n## Split children\n\n${children
    .map(({ number, title }) => `- [ ] #${number} — ${title}`)
    .join("\n")}`;
  validatePublicText(body);
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: parentNumber,
    per_page: 100,
  });
  const matches = comments.filter((comment) => comment.body?.includes(marker));
  if (matches.length > 1) throw new Error("Multiple parent split checklists require human review.");
  if (matches.length === 1) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: matches[0].id, body });
  } else {
    await github.rest.issues.createComment({ owner, repo, issue_number: parentNumber, body });
  }
}

export async function publishSplit({ github, owner, repo, parent, children, digest }) {
  const parentLabels = parent.labels.map((label) => typeof label === "string" ? label : label.name);
  if (parent.state !== "open" || !parentLabels.includes("approved-for-split")) {
    throw new Error("The parent is no longer open and approved for splitting.");
  }

  const markers = new Map(children.map((child) => [
    child.id,
    splitChildMarker(parent.number, child.id, digest),
  ]));
  const found = await findMarkedChildren({ github, owner, repo, markers });
  const confirmed = [];

  for (const child of children) {
    let issue = found.get(child.id);
    if (!issue) {
      const response = await github.rest.issues.create({
        owner,
        repo,
        title: child.title,
        body: childBody({ parentNumber: parent.number, child, digest }),
        labels: childLabels(parent.labels, child.suggestedLabels),
      });
      issue = response.data;
    }
    if (!issue.body?.includes(markers.get(child.id))) {
      throw new Error(`Child ${child.id} does not contain the expected marker.`);
    }
    confirmed.push({ number: issue.number, title: issue.title, childId: child.id });
  }

  if (confirmed.length !== children.length) {
    throw new Error("Not every proposed child was confirmed.");
  }
  await reconcileChecklist({ github, owner, repo, parentNumber: parent.number, digest, children: confirmed });

  const transition = transitionFor("split");
  for (const name of transition.remove) {
    try {
      await github.rest.issues.removeLabel({ owner, repo, issue_number: parent.number, name });
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  for (const name of transition.add) {
    await github.rest.issues.addLabels({ owner, repo, issue_number: parent.number, labels: [name] });
  }
  await github.rest.issues.update({
    owner,
    repo,
    issue_number: parent.number,
    state: "closed",
    state_reason: "not_planned",
  });
  return confirmed;
}
