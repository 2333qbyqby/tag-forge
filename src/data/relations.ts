import relationCatalog from "../../data-src/relations.json";
import type { RelationKind, TagRelation } from "../engine/types";

type RelationTuple = [
  a: string,
  b: string,
  strength: number,
  confidence: number,
  note?: string,
];

const entries = relationCatalog as unknown as Record<string, RelationTuple[]>;

export const relations: TagRelation[] = Object.entries(entries).flatMap(
  ([kind, tuples]) =>
    tuples.map(([a, b, strength, confidence, note]) => ({
      a,
      b,
      kind: kind as RelationKind,
      strength,
      confidence,
      note,
    })),
);
