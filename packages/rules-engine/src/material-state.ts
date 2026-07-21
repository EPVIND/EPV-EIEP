import type {
  InspectionEquipmentRecord,
  MaterialItemRecord,
  NonconformanceRecord,
  PmiRecord,
} from "@eiep/shared-types";

export function materialReleaseBlockers(material: MaterialItemRecord): readonly string[] {
  const blockers: string[] = [];
  if (material.state === "quarantined") blockers.push("material_quarantined");
  if (material.state === "rejected") blockers.push("material_rejected");
  if (material.requirements.mtrRequired && !material.mtrDocumentRevisionId) blockers.push("mtr_missing");
  if (material.requirements.mtrRequired && !material.requirements.mtrAccepted) blockers.push("mtr_not_accepted");
  if (material.requirements.receivingInspectionRequired && !material.requirements.receivingInspectionAccepted) {
    blockers.push("receiving_inspection_incomplete");
  }
  if (material.requirements.pmiRequired && !material.requirements.pmiAccepted) blockers.push("pmi_incomplete");
  if (material.requirements.pmiRequired && !material.requirements.governingPmiRule) blockers.push("pmi_rule_missing");
  if (material.requirements.openDispositionCount > 0) blockers.push("open_disposition");
  return blockers;
}

export function pmiAcceptanceBlockers(
  pmi: PmiRecord,
  equipment: InspectionEquipmentRecord,
  material: MaterialItemRecord,
  now: Date,
): readonly string[] {
  const blockers: string[] = [];
  if (pmi.result !== "pass") blockers.push("pmi_result_failed");
  if (pmi.requiredMaterial.trim().toUpperCase() !== material.grade.trim().toUpperCase()) {
    blockers.push("required_material_mismatch");
  }
  if (!equipment.methodCapabilities.includes(pmi.method)) blockers.push("instrument_method_not_capable");
  if (equipment.state !== "active") blockers.push("instrument_inactive");
  if (equipment.verificationState !== "passed") blockers.push("instrument_verification_failed");
  if (equipment.validFrom.getTime() > pmi.inspectedAt.getTime() || equipment.validTo.getTime() <= pmi.inspectedAt.getTime()) {
    blockers.push("instrument_verification_expired");
  }
  if (pmi.inspectedAt.getTime() > now.getTime()) blockers.push("inspection_time_in_future");
  if (Object.keys(pmi.readings).length === 0) blockers.push("pmi_readings_missing");
  if (pmi.evidenceFileIds.length === 0) blockers.push("pmi_evidence_missing");
  if (!pmi.componentLocation.trim()) blockers.push("pmi_component_location_missing");
  if (!pmi.notes.trim()) blockers.push("pmi_notes_missing");
  if (material.requirements.mtrRequired && !material.requirements.mtrAccepted) blockers.push("mtr_not_accepted");
  return blockers;
}

export function ncrClosureBlockers(ncr: NonconformanceRecord): readonly string[] {
  const blockers: string[] = [];
  if (!ncr.disposition) blockers.push("disposition_missing");
  if (!ncr.correctiveAction) blockers.push("corrective_action_missing");
  if (!ncr.dispositionApprovedBy) blockers.push("disposition_approval_missing");
  if (!ncr.reinspectionEvidenceFileId) blockers.push("reinspection_evidence_missing");
  return blockers;
}
