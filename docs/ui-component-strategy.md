# UI component strategy

The portal is Tailwind-first. Use semantic HTML and Tailwind CSS 4 for
straightforward controls and presentation, keeping the component and dependency
surface small. Do not introduce another styling system for an isolated feature.

## Application-owned components

Create a small, application-owned React component when a portal pattern repeats
and a shared implementation improves consistency, semantics, or maintenance.
Keep its public API narrow and its markup semantic. A one-off element should
normally remain local to the feature instead of becoming a generic component.

## Complex interactive widgets

Dialogs, comboboxes, menus, tabs, popovers, date pickers, and similar widgets
need complete keyboard, focus, and assistive-technology behavior. Do not
hand-build that behavior merely to avoid a justified dependency.

There is no repository-wide preferred primitive library yet. An unstyled,
accessibility-focused primitive (for example, React Aria Components or Radix
Primitives) may be introduced only for a concrete, approved widget use case.
The feature's issue and approved plan must record the per-component evaluation
and the selected approach. Revisit a repository-wide preference only after
several approved use cases show a repeatable need.

Before adding a primitive, evaluate and record:

- the required semantic, keyboard, focus-management, and screen-reader
  behavior, including any behavior the application must still supply;
- compatibility with React 19, Next.js App Router, and server/client component
  boundaries;
- Tailwind styling integration, the dependency and bundle impact, maintenance
  and upgrade responsibility, and license compatibility; and
- the unit, accessibility, and applicable Playwright coverage needed to verify
  the interaction.

Copied component starters, including shadcn/ui, become application-owned code.
The feature owner is responsible for their accessibility, tests, upgrades, and
ongoing maintenance.

## Frameworks and exceptions

Do not add Material UI, Bootstrap, or another comprehensive styled framework
for one isolated component. Adopting one requires a separate approved
architectural decision that covers the product-wide visual and styling model,
not just the immediate widget.

Record a departure from this strategy, including a decision to implement a
complex widget without a primitive, in the originating issue and approved plan.
Link any durable architectural decision or implementation guidance from the
relevant repository documentation. Interactive changes must preserve semantic
markup, responsive behavior, keyboard access, and visible focus treatment, and
must add applicable unit, accessibility, and Playwright coverage as required by
[`AGENTS.md`](../AGENTS.md).

This policy does not authorize a UI dependency on its own.
