# Approved Decisions

These product decisions form the handoff baseline. A change requires a documented impact assessment and product-owner approval.

| ID | Decision | Rationale |
|---|---|---|
| DEC-001 | The product is named the EPV Industrial Enterprise Platform (EIEP). | The scope extends beyond a digital quality manual. |
| DEC-002 | dQMOS is the quality backbone within EIEP, not the entire platform. | Quality integrates with every discipline without replacing project execution. |
| DEC-003 | Use one shared, controlled domain model. | Projects, materials, welds, members, foundations, equipment, and turnover records must not be recreated by each module. |
| DEC-004 | Support self-perform, subcontracted, and blended execution at every work-package level. | EPV retains control and accountability regardless of performer. |
| DEC-005 | Keep source intake, training/demo, and production implementation physically and logically separated. | Unapproved or fictitious content must not contaminate live data or releases. |
| DEC-006 | Deliver a narrow complete vertical slice before broad module expansion. | A working chain provides earlier operational value and validates the architecture. |
| DEC-007 | The first slice is project -> documents -> materials/MTR -> PMI/inspection -> NCR/punch -> turnover. | It proves the digital thread and immediate quality value. |
| DEC-008 | Structural, civil, and concrete are peer execution disciplines with piping and pressure equipment. | EPV intends to offer complete industrial scopes. |
| DEC-009 | PMI is a governed material-assurance workflow, not merely an attached NDE report. | Material mix-up prevention depends on active release controls. |
| DEC-010 | Turnover is organized primarily by systems and accepted records. | Owners, operations, and commissioning work in systems. |
| DEC-011 | Subcontractors receive scope-limited portal access and use EPV project controls. | Delegation does not transfer EPV accountability. |
| DEC-012 | Separate development, test, training, and production environments are required. | Environment and data isolation are non-negotiable release controls. |
| DEC-013 | Standards are referenced and interpreted through governed EPV content; copyrighted standards are not reproduced. | Protects intellectual property and clarifies authority. |
| DEC-014 | Major technical choices require architecture decision records. | The handoff intentionally does not prescribe an unreviewed technology stack. |
| DEC-015 | A feature is incomplete without permissions, audit events, tests, documentation, and acceptance evidence. | Functional screens alone do not meet an industrial controlled-system standard. |

## Open decisions requiring ADRs

- Application and backend technology stack.
- Cloud provider and regional deployment model.
- Identity provider and external-user federation approach.
- Database, object storage, search, and audit-store choices.
- Offline data synchronization approach.
- Electronic-signature assurance levels by record type.
- Document markup and Bluebeam integration pattern.
- PDF generation and long-term preservation format.
- Integration/event architecture and API versioning.
- Tenant model if EIEP becomes a commercial product.

