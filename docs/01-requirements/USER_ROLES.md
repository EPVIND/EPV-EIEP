# User Roles and Permission Baseline

Roles are permission bundles, not job titles. Access is the intersection of role, organization, project assignment, work package, record state, and explicit delegation.

| Role | Typical permissions | Restricted actions |
|---|---|---|
| Executive sponsor | Portfolio visibility, risk and release approvals defined by governance. | Routine record editing; quality acceptance without qualification. |
| Product owner | Requirements, priority, acceptance, configuration approval. | System administration and technical release without assigned authority. |
| Project manager | Project setup, assignments, scope, schedule/progress overview, issue coordination. | Quality disposition/acceptance unless separately authorized. |
| Project controls | WBS, activities, quantities, progress and forecast records. | Material or inspection release. |
| Document controller | Document registration, revision workflow, distribution and supersession. | Technical approval unless separately assigned. |
| Document collaboration coordinator | Protected provider-export preview, exact mapping, reconciliation coordination, and collaboration evidence register. | Committing own preview, accepting provider status as EIEP approval, or live provider writes without separate authorization. |
| Integration authority | Independent import commit/reconciliation and provider contract/operational controls within assigned scope. | Document release, quality acceptance, or commercial authority unless separately assigned. |
| Procurement/material manager | Procurement references, receipt planning, inventory and issue oversight. | QC release where inspection approval is required. |
| Receiver/warehouse user | Receive, identify, label, locate, issue/return allowed material. | Release quarantined material or approve MTR/PMI. |
| QC manager | Project quality configuration, inspector assignment, reviews, NCR workflow and quality releases. | Engineering disposition outside delegated authority. |
| Inspector | Assigned inspections, evidence, results, reinspection, recommendations. | Unassigned project access or self-approval where independence is required. |
| Authorized Inspector/third party | Scope-limited hold/witness/review actions and evidence. | General project administration or commercial data. |
| Engineer/technical authority | Technical review, approved disposition, requirement interpretation within delegation. | Commercial or security administration. |
| Shop/field supervisor | Assigned work packages, readiness, daily execution and requests for inspection. | Bypassing hold points or accepting own controlled inspection. |
| CNC programmer | Prepare deterministic machine-neutral packages from exact approved source, assembly, traveler, material, piece, and machine-profile records; submit validation-complete revisions. | Approving or releasing own program; altering released artifacts; directly controlling equipment. |
| CNC machine-profile authority | Independently approve effective work-center capability, units, coordinates, envelope, features, operations, and postprocessor identity. | Approving a profile they proposed; granting process qualification; operating equipment by virtue of profile authority. |
| CNC technical/release authority | Independently review normalized program meaning or release an independently approved exact artifact within assigned scope. | Combining programmer, reviewer, and release authority for the same revision; bypassing changed prerequisites or validation findings. |
| CNC operator | Download an exact released package and record execution facts, evidence, quantities, exceptions, produced pieces, and remnants for a process in which they are qualified. | Starting/configuring equipment through EIEP; changing the released artifact; accepting their own reconciliation. |
| CNC reconciliation authority | Independently reconcile release hash, work center/operator, quantities, evidence, exceptions, and material genealogy. | Reconciling a job in which they programmed, submitted, reviewed, released, or operated. |
| Craft/field user | View current assigned documents; record allowed production facts. | Approval, release, broad search, or unassigned data. |
| Subcontractor administrator | Manage own approved users and submissions within assigned scope. | EPV internal cost/margin, other contractors, or final EPV acceptance. |
| Subcontractor user | Assigned documents, work packages, forms, RFIs/submittals, deficiencies and deliverables. | Other scopes, EPV confidential records, final release. |
| Client reviewer | Contract-configured project records, review/witness/acceptance actions, and exports. | EPV internal commercial, HR, or unrelated project data. |
| Commissioning/turnover coordinator | Completion boundaries, requirements, package review, punch and handover. | Altering source inspection records. |
| System administrator | Identity mapping, configuration, monitoring, break-glass support. | Routine business approvals; content access only when authorized and audited. |
| Auditor/read-only | Approved historical and audit views. | Create, edit, approve, release, or export beyond assigned scope. |

## Separation-of-duty examples

- The creator of an NCR disposition may not provide all required approvals when independent approval is configured.
- A receiver may capture MTR and PMI evidence but may not release material if QC approval is required.
- A subcontractor may submit an inspection record but cannot grant EPV final acceptance.
- An administrator may restore access but cannot silently alter an approved record.
- A CNC programmer cannot technically approve or release their program; the operator and every prior program authority are excluded from final execution reconciliation.
- Emergency access must be time-limited, justified, and reviewed.

## Required permission tests

- Positive access for each assigned role and valid state.
- Horizontal denial between projects, work packages, organizations, and record identifiers.
- Vertical denial for approval, release, export, configuration, and administration.
- Revocation after assignment end, organization removal, or credential disablement.
- Protection of file download URLs, search results, notifications, and generated packages.
