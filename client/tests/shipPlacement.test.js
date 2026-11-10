import { describe, it, expect } from 'vitest';
import {
  generateRandomFleet,
  canPlaceShip,
  SHIPS,
  TOTAL_SHIP_CELLS,
  VALID_GRID_SIZES,
} from '../src/utils/shipPlacement.js';
import {
  normalizeFleet,
  validateFleet,
  SHIP_LENGTHS as SERVER_SHIP_LENGTHS,
  TOTAL_SHIP_CELLS as SERVER_TOTAL_CELLS,
} from '../../server/multiplayer/fleetValidation.js';
import sharedRules from '../../shared/shipRules.json';

describe('Cross-validation: Client and Server rule alignment', () => {
  it('client SHIPS matches server SHIP_LENGTHS and shared rules', () => {
    expect(SHIPS).toEqual(SERVER_SHIP_LENGTHS);
    expect(SHIPS).toEqual(sharedRules.SHIP_LENGTHS);
    expect(SHIPS).toEqual([5, 4, 3, 3, 2]);
  });

  it('client total ship cells matches server total and shared rules', () => {
    expect(TOTAL_SHIP_CELLS).toBe(SERVER_TOTAL_CELLS);
    expect(TOTAL_SHIP_CELLS).toBe(sharedRules.TOTAL_SHIP_CELLS);
    expect(TOTAL_SHIP_CELLS).toBe(17);
  });

  it('valid grid sizes match between client and shared config', () => {
    expect(VALID_GRID_SIZES).toEqual(sharedRules.VALID_GRID_SIZES);
    expect(VALID_GRID_SIZES).toEqual([8, 9, 10]);
  });

  it('client canPlaceShip rejects overlapping ships', () => {
    const occupied = new Set([0, 1, 2]);
    expect(canPlaceShip([2, 3], occupied, 8)).toBe(false);
  });

  it('client canPlaceShip rejects orthogonally adjacent ships', () => {
    // Ship occupying row 0, cols 0-4 (cells 0..4)
    const occupied = new Set([0, 1, 2, 3, 4]);
    // Candidate ship in col 5, same row (cell 5 is right next to cell 4)
    expect(canPlaceShip([5, 13], occupied, 8)).toBe(false);
  });

  it('client canPlaceShip rejects diagonally adjacent ships', () => {
    // Cell 0 at (0, 0)
    const occupied = new Set([0]);
    // Candidate starting at cell 9 (1, 1) diagonal to cell 0
    expect(canPlaceShip([9, 17], occupied, 8)).toBe(false);
  });

  it('client canPlaceShip accepts legally separated ships', () => {
    const occupied = new Set([0, 1, 2, 3, 4]); // row 0
    // Candidate at row 2 (cells 16, 17) with row 1 completely clear
    expect(canPlaceShip([16, 17], occupied, 8)).toBe(true);
  });
});

describe('generateRandomFleet 1,000 runs validated against server normalizeFleet', () => {
  for (const size of [8, 9, 10]) {
    it(`generates 1,000 valid fleets for ${size}x${size} grid with 100% acceptance`, () => {
      let nullCount = 0;
      let serverRejectionCount = 0;

      for (let i = 0; i < 1000; i++) {
        const fleet = generateRandomFleet(size, SHIPS);
        if (!fleet) {
          nullCount++;
          continue;
        }

        const normalized = normalizeFleet(fleet, size);
        if (!normalized) {
          serverRejectionCount++;
        } else {
          expect(validateFleet(normalized, size)).toBe(true);
        }
      }

      expect(nullCount).toBe(0);
      expect(serverRejectionCount).toBe(0);
    });
  }
});

describe('generateRandomFleet performance and safety', () => {
  it('averages well under 50ms per call (measured across 200 calls on 8x8)', () => {
    const iterations = 200;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const fleet = generateRandomFleet(8, SHIPS);
      expect(fleet).not.toBeNull();
    }

    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;
    console.log(`Vitest: generateRandomFleet avg time: ${avgMs.toFixed(3)} ms`);

    expect(avgMs).toBeLessThan(50);
  });

  it('safely returns null when ships cannot physically fit', () => {
    // Asking for a ship of length 15 on an 8x8 grid should fail safely without infinite loop
    const impossibleFleet = generateRandomFleet(8, [15, 12]);
    expect(impossibleFleet).toBeNull();
  });

  it('dense placement: successfully places 5 ships on 8x8 even over 300 iterations', () => {
    for (let i = 0; i < 300; i++) {
      const fleet = generateRandomFleet(8, SHIPS);
      expect(fleet).not.toBeNull();
      expect(fleet.length).toBe(SHIPS.length);
    }
  });
});
