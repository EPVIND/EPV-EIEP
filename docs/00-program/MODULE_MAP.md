# Enterprise Module Map

The task-owner dashboard capability expectation is controlled in
`PRODUCT_VISION_CAPABILITY_BASELINE.md`. This map describes the corresponding domain
scope; it does not treat illustrative dashboard values as implemented records.

## Shared foundation

- Organizations, facilities, projects, systems, areas, WBS, work packages, and responsibilities.
- Identity, roles, project assignments, delegated access, MFA, and audit history.
- Controlled documents, drawings, specifications, revisions, transmittals, and signatures.
- Master data, rules, notifications, search, files, reporting, exports, and APIs.

## Business and project controls

- Business development and customer relationship management.
- Estimating, proposals, contracts, change management, and cost control.
- Scheduling, look-aheads, quantities, resources, progress, forecasts, and earned value.
- Procurement, vendors, purchase orders, logistics, receiving, inventory, and expediting.

## Execution disciplines

- Civil and site development.
- Concrete, foundations, reinforcing, embeds, and grouting.
- Structural and miscellaneous steel fabrication and erection.
- Pressure vessels, tanks, heat exchangers, and repairs.
- Process and utility piping.
- Mechanical equipment and installation.
- Modular fabrication and assembly.
- Electrical and instrumentation.
- Insulation, coatings, fireproofing, and refractory.
- Testing, commissioning, startup support, and turnover.
- Maintenance, repair, alteration, and turnaround services.

## Quality and material assurance

- Inspection and test planning, hold/witness/review points, and releases.
- Material receiving, MTR review, heat and lot control, cut pieces, remnants, quarantine, and issue.
- PMI, alloy verification, calibration, instrument verification, and mix-up prevention.
- WPS, PQR, WPQ, weld tracking, consumables, visual examination, and repair history.
- NDE requests, technique/procedure, personnel qualifications, results, and acceptance.
- PWHT, pressure/leak testing, dimensional control, bolting, coating, and civil testing.
- NCR, corrective action, concession/deviation, punch list, and lessons learned.
- Turnover index, test packages, completion certificates, and dossier generation.

## Subcontractor control

- Qualification, licenses, insurance, bonding, safety and quality status.
- Bid packages, scope/exclusion matrices, awards, schedules of values, and changes.
- Lower-tier disclosure and approval.
- Mobilization release, assignments, daily reporting, progress verification, and payment support.
- Quality plans, submittals, inspections, deficiencies, turnover, and scorecards.

## Enterprise operations and portals

- Safety, training, permits, JHAs, incidents, and equipment inspections.
- Fleet, tools, calibration, maintenance, lifting devices, and equipment records.
- Finance integration, job costing, billing support, and executive analytics.
- Client, subcontractor, vendor, inspector, and employee portals.
- Asset history and future digital-twin capabilities.

## MVP implementation boundary

Only the shared foundation and the first operational vertical slice are implementation commitments for the MVP. Other modules influence identifiers, extensibility, and interfaces but are deferred until the vertical slice meets its acceptance criteria.

## Active post-MVP expansion priority

Task-owner direction on 2026-07-21 activates advanced estimating/proposals first,
then project controls/procurement/scheduling, welding/NDE/PWHT/testing, and governed
Bluebeam collaboration. Estimating, project controls/procurement/scheduling, and
welding/NDE/PWHT/testing now have locally verified controlled-pilot slices;
Bluebeam collaboration is the active implementation target. These are separate controlled releases under
`../01-requirements/EXPANSION_REQUIREMENTS.md`; activation does not enlarge the MVP
acceptance claim or authorize production use.

The preserved vision also includes the adjacent engineering database, fabrication,
spool generation, CNC/waterjet/profiling, customer portal, unified task/activity,
reports/analytics, offline, and system-status surfaces. Their sequencing follows the
dependency order in the product-vision baseline; none is silently represented as
available before executable acceptance evidence exists.
