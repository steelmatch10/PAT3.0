/**
 * PAT3.0 Test Suite — Utility Functions
 * Tests for app.js shared utilities
 * Run with: npm test tests/app.test.js
 */

// Note: Use Jest or Vitest framework
// Install: npm install --save-dev jest
// Add to package.json: "test": "jest"

describe("Numeric Utilities", () => {
  describe("toNumber()", () => {
    test("converts string to number", () => {
      expect(toNumber("42")).toBe(42);
      expect(toNumber("3.14")).toBe(3.14);
    });

    test("returns 0 for non-numeric strings", () => {
      expect(toNumber("abc")).toBe(0);
      expect(toNumber("")).toBe(0);
    });

    test("handles edge cases", () => {
      expect(toNumber(null)).toBe(0);
      expect(toNumber(undefined)).toBe(0);
      expect(toNumber(NaN)).toBe(0);
    });

    test("preserves numeric input", () => {
      expect(toNumber(42)).toBe(42);
      expect(toNumber(0)).toBe(0);
      expect(toNumber(-5)).toBe(-5);
    });
  });

  describe("round2()", () => {
    test("rounds to 2 decimal places", () => {
      expect(round2(3.14159)).toBe(3.14);
      expect(round2(1.005)).toBe(1.01); // JS float: 1.005*100 rounds to 101
      expect(round2(99.99)).toBe(99.99);
    });

    test("handles edge cases", () => {
      expect(round2(0)).toBe(0);
      expect(round2(-3.1459)).toBe(-3.15);
    });

    test("fixes floating point errors", () => {
      // Classic: 0.1 + 0.2 !== 0.3 in IEEE 754
      expect(round2(0.1 + 0.2)).toBe(0.30);
    });
  });
});

describe("Formatting Functions", () => {
  describe("formatMoney()", () => {
    test("formats positive numbers as currency", () => {
      expect(formatMoney(1000)).toBe("$1,000");
      expect(formatMoney(1000000)).toBe("$1,000,000");
      expect(formatMoney(42)).toBe("$42");
    });

    test("returns 'N/A' for non-finite values", () => {
      expect(formatMoney(NaN)).toBe("N/A");
      expect(formatMoney(Infinity)).toBe("N/A");
      expect(formatMoney(-Infinity)).toBe("N/A");
    });

    test("handles negative numbers", () => {
      expect(formatMoney(-1000)).toBe("-$1,000");
    });

    test("rounds to nearest dollar", () => {
      expect(formatMoney(1000.50)).toBe("$1,001");
      expect(formatMoney(1000.49)).toBe("$1,000");
    });
  });

  describe("formatPct()", () => {
    test("formats decimal as percentage", () => {
      expect(formatPct(0.05)).toBe("5.00%");
      expect(formatPct(0.125)).toBe("12.50%");
      expect(formatPct(1.0)).toBe("100.00%");
    });

    test("returns 'N/A' for non-finite values", () => {
      expect(formatPct(NaN)).toBe("N/A");
      expect(formatPct(Infinity)).toBe("N/A");
    });

    test("handles negative percentages", () => {
      expect(formatPct(-0.10)).toBe("-10.00%");
    });
  });
});

describe("KPI Banding Functions", () => {
  describe("bandCoC()", () => {
    test("rates cash-on-cash return", () => {
      expect(bandCoC(0.08).label).toBe("Great");
      expect(bandCoC(0.06).label).toBe("Good");
      expect(bandCoC(0.04).label).toBe("Okay");
      expect(bandCoC(0.01).label).toBe("Bad");
      expect(bandCoC(-0.05).label).toBe("Negative");
    });

    test("returns N/A for non-finite values", () => {
      expect(bandCoC(NaN).label).toBe("N/A");
      expect(bandCoC(Infinity).label).toBe("N/A");
    });

    test("uses correct thresholds", () => {
      // Great > 0.07
      expect(bandCoC(0.0701).label).toBe("Great");
      expect(bandCoC(0.0699).label).toBe("Good");
    });
  });

  describe("bandCapRate()", () => {
    test("rates cap rate", () => {
      expect(bandCapRate(0.15).label).toBe("Great");
      expect(bandCapRate(0.10).label).toBe("Good");
      expect(bandCapRate(0.06).label).toBe("Okay");
      expect(bandCapRate(0.02).label).toBe("Bad");
    });

    test("uses correct thresholds", () => {
      // Great > 0.12
      expect(bandCapRate(0.1201).label).toBe("Great");
      expect(bandCapRate(0.1199).label).toBe("Good");
    });
  });

  describe("bandDSCR()", () => {
    test("rates debt service coverage ratio", () => {
      expect(bandDSCR(1.5).label).toBe("Great");
      expect(bandDSCR(1.3).label).toBe("Okay");
      expect(bandDSCR(1.0).label).toBe("Bad");
    });

    test("uses correct thresholds", () => {
      // Great > 1.36
      expect(bandDSCR(1.361).label).toBe("Great");
      expect(bandDSCR(1.359).label).toBe("Okay");
    });
  });
});

describe("CSS Class Mapping", () => {
  describe("kpiClass()", () => {
    test("maps band to CSS class", () => {
      expect(kpiClass({ label: "Great" })).toBe("kpi great");
      expect(kpiClass({ label: "Good" })).toBe("kpi good");
      expect(kpiClass({ label: "Bad" })).toBe("kpi bad");
    });

    test("defaults to 'na' for unknown bands", () => {
      expect(kpiClass({ label: "Unknown" })).toBe("kpi na");
      expect(kpiClass(null)).toBe("kpi na");
    });
  });

  describe("badgeClass()", () => {
    test("maps band to badge CSS class", () => {
      expect(badgeClass({ label: "Great" })).toBe("badge great");
      expect(badgeClass({ label: "Negative" })).toBe("badge bad");
    });
  });
});

describe("Address Parsing", () => {
  describe("normalizeWhitespace()", () => {
    test("collapses multiple spaces", () => {
      expect(normalizeWhitespace("123  Main   St")).toBe("123 Main St");
    });

    test("trims leading/trailing spaces", () => {
      expect(normalizeWhitespace("  123 Main St  ")).toBe("123 Main St");
    });

    test("handles tabs and newlines", () => {
      expect(normalizeWhitespace("123\tMain\nSt")).toBe("123 Main St");
    });
  });

  describe("parseAddress()", () => {
    test("parses standard address: line1, city, state, zip", () => {
      const addr = parseAddress("123 Main St, Springfield, IL, 62701");
      expect(addr.line1).toBe("123 Main St");
      expect(addr.city).toBe("Springfield");
      expect(addr.state).toBe("IL");
      expect(addr.zip).toBe("62701");
    });

    test("extracts unit designators as line2", () => {
      const addr = parseAddress("123 Main St, Apt 4B, Springfield, IL, 62701");
      expect(addr.line1).toBe("123 Main St");
      expect(addr.line2).toBe("Apt 4B");
      expect(addr.city).toBe("Springfield");
    });

    test("recognizes various unit formats", () => {
      expect(parseAddress("123 Main, Suite 200, Springfield, IL, 62701").line2).toBe("Suite 200");
      expect(parseAddress("123 Main, Unit 5, Springfield, IL, 62701").line2).toBe("Unit 5");
      expect(parseAddress("123 Main, Ste 100, Springfield, IL, 62701").line2).toBe("Ste 100");
      expect(parseAddress("123 Main, #12, Springfield, IL, 62701").line2).toBe("#12");
    });

    test("handles single-line input", () => {
      const addr = parseAddress("123 Main St");
      expect(addr.line1).toBe("123 Main St");
      expect(addr.city).toBe("");
      expect(addr.state).toBe("");
    });

    test("extracts country when non-US", () => {
      const addr = parseAddress("123 Main St, Toronto, ON, Canada");
      expect(addr.country).toBe("Canada");
    });

    test("omits country when 'United States'", () => {
      const addr = parseAddress("123 Main St, Springfield, IL, United States");
      expect(addr.country).toBe("");
    });

    test("handles empty input", () => {
      const addr = parseAddress("");
      expect(addr.line1).toBe("");
      expect(addr.city).toBe("");
      expect(addr.state).toBe("");
    });

    test("handles malformed zip codes", () => {
      const addr = parseAddress("123 Main St, Springfield, IL, ZIP-INVALID");
      // Should treat ZIP-INVALID as country since it doesn't match ##### pattern
      expect(addr.zip).toBe("");
      expect(addr.country).toBe("ZIP-INVALID");
    });

    test("normalizes whitespace in components", () => {
      const addr = parseAddress("123   Main   St,  Springfield  ,  IL  ,  62701");
      expect(addr.line1).toBe("123 Main St");
      expect(addr.city).toBe("Springfield");
    });
  });
});

describe("Storage Functions", () => {
  // Mock localStorage for tests
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getCatalog()", () => {
    test("returns empty catalogue on first call", () => {
      const cat = getCatalog();
      expect(cat.schemaVersion).toBe("pat-1.0.0");
      expect(cat.properties).toEqual([]);
    });

    test("parses stored catalogue", () => {
      const expected = {
        schemaVersion: "pat-1.0.0",
        properties: [{ id: "123", module: "GRASP" }]
      };
      localStorage.setItem("pat_catalog", JSON.stringify(expected));
      
      const cat = getCatalog();
      expect(cat).toEqual(expected);
    });

    test("returns empty catalogue if storage is corrupted", () => {
      localStorage.setItem("pat_catalog", "{ invalid json");
      
      const cat = getCatalog();
      expect(cat.schemaVersion).toBe("pat-1.0.0");
      expect(cat.properties).toEqual([]);
    });
  });

  describe("saveCatalog()", () => {
    test("persists catalogue to localStorage", () => {
      const cat = {
        schemaVersion: "pat-1.0.0",
        properties: [{ id: "123" }]
      };
      
      saveCatalog(cat);
      
      const stored = JSON.parse(localStorage.getItem("pat_catalog"));
      expect(stored).toEqual(cat);
    });
  });

  describe("savePropertyToCatalog()", () => {
    test("adds property to catalogue", () => {
      const prop = {
        id: "123",
        module: "GRASP",
        inputs: {},
        computed: {},
        source: { address: "123 Main" },
        updatedAt: new Date().toISOString(),
        pinned: false
      };
      
      savePropertyToCatalog(prop);
      
      const cat = getCatalog();
      expect(cat.properties).toContainEqual(prop);
    });

    test("preserves existing properties", () => {
      const prop1 = { id: "1", module: "GRASP" };
      const prop2 = { id: "2", module: "FRAT" };
      
      savePropertyToCatalog(prop1);
      savePropertyToCatalog(prop2);
      
      const cat = getCatalog();
      expect(cat.properties).toHaveLength(2);
      expect(cat.properties.map(p => p.id)).toEqual(["1", "2"]);
    });
  });

  describe("updatePropertyInCatalog()", () => {
    test("updates existing property", () => {
      const prop = { id: "123", module: "GRASP", comments: "Old" };
      saveCatalog({
        schemaVersion: "pat-1.0.0",
        properties: [prop]
      });
      
      const success = updatePropertyInCatalog("123", { comments: "New" });
      
      expect(success).toBe(true);
      const cat = getCatalog();
      expect(cat.properties[0].comments).toBe("New");
    });

    test("returns false if property not found", () => {
      const success = updatePropertyInCatalog("nonexistent", {});
      expect(success).toBe(false);
    });

    test("updates timestamp", () => {
      const beforeTime = Date.now();
      saveCatalog({
        schemaVersion: "pat-1.0.0",
        properties: [{ id: "123", updatedAt: "2000-01-01T00:00:00.000Z" }]
      });

      updatePropertyInCatalog("123", {});

      const cat = getCatalog();
      const updatedMs = new Date(cat.properties[0].updatedAt).getTime();
      expect(updatedMs).toBeGreaterThanOrEqual(beforeTime);
      expect(updatedMs).toBeLessThanOrEqual(Date.now());
    });

    test("accepts updater function", () => {
      saveCatalog({
        schemaVersion: "pat-1.0.0",
        properties: [{ id: "123", value: 100 }]
      });
      
      updatePropertyInCatalog("123", (prop) => ({
        ...prop,
        value: prop.value * 2
      }));
      
      const cat = getCatalog();
      expect(cat.properties[0].value).toBe(200);
    });
  });

  describe("persistFormState() / readFormState()", () => {
    test("persists and restores form state", () => {
      const state = {
        propertyValue: "500000",
        rentPerUnitMonthly: "2000"
      };
      
      persistFormState(state);
      const restored = readFormState();
      
      expect(restored).toEqual(state);
    });

    test("returns empty object if no state saved", () => {
      const state = readFormState();
      expect(state).toEqual({});
    });

    test("handles corrupted form state", () => {
      localStorage.setItem("grasp_form", "{ invalid");
      
      const state = readFormState();
      expect(state).toEqual({});
    });
  });

  describe("saveViewMode() / readViewMode()", () => {
    test("persists view mode (monthly|annual)", () => {
      saveViewMode("annual");
      expect(readViewMode()).toBe("annual");
      
      saveViewMode("monthly");
      expect(readViewMode()).toBe("monthly");
    });

    test("defaults to 'monthly' if not set", () => {
      localStorage.removeItem("grasp_viewmode");
      expect(readViewMode()).toBe("monthly");
    });
  });
});
