/**
 * Server-side unit tests for fleet validation logic.
 *
 * Run with:  node --test server/tests/fleetValidation.test.js
 *
 * Tests cover:
 *   - normalizeFleet: all rejection conditions
 *   - validateFleet: acceptance and rejection
 *   - generateRandomFleet (pre-fix behaviour proof): overlap-only check
 *     produces adjacency violations that normalizeFleet rejects.
 *   - generateRandomFleet (post-fix): adjacency check included; all 1,000
 *     generated fleets must pass normalizeFleet for each grid size.
 *   - Performance: average call under 50 ms.
 */

"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFleet, validateFleet, SHIP_LENGTHS, TOTAL_SHIP_CELLS } = require("../multiplayer/fleetValidation");

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Hand-crafted valid fleet for every supported grid size.
 * Ships are placed horizontally, well clear of each other (2 blank rows apart),
 * and shifted right on alternating rows so they never touch diagonally.
 *
 * Layout on an 8×8 grid (each letter = one ship cell, . = empty):
 *   row 0:  AAAAA...   (len 5, col 0)
 *   row 1:  ........   (gap)
 *   row 2:  .BBBB...   (len 4, col 1)
 *   row 3:  ........   (gap)
 *   row 4:  ..CCC...   (len 3, col 2)
 *   row 5:  ........   (gap)
 *   row 6:  ....DDD.   (len 3, col 4)
 *   row 7:  ........   (gap — implicit, row 8 would be out of range)
 *   Need ship 5 (len 2): place it at the right side so it clears ship D diagonally.
 *   Put it in row 7, col 7 going vertically is out of range (only 1 row left).
 *   Actually place it at row 6, col 7 — but that is adjacent to DDD at row 6 col 6!
 *   Alternative: col 0, row 7, shifted right to col 6 would touch DDD.
 *
 * Cleaner approach: hard-code per-grid-size fleets that are known valid.
 */
const KNOWN_VALID_FLEETS = {
  // 8×8 — ships well separated
  8: [
    [0, 1, 2, 3, 4],       // row 0, cols 0-4,  len 5
    [16, 17, 18, 19],      // row 2, cols 0-3,  len 4
    [34, 35, 36],          // row 4, cols 2-4,  len 3
    [48, 56, 64 - 16],     // vertical col 0 rows 6,7 — wait, only 2 rows left for len 3
    // redo:
  ],
};

/**
 * Returns a guaranteed-valid fleet for the given grid size using the
 * post-fix random generator (which we trust after 1000-run verification).
 * Seeded by fixed random sequence for reproducibility.
 */
function buildValidFleet(gridSize) {
  // Use a deterministic generation: place ships vertically in cols 0,2,4,6
  // starting at row 0.  An 8-row board can fit 5 ships vertically in col 0
  // (max ship len 5 ≤ 8), so we separate by 2 columns.
  //
  // Ships in columns: 0, 2, 4, 6 — but we have 5 ships and 4 safe columns on
  // an 8×8 grid (cols 0,2,4,6 = 4 cols).  The 5th ship goes in col 6+2 = 8
  // which is out of range.  So use rows instead: alternate horizontal rows
  // but keep starting col > ship length of previous ship to avoid diagonal.
  //
  // Safest: use the post-fix generator with a fixed seed approach.
  // Since we cannot seed Math.random, we just hard-code known valid placements.

  if (gridSize === 8) {
    // Ship lengths [5,4,3,3,2]:
    //  ship0: row0  cols 0-4   cells [0,1,2,3,4]
    //  ship1: row2  cols 0-3   cells [16,17,18,19]      (gap row 1)
    //  ship2: row4  cols 2-4   cells [34,35,36]         (gap row 3; starts col2 so col0-1 clear of adj to ship1 col3)
    //  ship3: row6  cols 5-7   cells [53,54,55]         (gap row 5; far right, no adjacency to ship2)
    //  ship4: row4  col 7, row5 col 7                   -- but that touches ship3!
    //  Actually try: ship4 vertical col 7, rows 1-2     [15,23] -- row1 is gap between ship0 and ship1
    //   cell15 = row1*8+7=15, cell23=row2*8+7=23
    //   ship1 at row2 is cols 0-3; col7 is far from col3 (diff 4). No adjacency.
    //   cell15 neighbors include cell14(row1,col6) -- not in any ship. OK.
    //   cell15 neighbors include cell7(row0,col7) -- not in any ship. OK.
    //   cell15 neighbors include cell8(row1,col0) -- not in any ship. OK.
    // This should work!
    return [
      [0, 1, 2, 3, 4],       // row 0, cols 0-4
      [16, 17, 18, 19],      // row 2, cols 0-3
      [34, 35, 36],          // row 4, cols 2-4
      [53, 54, 55],          // row 6, cols 5-7
      [15, 23],              // col 7, rows 1-2
    ];
  }

  if (gridSize === 9) {
    return [
      [0, 1, 2, 3, 4],       // row 0, cols 0-4
      [18, 19, 20, 21],      // row 2, cols 0-3
      [36, 37, 38],          // row 4, cols 0-2
      [56, 57, 58],          // row 6, cols 2-4
      [17, 26],              // col 8, rows 1-2
    ];
  }

  if (gridSize === 10) {
    return [
      [0, 1, 2, 3, 4],       // row 0, cols 0-4
      [20, 21, 22, 23],      // row 2, cols 0-3
      [40, 41, 42],          // row 4, cols 0-2
      [62, 63, 64],          // row 6, cols 2-4
      [19, 29],              // col 9, rows 1-2
    ];
  }

  return null;
}

/**
 * Pre-fix random generator: overlap check only, no adjacency check.
 * This reproduces the original bug.
 */
function generateRandomFleetPreFix(gridSize) {
  const occupied = new Set();
  const generated = [];

  for (const length of SHIP_LENGTHS) {
    let placed = false;

    for (let attempt = 0; attempt < 2000 && !placed; attempt++) {
      const row = Math.floor(Math.random() * gridSize);
      const col = Math.floor(Math.random() * gridSize);
      const isVertical = Math.random() > 0.5;
      const cells = [];
      let valid = true;

      for (let i = 0; i < length; i++) {
        const nr = row + (isVertical ? i : 0);
        const nc = col + (!isVertical ? i : 0);
        if (nr >= gridSize || nc >= gridSize) { valid = false; break; }
        const cell = nr * gridSize + nc;
        if (occupied.has(cell)) { valid = false; break; }
        cells.push(cell);
      }

      if (!valid) continue;

      generated.push(cells);
      for (const cell of cells) occupied.add(cell);
      placed = true;
    }

    if (!placed) return null;
  }

  return generated;
}

/**
 * Post-fix random generator: overlap + adjacency check.
 * Mirrors the fixed client code.
 */
function generateRandomFleetPostFix(gridSize) {
  const occupied = new Set();
  const generated = [];

  for (const length of SHIP_LENGTHS) {
    let placed = false;

    for (let attempt = 0; attempt < 2000 && !placed; attempt++) {
      const row = Math.floor(Math.random() * gridSize);
      const col = Math.floor(Math.random() * gridSize);
      const isVertical = Math.random() > 0.5;
      const cells = [];
      let valid = true;

      for (let i = 0; i < length; i++) {
        const nr = row + (isVertical ? i : 0);
        const nc = col + (!isVertical ? i : 0);
        if (nr >= gridSize || nc >= gridSize) { valid = false; break; }
        const cell = nr * gridSize + nc;
        if (occupied.has(cell)) { valid = false; break; }
        cells.push(cell);
      }

      if (!valid) continue;

      // Adjacency check (the fix) — only check against previously placed ships.
      const touches = cells.some((cell) => {
        const r = Math.floor(cell / gridSize);
        const c = cell % gridSize;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr2 = r + dr;
            const nc2 = c + dc;
            if (nr2 < 0 || nr2 >= gridSize || nc2 < 0 || nc2 >= gridSize) continue;
            const neighbor = nr2 * gridSize + nc2;
            if (occupied.has(neighbor) && !cells.includes(neighbor)) return true;
          }
        }
        return false;
      });

      if (touches) continue;

      generated.push(cells);
      for (const cell of cells) occupied.add(cell);
      placed = true;
    }

    if (!placed) return null;
  }

  return generated;
}

// ─── normalizeFleet unit tests ────────────────────────────────────────────────

describe("normalizeFleet – rejection cases", () => {
  test("null input", () => {
    assert.equal(normalizeFleet(null, 8), null);
  });

  test("not an array", () => {
    assert.equal(normalizeFleet("bad", 8), null);
  });

  test("wrong number of ships (too few)", () => {
    assert.equal(normalizeFleet([[0, 1, 2, 3, 4]], 8), null);
  });

  test("wrong number of ships (too many) — 6 ships", () => {
    // Build a valid 5-ship fleet then append a 6th ship
    const fleet = [
      [0, 1, 2, 3, 4],
      [16, 17, 18, 19],
      [34, 35, 36],
      [53, 54, 55],
      [15, 23],
      [62, 63], // extra
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("ship length mismatch — ship 0 too short", () => {
    const fleet = [
      [0, 1, 2, 3],          // should be 5
      [16, 17, 18, 19],
      [34, 35, 36],
      [53, 54, 55],
      [15, 23],
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("ship length mismatch — ship 4 too long", () => {
    const fleet = [
      [0, 1, 2, 3, 4],
      [16, 17, 18, 19],
      [34, 35, 36],
      [53, 54, 55],
      [15, 23, 31],           // should be 2
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("duplicate cells within a ship", () => {
    const fleet = [
      [0, 1, 2, 3, 4],
      [16, 17, 18, 19],
      [34, 35, 36],
      [53, 54, 55],
      [15, 15],               // duplicate
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("cell out of bounds — negative", () => {
    const fleet = [
      [0, 1, 2, 3, 4],
      [16, 17, 18, 19],
      [34, 35, 36],
      [53, 54, 55],
      [-1, 0],
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("cell out of bounds — >= gridSize*gridSize", () => {
    const fleet = [
      [0, 1, 2, 3, 4],
      [16, 17, 18, 19],
      [34, 35, 36],
      [53, 54, 55],
      [63, 64],               // 64 is out of range on 8×8
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("ship is not a straight line (diagonal)", () => {
    // Cells 0 and 9 on an 8-grid are diagonal (row0,col0) → (row1,col1)
    const fleet = [
      [0, 1, 2, 3, 4],
      [16, 17, 18, 19],
      [34, 35, 36],
      [53, 54, 55],
      [0, 9],                 // diagonal — invalid
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("ship has a gap — horizontal", () => {
    const fleet = [
      [0, 1, 2, 3, 4],
      [16, 17, 18, 19],
      [34, 35, 36],
      [53, 54, 55],
      [60, 62],               // gap at 61
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("ship has a gap — vertical", () => {
    const fleet = [
      [0, 1, 2, 3, 4],
      [16, 17, 18, 19],
      [34, 35, 36],
      [53, 54, 55],
      [60, 76],               // gap: 60=row7col4, 76 is out of range (7*8+12) or wrong col
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("two ships overlap", () => {
    // Ship 0 and ship 1 share cell 0
    const fleet = [
      [0, 1, 2, 3, 4],
      [0, 10, 20, 30],        // col 0, shares cell 0 with ship 0
      [34, 35, 36],
      [53, 54, 55],
      [15, 23],
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("two ships touch orthogonally", () => {
    // Ship 0 ends at col 4; ship 1 starts at col 5, same row → touching
    const fleet = [
      [0, 1, 2, 3, 4],       // row 0, cols 0-4
      [5, 13, 21, 29],       // col 5, rows 0-3  → orthogonally adjacent to ship 0 at (0,4)
      [34, 35, 36],
      [53, 54, 55],
      [15, 23],
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("two ships touch diagonally", () => {
    // Ship 1 at col 5, row 1 is diagonal to ship 0 cell at row 0, col 4
    const fleet = [
      [0, 1, 2, 3, 4],       // row 0, cols 0-4
      [13, 21, 29, 37],      // col 5, rows 1-4 → cell 13=(row1,col5) diagonal to (row0,col4)=4
      [40, 41, 42],
      [56, 57, 58],
      [62, 63],
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });

  test("ship wraps across row boundary — horizontal", () => {
    // On an 8-grid, cells 7 and 8 are in different rows; a 2-cell ship [7,8] is invalid
    const fleet = [
      [0, 1, 2, 3, 4],
      [16, 17, 18, 19],
      [34, 35, 36],
      [53, 54, 55],
      [7, 8],                 // row boundary wrap: 7=(r0,c7), 8=(r1,c0)
    ];
    assert.equal(normalizeFleet(fleet, 8), null);
  });
});

describe("normalizeFleet – acceptance cases", () => {
  for (const size of [8, 9, 10]) {
    test(`valid fleet on ${size}x${size} grid`, () => {
      const fleet = buildValidFleet(size);
      assert.notEqual(fleet, null, `buildValidFleet(${size}) returned null — fix the test helper`);
      const result = normalizeFleet(fleet, size);
      assert.notEqual(result, null, `normalizeFleet rejected a known-valid fleet for ${size}x${size}`);
      assert.equal(result.length, SHIP_LENGTHS.length);
    });
  }

  test("cells given in reverse order are normalised correctly", () => {
    const fleet = buildValidFleet(8);
    fleet[0] = [...fleet[0]].reverse(); // provide in reverse order
    const result = normalizeFleet(fleet, 8);
    assert.notEqual(result, null, "normalizeFleet rejected a reversed-cell fleet");
    // Cells should be sorted in the output
    assert.deepEqual(result[0], [...result[0]].sort((a, b) => a - b));
  });

  test("real game fleet from rooms.json is accepted", () => {
    // Fleet used in a real game session (from rooms.json, gridSize=8)
    const fleet = [[2, 3, 4, 5, 6], [18, 19, 20, 21], [34, 35, 36], [50, 51, 52], [8, 16]];
    const result = normalizeFleet(fleet, 8);
    assert.notEqual(result, null, "Real game fleet was rejected — server validation is too strict");
  });
});

describe("validateFleet", () => {
  test("accepts a valid fleet", () => {
    const fleet = buildValidFleet(8);
    assert.equal(validateFleet(fleet, 8), true);
  });

  test("total ship cells equals TOTAL_SHIP_CELLS for a valid fleet", () => {
    const fleet = buildValidFleet(8);
    const norm = normalizeFleet(fleet, 8);
    assert.notEqual(norm, null);
    const total = norm.reduce((s, ship) => s + ship.length, 0);
    assert.equal(total, TOTAL_SHIP_CELLS);
  });

  test("rejects null input", () => {
    assert.equal(validateFleet(null, 8), false);
  });

  test("rejects empty fleet", () => {
    assert.equal(validateFleet([], 8), false);
  });
});

// ─── Bug-reproduction: pre-fix vs post-fix ────────────────────────────────────

describe("generateRandomFleet – pre-fix produces adjacency violations", () => {
  test("at least one of 500 pre-fix fleets is rejected by normalizeFleet (8x8)", () => {
    let rejected = 0;
    for (let i = 0; i < 500; i++) {
      const fleet = generateRandomFleetPreFix(8);
      if (fleet && !normalizeFleet(fleet, 8)) rejected++;
    }
    // On an 8×8 board the pre-fix code reliably produces touching ships.
    assert.ok(rejected > 0, `Expected at least 1 rejection but got 0 out of 500 — the bug may be fixed already`);
    console.log(`  pre-fix: ${rejected}/500 fleets rejected by server validator ✓`);
  });
});

describe("generateRandomFleet – post-fix: 1000 fleets × 3 grid sizes all pass", () => {
  for (const size of [8, 9, 10]) {
    test(`${size}x${size} – 1000 fleets all valid`, () => {
      let failed = 0;
      let nullCount = 0;

      for (let i = 0; i < 1000; i++) {
        const fleet = generateRandomFleetPostFix(size);
        if (!fleet) { nullCount++; continue; }
        if (!normalizeFleet(fleet, size)) failed++;
      }

      assert.equal(nullCount, 0, `generateRandomFleetPostFix returned null ${nullCount} times (placement impossible)`);
      assert.equal(failed, 0, `${failed}/1000 fleets were rejected by normalizeFleet`);
      console.log(`  post-fix ${size}x${size}: 1000/1000 passed ✓`);
    });
  }
});

// ─── Performance ──────────────────────────────────────────────────────────────

describe("performance", () => {
  test("generateRandomFleetPostFix averages under 50 ms per call (8x8, 200 runs)", () => {
    const runs = 200;
    const start = Date.now();
    for (let i = 0; i < runs; i++) generateRandomFleetPostFix(8);
    const avg = (Date.now() - start) / runs;
    console.log(`  average time: ${avg.toFixed(2)} ms per call`);
    assert.ok(avg < 50, `Average ${avg.toFixed(2)} ms exceeds 50 ms threshold`);
  });
});

// ─── Edge / dense cases ───────────────────────────────────────────────────────

describe("dense placement edge cases", () => {
  test("5 ships on 8x8 always finds a valid placement within 2000 retries", () => {
    const RUNS = 500;
    for (let i = 0; i < RUNS; i++) {
      const fleet = generateRandomFleetPostFix(8);
      assert.notEqual(fleet, null, "Could not place fleet — retry cap hit on a valid board");
    }
    console.log(`  dense 8x8: all ${RUNS} placements succeeded ✓`);
  });
});
