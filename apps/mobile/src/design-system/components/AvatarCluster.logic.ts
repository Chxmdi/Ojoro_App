/**
 * Pure rules for `AvatarCluster` (web reference `function AvatarCluster` and
 * `.oj-cluster`). No React Native imports, so it runs in Node.
 */

/** A person in a cluster or plan (index.d.ts `Person`). */
export type Person = {
  name: string;
  src?: string | undefined;
  /** Just joined: gathers into the cluster. */
  isNew?: boolean | undefined;
};

/** Avatars shown before the +N disc (web: `p.max || 5`). */
export const CLUSTER_DEFAULT_MAX = 5;

/** Each avatar after the first overlaps the one before by this much (`.oj-cluster > * + *`). */
export const CLUSTER_OVERLAP = 6;

export type ClusterModel = {
  /** The people drawn as avatars, in order. */
  shown: Person[];
  /** The +N count; 0 draws no disc. */
  extra: number;
  /** Dashed open spots after the people. */
  open: number;
  /** Everyone in: `total`, or the number of people given. */
  total: number;
  /** Group label: "6 people in, 2 open". */
  label: string;
};

function count(n: number | undefined): number {
  return n && n > 0 ? Math.floor(n) : 0;
}

export function clusterModel({
  people = [],
  total,
  max,
  open,
}: {
  people?: Person[] | undefined;
  total?: number | undefined;
  max?: number | undefined;
  open?: number | undefined;
}): ClusterModel {
  const limit = count(max) || CLUSTER_DEFAULT_MAX;
  const shown = people.slice(0, limit);
  const everyone = count(total) || people.length;
  const spots = count(open);
  return {
    shown,
    extra: Math.max(0, everyone - shown.length),
    open: spots,
    total: everyone,
    label: clusterLabel(everyone, spots),
  };
}

/**
 * The spec's group label (AvatarCluster.md): "6 people in, 2 open". One
 * deliberate difference from the web: a single person reads "1 person in".
 */
export function clusterLabel(total: number, open: number): string {
  return `${total} ${total === 1 ? 'person' : 'people'} in${open ? `, ${open} open` : ''}`;
}

/** A stable key per person: the name, with the index when names repeat. */
export function personKeys(people: Person[]): string[] {
  const seen = new Map<string, number>();
  return people.map((p) => {
    const n = seen.get(p.name) ?? 0;
    seen.set(p.name, n + 1);
    return n ? `${p.name}#${n}` : p.name;
  });
}
