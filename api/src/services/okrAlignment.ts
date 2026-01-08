export type AlignmentValidationError = "self_link" | "cycle_detected";

export function validateAlignmentRules(
  parentOkrId: string,
  childOkrId: string,
  pathExists: boolean
): AlignmentValidationError | null {
  if (parentOkrId.toLowerCase() === childOkrId.toLowerCase()) {
    return "self_link";
  }
  if (pathExists) {
    return "cycle_detected";
  }
  return null;
}
