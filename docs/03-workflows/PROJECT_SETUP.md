# Workflow: Project Setup

## Purpose

Create the controlled context that every document, material, work, inspection, subcontractor, and turnover record references.

## Preconditions

- Customer and performing organizations exist or are approved for creation.
- Contract/project authorization and project number are available.
- Project manager and quality/document-control authorities are designated.

## Flow

1. Create draft project with number, name, customer, facility/site, location/time zone, dates, currency/units as applicable, and confidentiality.
2. Identify scope, execution model, project leadership, customer roles, and participating organizations.
3. Configure areas, systems/completion boundaries, WBS, work packages, and responsibility assignments.
4. Reference governing contract documents, codes, specifications, procedures, client requirements, and approved interpretations.
5. Configure document numbering/revision, material/PMI, inspection points, subcontractor prerequisites, NCR/punch, and turnover index.
6. Assign users and external portal access by role and scope.
7. Review readiness checklist and unresolved configuration exceptions.
8. Authorized project administrator activates the project; activation is audited.

The client declares only the project scope statement, governing reference labels,
planned dates, and responsible role codes. It cannot declare readiness. The server
recalculates customer participation, facility metadata, currently effective named
project/quality/document-control responsibilities, active configuration backed by
exact released governing revisions, completion boundaries/turnover requirements, and
open NCR/punch exceptions before activation and stores the derived evidence in the
activation audit.

## Gates

- Unique project number and valid customer/facility.
- Named project, quality, and document-control authorities.
- At least one completion boundary and responsibility assignment.
- Approved requirement references and turnover baseline.
- External access is disabled until its assignments and identity controls are approved.

## Outputs

Activated project, assignments, configuration version, readiness report, and audit event. Later configuration changes use effective dates and change history.
