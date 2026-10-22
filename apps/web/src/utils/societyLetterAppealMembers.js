export function relationshipOnlyReceipt(member) {
  return (
    member?.status === "not_applicable" &&
    member.reason === "relationship_only" &&
    !!member.checkedAt &&
    !member.attemptedAt &&
    !member.assignmentId
  );
}

export function settledLetterAppealMember(member) {
  return member?.status === "verified" || relationshipOnlyReceipt(member);
}

export function completeLetterAppealMembers(members) {
  return (
    Array.isArray(members) &&
    members.some((m) => m?.status === "verified") &&
    members.every(settledLetterAppealMember)
  );
}
