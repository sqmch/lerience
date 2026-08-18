export interface PublicationFinding {
  ruleId: string;
  line: number;
  label: string;
}

export function scanPublicationText(relativePath: string, source: string): PublicationFinding[];
