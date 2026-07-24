export interface WorkTarget {
  readonly recordType: string;
  readonly recordId: string;
  readonly action: string;
  readonly version: number;
  readonly title?: string;
}
