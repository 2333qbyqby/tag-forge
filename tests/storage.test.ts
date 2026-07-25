import "fake-indexeddb/auto";
import { packChecksum } from "../src/packs/canonical";
import { officialData } from "./fixtures";

describe("development IndexedDB storage", () => {
  it("replaces an installed pack by ID", async () => {
    const storage = await import("../src/storage/db");
    await storage.clearAllLocalData();
    const first = {
      ...officialData,
      manifest: {
        ...officialData.manifest,
        packId: "replace-pack",
        dataVersion: "2026.07.24",
      },
    };
    const second = {
      ...first,
      manifest: {
        ...first.manifest,
        dataVersion: "2026.07.25",
        name: { zh: "替换后", en: "Replaced" },
      },
    };
    const firstChecksum = await packChecksum(first);
    const secondChecksum = await packChecksum(second);
    await storage.installPack(first, firstChecksum);
    await storage.installPack(second, secondChecksum);

    const installed = await storage.listInstalledPacks();
    expect(installed).toHaveLength(1);
    expect(installed[0].key).toBe("replace-pack");
    expect(installed[0].ref).toEqual({
      packId: "replace-pack",
      dataVersion: "2026.07.25",
      checksum: secondChecksum,
    });
    expect((await storage.loadInstalledPack("replace-pack"))?.data.manifest.name.zh)
      .toBe("替换后");
    expect(firstChecksum).not.toBe(secondChecksum);
    await storage.clearAllLocalData();
  });
});
