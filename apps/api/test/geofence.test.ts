import { parseCoordinates } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { distanceMeters, evaluateGeofence, type GeofenceSite } from "../src/modules/attendance/geofence.js";

// Verifikasi feature 44: rumus jarak & status geofence (murni, tanpa DB).

// 1° lintang = π/180 × 6.371.008,8 m
const METERS_PER_DEGREE = 111_194.93;
const at = (meters: number, base = KEDAI): { latitude: number; longitude: number } => ({
  latitude: base.latitude + meters / METERS_PER_DEGREE,
  longitude: base.longitude,
});

const KEDAI: GeofenceSite = { name: "Kedai Pettarani", latitude: -5.15672, longitude: 119.43628, radiusM: 100 };
const GUDANG: GeofenceSite = { name: "Gudang Roasting Tamalanrea", latitude: -5.13241, longitude: 119.4881, radiusM: 150 };

describe("distanceMeters", () => {
  it("cocok dengan nilai acuan haversine", () => {
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(METERS_PER_DEGREE, 0);
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(METERS_PER_DEGREE, 0);
    // Separuh keliling bumi
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })).toBeCloseTo(Math.PI * 6_371_008.8, 0);
  });

  it("titik yang sama = 0 dan simetris", () => {
    expect(distanceMeters(KEDAI, KEDAI)).toBe(0);
    expect(distanceMeters(KEDAI, GUDANG)).toBeCloseTo(distanceMeters(GUDANG, KEDAI), 6);
  });

  it("jarak Kedai Pettarani → Gudang Tamalanrea ±6,3 km", () => {
    const d = distanceMeters(KEDAI, GUDANG);
    expect(d).toBeGreaterThan(6_200);
    expect(d).toBeLessThan(6_400);
  });

  it("bujur menyempit mengikuti lintang (cos φ)", () => {
    // Di lintang 60°, 1° bujur ≈ setengah 1° di khatulistiwa
    expect(distanceMeters({ latitude: 60, longitude: 0 }, { latitude: 60, longitude: 1 })).toBeCloseTo(METERS_PER_DEGREE / 2, -2);
  });
});

describe("evaluateGeofence", () => {
  it("tanpa lokasi kerja → tidak dicek (null), walau GPS ada atau tidak", () => {
    expect(evaluateGeofence({ ...at(10), accuracy: 5 }, [])).toBeNull();
    expect(evaluateGeofence(null, [])).toBeNull();
  });

  it("GPS ditolak → no_location tanpa jarak", () => {
    expect(evaluateGeofence(null, [KEDAI])).toEqual({ status: "no_location", distanceM: null, locationName: null });
  });

  it("di dalam radius → inside + jarak ke pusat", () => {
    expect(evaluateGeofence({ ...at(40), accuracy: 12 }, [KEDAI])).toEqual({ status: "inside", distanceM: 40, locationName: "Kedai Pettarani" });
  });

  it("tepat di batas radius masih inside; lewat 1 m → outside", () => {
    expect(evaluateGeofence({ ...at(99.6), accuracy: 10 }, [KEDAI])?.status).toBe("inside");
    expect(evaluateGeofence({ ...at(101), accuracy: 10 }, [KEDAI])).toEqual({ status: "outside", distanceM: 101, locationName: "Kedai Pettarani" });
  });

  it("di luar radius → outside + jarak benar", () => {
    expect(evaluateGeofence({ ...at(320), accuracy: 10 }, [KEDAI])).toEqual({ status: "outside", distanceM: 320, locationName: "Kedai Pettarani" });
    expect(evaluateGeofence({ ...at(-2_400), accuracy: 15 }, [KEDAI])).toEqual({ status: "outside", distanceM: 2_400, locationName: "Kedai Pettarani" });
  });

  it("akurasi lebih besar dari radius → inaccurate (walau titiknya di dalam radius)", () => {
    expect(evaluateGeofence({ ...at(30), accuracy: 450 }, [KEDAI])).toEqual({ status: "inaccurate", distanceM: 30, locationName: "Kedai Pettarani" });
    expect(evaluateGeofence({ ...at(900), accuracy: 450 }, [KEDAI])?.status).toBe("inaccurate");
    // Akurasi = radius masih dianggap akurat
    expect(evaluateGeofence({ ...at(30), accuracy: 100 }, [KEDAI])?.status).toBe("inside");
  });

  it("akurasi tidak dilaporkan browser → dianggap akurat", () => {
    expect(evaluateGeofence({ ...at(30), accuracy: null }, [KEDAI])?.status).toBe("inside");
    expect(evaluateGeofence({ ...at(500), accuracy: null }, [KEDAI])?.status).toBe("outside");
  });

  it("banyak lokasi: inside jika di salah satu radius, jarak & nama lokasi terdekat", () => {
    const nearGudang = { ...at(60, GUDANG), accuracy: 8 };
    expect(evaluateGeofence(nearGudang, [KEDAI, GUDANG])).toEqual({ status: "inside", distanceM: 60, locationName: "Gudang Roasting Tamalanrea" });
    expect(evaluateGeofence({ ...at(1_200, GUDANG), accuracy: 8 }, [KEDAI, GUDANG])).toEqual({
      status: "outside",
      distanceM: 1_200,
      locationName: "Gudang Roasting Tamalanrea",
    });
  });

  it("terdekat diukur ke tepi radius: lokasi beradius besar menang walau pusatnya sedikit lebih jauh", () => {
    const small: GeofenceSite = { name: "Kecil", ...at(0), radiusM: 25 };
    const big: GeofenceSite = { name: "Besar", ...at(300), radiusM: 1000 };
    // 200 m dari Kecil (175 m di luar tepi), 100 m dari pusat Besar (di dalam)
    expect(evaluateGeofence({ ...at(200), accuracy: 10 }, [small, big])).toEqual({ status: "inside", distanceM: 100, locationName: "Besar" });
  });

  it("akurasi dibandingkan dengan radius lokasi terdekat", () => {
    const point = { ...at(60, GUDANG), accuracy: 120 };
    // Radius Gudang 150 ≥ 120 → akurat; hanya Kedai (radius 100) → inaccurate
    expect(evaluateGeofence(point, [KEDAI, GUDANG])?.status).toBe("inside");
    expect(evaluateGeofence({ ...at(60), accuracy: 120 }, [KEDAI])?.status).toBe("inaccurate");
  });
});

describe("parseCoordinates", () => {
  it("menerima tempelan dari aplikasi peta", () => {
    expect(parseCoordinates("-5.15672, 119.43628")).toEqual({ latitude: -5.15672, longitude: 119.43628 });
    expect(parseCoordinates("  -5.15672,119.43628 ")).toEqual({ latitude: -5.15672, longitude: 119.43628 });
    expect(parseCoordinates("-5.15672 119.43628")).toEqual({ latitude: -5.15672, longitude: 119.43628 });
    expect(parseCoordinates("-5.15672; 119.43628")).toEqual({ latitude: -5.15672, longitude: 119.43628 });
  });

  it("menolak format lain & nilai di luar rentang", () => {
    expect(parseCoordinates("")).toBeNull();
    expect(parseCoordinates("-5,15672, 119,43628")).toBeNull();
    expect(parseCoordinates("Jl. Pettarani")).toBeNull();
    expect(parseCoordinates("95, 119")).toBeNull();
    expect(parseCoordinates("-5, 181")).toBeNull();
  });
});
