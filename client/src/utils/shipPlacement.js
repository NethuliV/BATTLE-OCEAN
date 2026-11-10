import shipRules from '../../../shared/shipRules.json';

export const SHIPS = shipRules.SHIP_LENGTHS;
export const TOTAL_SHIP_CELLS = shipRules.TOTAL_SHIP_CELLS;
export const VALID_GRID_SIZES = shipRules.VALID_GRID_SIZES;

/**
 * Returns array of cell indices for a ship of given length and orientation,
 * or null if it extends beyond grid boundaries.
 */
export function getShipCells(startCell, length, orientation, size) {
  const row = Math.floor(startCell / size);
  const col = startCell % size;
  const cells = [];

  for (let i = 0; i < length; i++) {
    const nextRow = row + (orientation === "vertical" ? i : 0);
    const nextCol = col + (orientation === "horizontal" ? i : 0);

    if (nextRow >= size || nextCol >= size) {
      return null;
    }

    cells.push(nextRow * size + nextCol);
  }

  return cells;
}

/**
 * Checks if a candidate set of cells can be placed on the board:
 * 1. Must be within bounds [0, size*size)
 * 2. Must not overlap any already occupied cell
 * 3. Must not be adjacent (orthogonal or diagonal) to any already occupied cell
 */
export function canPlaceShip(cells, occupied, size) {
  if (!Array.isArray(cells) || cells.length === 0) return false;

  for (const cell of cells) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= size * size) {
      return false;
    }
    if (occupied.has(cell)) {
      return false;
    }
  }

  // Check 8-neighbor proximity against occupied cells from other ships
  for (const cell of cells) {
    const r = Math.floor(cell / size);
    const c = cell % size;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;

        const nr = r + dr;
        const nc = c + dc;

        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;

        const neighbor = nr * size + nc;
        if (occupied.has(neighbor) && !cells.includes(neighbor)) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Generates a valid random fleet adhering to all placement and adjacency rules.
 * Uses a retry cap for both individual ships and the entire fleet layout
 * to prevent infinite loops and dead-end layouts.
 */
export function generateRandomFleet(
  size = 8,
  ships = SHIPS,
  maxFleetRetries = 50,
  maxShipAttempts = 500
) {
  for (let fleetRetry = 0; fleetRetry < maxFleetRetries; fleetRetry++) {
    const occupied = new Set();
    const generated = [];
    let fleetSuccess = true;

    for (const length of ships) {
      let placed = false;

      for (let attempt = 0; attempt < maxShipAttempts; attempt++) {
        const isVertical = Math.random() > 0.5;
        const maxRow = isVertical ? size - length : size - 1;
        const maxCol = isVertical ? size - 1 : size - length;

        if (maxRow < 0 || maxCol < 0) {
          return null; // Ship does not fit on board of this size
        }

        const row = Math.floor(Math.random() * (maxRow + 1));
        const col = Math.floor(Math.random() * (maxCol + 1));

        const cells = [];
        for (let i = 0; i < length; i++) {
          const r = row + (isVertical ? i : 0);
          const c = col + (!isVertical ? i : 0);
          cells.push(r * size + c);
        }

        if (canPlaceShip(cells, occupied, size)) {
          generated.push(cells);
          for (const c of cells) {
            occupied.add(c);
          }
          placed = true;
          break;
        }
      }

      if (!placed) {
        fleetSuccess = false;
        break; // Restart whole fleet layout
      }
    }

    if (fleetSuccess) {
      return generated;
    }
  }

  return null;
}
