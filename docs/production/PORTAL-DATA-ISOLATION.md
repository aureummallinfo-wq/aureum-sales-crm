# Portal data isolation

Each city portal must use its own `crm.workspaces` row. Pin each deployment to
that row's `legacy_id` with the server environment variable `AUREUM_WORKSPACE_ID`.
Existing deployments default to `workspace_default`. The configured workspace
must already exist and be active. An unknown workspace stops startup; it never
selects another city's data as a fallback.

City portal ownership is a workspace boundary. A customer's `city` field is
contact information and does not grant access or move records between portals.
Agents and teams remain scoped inside that workspace. Do not import or copy
another portal's leads, customers, follow-ups, or sales totals to fill empty views.

Session lookup and logout are restricted to the deployment's workspace. Browser
caches include workspace, user, role, team, API origin and session revision.
Account changes clear data views, drawers, searches and cached results. Responses
from previous sessions and previous dashboard loads cannot replace current data.

Requests from a signed-in browser include `X-Aureum-Portal-Scope`. This is a
consistency check, not authorization: the server still derives permissions from
the authenticated session. If a different tab changes the shared login cookie,
a mismatched request returns `409 PORTAL_SESSION_CHANGED` before reads or writes.
The stale tab clears its data and returns to sign-in.

Verification covers separate agents, separate workspaces with identical legacy
record IDs, foreign session rejection, scoped logout, cache isolation, late
responses, and stale tabs. Local browser verification switches from Adan to Saqib
using isolated test data and checks that Saqib's empty dashboard remains empty.

Production city/workspace mappings have not been changed or deployed by this
work. Configure each portal's existing workspace before enabling city separation
in production; no production sales records were imported or reassigned.
