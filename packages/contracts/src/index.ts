export type OjoroIntent = {
  activity: string;
  startsAfter?: string;
  startsBefore?: string;
  radiusKm?: number;
};

export type PlanState =
  | 'idea'
  | 'intent'
  | 'forming'
  | 'proposed'
  | 'confirmed'
  | 'live'
  | 'completed'
  | 'verified'
  | 'recap'
  | 'archived';
