import type { DocumentRevisionRecord, DocumentRevisionState } from "@eiep/shared-types";

const allowedTransitions: Readonly<Record<DocumentRevisionState, readonly DocumentRevisionState[]>> = {
  draft: ["staged", "void"],
  staged: ["under_review", "rejected", "void"],
  under_review: ["approved", "rejected", "void"],
  approved: ["released", "void"],
  released: ["superseded"],
  superseded: [],
  rejected: [],
  void: [],
};

export function documentTransitionAllowed(from: DocumentRevisionState, to: DocumentRevisionState): boolean {
  return allowedTransitions[from].includes(to);
}

export function documentReleaseBlockers(revision: DocumentRevisionRecord): readonly string[] {
  const blockers: string[] = [];
  if (revision.state !== "approved") blockers.push("revision_not_approved");
  if (revision.fileValidationState !== "released") blockers.push("file_not_released");
  if (revision.approvalCount < revision.requiredApprovalCount) blockers.push("approvals_incomplete");
  return blockers;
}

