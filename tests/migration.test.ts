import { beforeEach, describe, expect, it } from "vitest";
import type { GeneratedIdea, GeneratorConfig } from "../src/engine/types";
import type { GeneratorConfigV2 } from "../src/engine/v2-types";
import {
  loadConfigV2,
  loadFavoritesV2,
  loadHistoryV2,
} from "../src/storage/local";
import { makeShareUrl, parseSharedIdeaPayload } from "../src/utils/share";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const fallback: GeneratorConfigV2 = {
  mode: "single",
  selectedKinds: ["gameplay", "any"],
  locked: { left: false, right: false, prompt: false },
  excludedTagIds: [],
  excludedPromptIds: [],
  avoidRecent: true,
  seed: "fallback",
};

function setWindow(url: string): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: new URL(url) },
  });
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
  setWindow("https://tagforge.example/");
});

describe("Engine 1 compatibility", () => {
  it("migrates the old config once while retaining the V1 key", () => {
    const legacy: GeneratorConfig = {
      mode: "jam",
      surprise: 0.9,
      targetScope: 0.7,
      seed: "old-seed",
      pinnedBySlot: { mechanic: "deck-building", theme: "memory" },
      excludedTagIds: ["stealth"],
      avoidRecent: false,
    };
    localStorage.setItem("tagforge:config:v1", JSON.stringify(legacy));

    const migrated = loadConfigV2(fallback);
    expect(migrated.mode).toBe("challenge");
    expect(migrated.seed).toBe("old-seed");
    expect(migrated.excludedTagIds).toEqual(["stealth"]);
    expect(migrated.avoidRecent).toBe(false);
    expect(migrated.migratedBaseTagIds).toEqual([
      "deck-building",
      "memory",
    ]);
    expect(localStorage.getItem("tagforge:config:v1")).toBe(
      JSON.stringify(legacy),
    );

    localStorage.setItem(
      "tagforge:config:v1",
      JSON.stringify({ ...legacy, seed: "changed-after-migration" }),
    );
    expect(loadConfigV2(fallback).seed).toBe("old-seed");
  });

  it("preserves complete legacy history and favorites in V2 storage", () => {
    const history = [
      { id: "h1", tagIds: ["unknown-old-id", "memory"], createdAt: 10 },
    ];
    const favorite: GeneratedIdea = {
      id: "f1",
      seed: "legacy",
      mode: "wild",
      slots: { theme: "unknown-old-id" },
      tagIds: ["unknown-old-id", "memory"],
      metrics: {
        coherence: 0.1,
        novelty: 0.2,
        tension: 0.3,
        scope: 0.4,
        scopeFit: 0.5,
        risk: 0.6,
        freshness: 0.7,
        total: 0.8,
      },
      signals: [],
      createdAt: 20,
    };
    localStorage.setItem("tagforge:history:v1", JSON.stringify(history));
    localStorage.setItem("tagforge:favorites:v1", JSON.stringify([favorite]));

    expect(loadHistoryV2()).toEqual([
      { ...history[0], schemaVersion: 1 },
    ]);
    expect(loadFavoritesV2()).toEqual([
      { ...favorite, schemaVersion: 1 },
    ]);
    expect(JSON.parse(localStorage.getItem("tagforge:history:v1")!)).toEqual(
      history,
    );
    expect(JSON.parse(localStorage.getItem("tagforge:favorites:v1")!)).toEqual([
      favorite,
    ]);

    localStorage.setItem("tagforge:history:v2", "[]");
    localStorage.setItem("tagforge:favorites:v2", "[]");
    expect(loadHistoryV2()).toEqual([]);
    expect(loadFavoritesV2()).toEqual([]);
  });

  it("parses Engine 1 links and round-trips Engine 2 links", () => {
    setWindow(
      "https://tagforge.example/?engine=1&mode=jam&seed=old&tags=memory,removed-id",
    );
    expect(parseSharedIdeaPayload()).toEqual({
      engine: 1,
      mode: "jam",
      seed: "old",
      tagIds: ["memory", "removed-id"],
    });

    setWindow("https://tagforge.example/?view=favorites");
    const link = makeShareUrl({
      id: "v2:test",
      schemaVersion: 2,
      mode: "challenge",
      seed: "new-seed",
      baseTagIds: ["deck-building", "stealth"],
      promptId: "unreliable-map",
      createdAt: 30,
    });
    setWindow(link);
    expect(parseSharedIdeaPayload()).toEqual({
      engine: 2,
      mode: "challenge",
      seed: "new-seed",
      baseTagIds: ["deck-building", "stealth"],
      promptId: "unreliable-map",
    });
    expect(new URL(link).searchParams.get("data")).toBe("2026.07.2");
  });
});
