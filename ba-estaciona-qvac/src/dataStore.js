import { readFile } from "node:fs/promises";

export class LocalParkingDatabase {
  constructor({ sectors, rules }) {
    this.sectors = sectors;
    this.rules = rules;
  }

  static async fromFiles({ sectorsPath, rulesPath }) {
    const [sectors, rules] = await Promise.all([
      readJson(sectorsPath),
      readJson(rulesPath),
    ]);
    return new LocalParkingDatabase({ sectors, rules });
  }

  lookupSector(location) {
    const sector = this.sectors.find(
      (item) => item.location_id === location || item.camera_ids.includes(location),
    );
    if (!sector) throw new Error(`No local sector found for ${location}`);
    return structuredClone(sector);
  }

  lookupRules(sectorId, datetime) {
    const instant = new Date(datetime);
    if (Number.isNaN(instant.valueOf())) throw new Error(`Invalid datetime: ${datetime}`);
    const ruleSet = this.rules.find((item) => item.sector_id === sectorId);
    if (!ruleSet) {
      return {
        sector_id: sectorId,
        sourceStatus: "UNAVAILABLE",
        parkingAllowed: false,
        confidence: 0,
        explanation: "No synthetic demo rule exists for this sector.",
      };
    }

    const hour = instant.getUTCHours();
    const active = ruleSet.restrictions.find(
      (restriction) => hour >= restriction.start_hour_utc && hour < restriction.end_hour_utc,
    );
    return {
      sector_id: sectorId,
      sourceStatus: "AVAILABLE",
      parkingAllowed: !active,
      confidence: 1,
      explanation: active
        ? active.explanation
        : "No hay una restricción activa en el conjunto sintético de demostración.",
      source: ruleSet.source,
      checked_at: instant.toISOString(),
    };
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
