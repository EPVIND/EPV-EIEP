# Workflow: Material Receiving and Traceability

## Receiving

1. Identify project, PO/requisition, vendor, manufacturer/mill when known, receipt, packing evidence, and receiving user.
2. Record specification/grade, form/type, dimensions, quantity/unit, heat/lot, markings, condition, and storage location.
3. Attach MTR/certification to a material lot, validate document identity and represented heat/lot, and route required review.
4. Determine inspection and PMI requirements from the project rule set.
5. Assign an EPV material ID and generate a label/QR representation that does not expose sensitive data.
6. Place material in received-pending state until all required reviews/inspections pass.
7. Release, quarantine, reject/return, or conditionally control the material through authorized decisions.

## Movement and genealogy

- Record receipt, storage transfer, reservation, issue, return, cut, remnant, assembly consumption, scrap, shipment, and installation.
- Every child cut piece/remnant retains parent material, heat/lot, MTR, and movement history.
- Physical label replacement is an audited operation; never create a disconnected new identity.

## Release rules

Block issue/use when configured MTR review, receiving inspection, PMI, qualification, disposition, or label/identity is incomplete, failed, expired, or held. Display the specific blocking requirements and authorized resolution path.

## Reconciliation

Support count/quantity reconciliation and investigate missing label, conflicting heat marking, mixed storage, excess/short receipt, duplicate certificate, and damaged material through holds and NCR linkage.

