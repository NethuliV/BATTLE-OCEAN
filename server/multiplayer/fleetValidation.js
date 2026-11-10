/**
 * Pure ship-placement validation logic, extracted from multiplayerHandler.js
 * so it can be unit-tested without spinning up Socket.IO or Mongoose.
 *
 * Both multiplayerHandler.js and the unit tests import from here.
 * The logic is identical to what was in multiplayerHandler.js.
 */

const { SHIP_LENGTHS, TOTAL_SHIP_CELLS } = require("../../shared/shipRules");

/**
 * Normalises and validates a fleet against a given grid size.
 * Returns the sorted, deduplicated fleet on success, or null on any error.
 *
 * Rules enforced:
 *   1. Exactly SHIP_LENGTHS.length ships, in the right order.
 *   2. Each ship has exactly the required number of unique integer cells.
 *   3. All cells are within [0, gridSize*gridSize).
 *   4. Each ship is a contiguous horizontal OR vertical line.
 *   5. No two ships overlap or touch (including diagonals).
 *
 * @param {number[][]} fleet
 * @param {number}     gridSize
 * @returns {number[][] | null}
 */
function normalizeFleet(fleet, gridSize) {
  if (!Array.isArray(fleet) || fleet.length !== SHIP_LENGTHS.length) {
    return null;
  }

  const normalized = [];
  const occupied = new Set();

  for (let i = 0; i < SHIP_LENGTHS.length; i++) {
    const ship = fleet[i];
    const requiredLength = SHIP_LENGTHS[i];

    if (!Array.isArray(ship) || ship.length !== requiredLength) {
      return null;
    }

    const uniqueCells = [...new Set(ship.map((cell) => Number(cell)))];

    if (uniqueCells.length !== requiredLength) {
      return null;
    }

    const sorted = uniqueCells.sort((a, b) => a - b);
    const rows = sorted.map((cell) => Math.floor(cell / gridSize));
    const cols = sorted.map((cell) => cell % gridSize);
    const sameRow = rows.every((row) => row === rows[0]);
    const sameCol = cols.every((col) => col === cols[0]);

    if (!sameRow && !sameCol) {
      return null;
    }

    if (sameRow) {
      for (let j = 1; j < sorted.length; j++) {
        if (sorted[j] !== sorted[j - 1] + 1) {
          return null;
        }
      }
    }

    if (sameCol) {
      for (let j = 1; j < sorted.length; j++) {
        if (sorted[j] !== sorted[j - 1] + gridSize) {
          return null;
        }
      }
    }

    // Build a set of this ship's cells so the adjacency check can distinguish
    // same-ship neighbours (always adjacent, always OK) from other-ship cells.
    const shipSet = new Set(sorted);

    // Reject if any cell is out of bounds or overlaps a previously-placed ship.
    for (const cell of sorted) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= gridSize * gridSize) {
        return null;
      }

      if (occupied.has(cell)) {
        return null;
      }
    }

    // Reject if any cell is adjacent (including diagonal) to a cell from a
    // *different* ship that was placed earlier.
    for (const cell of sorted) {
      const row = Math.floor(cell / gridSize);
      const col = cell % gridSize;

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
          if (rowOffset === 0 && colOffset === 0) {
            continue;
          }

          const nextRow = row + rowOffset;
          const nextCol = col + colOffset;

          if (
            nextRow < 0 ||
            nextRow >= gridSize ||
            nextCol < 0 ||
            nextCol >= gridSize
          ) {
            continue;
          }

          const nextCell = nextRow * gridSize + nextCol;

          // Only reject if the neighbour belongs to a *previously placed* ship.
          if (occupied.has(nextCell) && !shipSet.has(nextCell)) {
            return null;
          }
        }
      }
    }

    // All checks passed – commit this ship's cells to the global occupied set.
    for (const cell of sorted) {
      occupied.add(cell);
    }

    normalized.push(sorted);
  }

  return normalized;
}

/**
 * Returns true if the fleet is valid and contains exactly TOTAL_SHIP_CELLS cells.
 *
 * @param {number[][]} fleet
 * @param {number}     gridSize
 * @returns {boolean}
 */
function validateFleet(fleet, gridSize) {
  if (!Array.isArray(fleet) || fleet.length !== SHIP_LENGTHS.length) {
    return false;
  }

  const normalizedFleet = normalizeFleet(fleet, gridSize);

  if (!normalizedFleet) {
    return false;
  }

  return normalizedFleet.reduce((total, ship) => total + ship.length, 0) === TOTAL_SHIP_CELLS;
}

module.exports = { normalizeFleet, validateFleet, SHIP_LENGTHS, TOTAL_SHIP_CELLS };
