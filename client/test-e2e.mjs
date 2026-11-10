import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_DIR = path.resolve(ROOT_DIR, 'server');
const CLIENT_DIR = path.resolve(ROOT_DIR, 'client');
const ROOMS_PATH = path.resolve(SERVER_DIR, 'data', 'rooms.json');
const FALLBACK_USERS_PATH = path.resolve(SERVER_DIR, 'data', 'fallbackUsers.json');

const BACKEND_PORT = 5005;
const FRONTEND_PORT = 5173;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const statusCode = await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => resolve(res.statusCode));
        req.on('error', reject);
        req.setTimeout(2000, () => req.destroy());
      });
      if (statusCode >= 200 && statusCode < 400) {
        return true;
      }
    } catch {
      // Retry
    }
    await sleep(250);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function startServers(storageMode = 'json') {
  console.log(`\n=== Starting servers (STORAGE_MODE=${storageMode}) ===`);

  const serverProc = spawn('node', ['server.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      STORAGE_MODE: storageMode,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stdout.on('data', (d) => {
    const text = d.toString().trim();
    if (text) console.log(`[BACKEND] ${text}`);
  });
  serverProc.stderr.on('data', (d) => {
    const text = d.toString().trim();
    if (text) console.error(`[BACKEND ERR] ${text}`);
  });

  const viteProc = spawn(
    'node',
    ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(FRONTEND_PORT)],
    {
      cwd: CLIENT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  viteProc.stdout.on('data', (d) => {
    const text = d.toString().trim();
    if (text) console.log(`[VITE] ${text}`);
  });
  viteProc.stderr.on('data', (d) => {
    const text = d.toString().trim();
    if (text) console.error(`[VITE ERR] ${text}`);
  });

  await waitForUrl(`${BACKEND_URL}/api/health`);
  await waitForUrl(FRONTEND_URL);
  console.log('Both Backend and Frontend are ready!\n');

  return {
    stop: async () => {
      console.log('Stopping servers...');
      serverProc.kill();
      viteProc.kill();
      await sleep(1000);
    },
  };
}

async function registerUser(username, email, password) {
  const payload = JSON.stringify({
    fullName: username,
    username,
    email,
    password,
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BACKEND_URL}/api/auth/register`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.message || `Registration failed with status ${res.statusCode}`));
            }
          } catch {
            reject(new Error(`Failed to parse registration response: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function cleanUpDataFiles(createdUserIds = [], createdRoomCodes = []) {
  try {
    if (fs.existsSync(ROOMS_PATH) && createdRoomCodes.length > 0) {
      const raw = fs.readFileSync(ROOMS_PATH, 'utf8').trim();
      if (raw) {
        const rooms = JSON.parse(raw);
        const filtered = rooms.filter((r) => !createdRoomCodes.includes(r.code));
        fs.writeFileSync(ROOMS_PATH, JSON.stringify(filtered, null, 2), 'utf8');
        console.log(`Cleaned up ${rooms.length - filtered.length} test rooms from rooms.json`);
      }
    }

    if (fs.existsSync(FALLBACK_USERS_PATH) && createdUserIds.length > 0) {
      const raw = fs.readFileSync(FALLBACK_USERS_PATH, 'utf8').trim();
      if (raw) {
        const users = JSON.parse(raw);
        const filtered = users.filter((u) => !createdUserIds.includes(String(u.id || u._id)));
        fs.writeFileSync(FALLBACK_USERS_PATH, JSON.stringify(filtered, null, 2), 'utf8');
        console.log(`Cleaned up ${users.length - filtered.length} test users from fallbackUsers.json`);
      }
    }
  } catch (err) {
    console.warn('Cleanup error (non-fatal):', err.message);
  }
}

async function runE2ETestSuite(storageMode = 'json') {
  console.log(`\n======================================================`);
  console.log(`  STARTING E2E PLAYWRIGHT FLOW (${storageMode.toUpperCase()} MODE)`);
  console.log(`======================================================\n`);

  const servers = await startServers(storageMode);
  const browser = await chromium.launch({ headless: true });

  const testUserIds = [];
  const testRoomCodes = [];

  try {
    const timestamp = Date.now();
    const user1Data = await registerUser(
      `p1_${timestamp}`,
      `p1_${timestamp}@test.com`,
      'password123'
    );
    const user2Data = await registerUser(
      `p2_${timestamp}`,
      `p2_${timestamp}@test.com`,
      'password123'
    );

    testUserIds.push(String(user1Data.user?.id || user1Data.user?._id));
    testUserIds.push(String(user2Data.user?.id || user2Data.user?._id));
    console.log(`Created test users: ${user1Data.user?.username}, ${user2Data.user?.username}`);

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    await context1.tracing.start({ screenshots: true, snapshots: true });
    await context2.tracing.start({ screenshots: true, snapshots: true });

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    page1.on('console', (msg) => console.log(`[P1 BROWSER] ${msg.text()}`));
    page2.on('console', (msg) => console.log(`[P2 BROWSER] ${msg.text()}`));
    page1.on('pageerror', (err) => console.error(`[P1 PAGE ERROR]`, err));
    page2.on('pageerror', (err) => console.error(`[P2 PAGE ERROR]`, err));

    // Mock fish challenge for both contexts to avoid external API dependency
    const mockFishRoutes = async (page) => {
      await page.route('**/api/fish/question', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            challengeId: 'mock-challenge-test',
            imageUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="blue" width="100" height="100"/></svg>',
            timeLimit: 15,
          }),
        });
      });
      await page.route('**/api/fish/answer', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            correct: true,
            message: 'Correct! Return to battle.',
          }),
        });
      });
    };

    await mockFishRoutes(page1);
    await mockFishRoutes(page2);

    // Inject auth token and navigate to multiplayer
    await page1.addInitScript(({ token }) => {
      localStorage.setItem('battleOceanToken', token);
    }, { token: user1Data.token });

    await page2.addInitScript(({ token }) => {
      localStorage.setItem('battleOceanToken', token);
    }, { token: user2Data.token });

    await page1.goto(`${FRONTEND_URL}/multiplayer`);
    await page2.goto(`${FRONTEND_URL}/multiplayer`);

    console.log('1. Both players loaded /multiplayer');

    // Player 1 creates room
    const createRoomBtn = page1.locator('button:has-text("CREATE A GAME")');
    await createRoomBtn.waitFor({ state: 'visible' });
    await createRoomBtn.click();

    const roomCodeElem = page1.locator('.room-code-area strong');
    await roomCodeElem.waitFor({ state: 'visible' });
    const roomCode = (await roomCodeElem.innerText()).trim();
    testRoomCodes.push(roomCode);
    console.log(`2. Player 1 created room ${roomCode}`);

    // Player 2 joins room
    const joinInput = page2.locator('input[placeholder*="room code"]');
    await joinInput.fill(roomCode);
    const joinRoomBtn = page2.locator('button:has-text("JOIN A GAME")');
    await joinRoomBtn.click();

    // Wait for Player 2 to enter lobby
    await page2.locator('.room-code-area strong').waitFor({ state: 'visible' });
    console.log('3. Player 2 joined the room successfully');

    // Step 4: Test manual placement and verify invalid manual placements are rejected with clear message
    console.log('4. Testing manual placement validation on Player 1...');
    // Ship 1: length 5 horizontal starting at cell 0 (cells 0, 1, 2, 3, 4)
    const p1GridCells = page1.locator('.placement-grid button.battle-cell');
    await p1GridCells.nth(0).click();

    // Now ship 2 (length 4). Try invalid orthogonal touch directly beneath at cell 8 (row 1, col 0)
    await p1GridCells.nth(8).click();
    let errorElem = page1.locator('.multi-error');
    await errorElem.waitFor({ state: 'visible' });
    let errorText = await errorElem.innerText();
    if (!errorText.includes('overlap or touch')) {
      throw new Error(`Expected adjacency error, got: ${errorText}`);
    }
    console.log('   ✓ Adjacent placement correctly rejected:', errorText);

    // Try placing out of bounds (cell 6 with horizontal orientation of length 4 extends past row end: 6+4=10 > 8)
    await p1GridCells.nth(6).click();
    errorText = await errorElem.innerText();
    if (!errorText.includes('outside the grid')) {
      throw new Error(`Expected bounds error, got: ${errorText}`);
    }
    console.log('   ✓ Out of bounds placement correctly rejected:', errorText);

    // Undo manual placement
    await page1.locator('button:has-text("UNDO")').click();

    // Step 5: Click Auto-place at least 50 times per player
    console.log('5. Clicking Auto-place 50 times per player...');
    const autoPlaceBtn1 = page1.locator('button:has-text("AUTO-PLACE")');
    for (let i = 0; i < 50; i++) {
      await autoPlaceBtn1.click();
      const hasError = await page1.locator('.multi-error').isVisible();
      if (hasError) {
        const msg = await page1.locator('.multi-error').innerText();
        throw new Error(`Player 1 Auto-place #${i + 1} produced unexpected error: ${msg}`);
      }
    }
    console.log('   ✓ Player 1 auto-placed 50 times with 0 errors');

    const autoPlaceBtn2 = page2.locator('button:has-text("AUTO-PLACE")');
    for (let i = 0; i < 50; i++) {
      await autoPlaceBtn2.click();
      const hasError = await page2.locator('.multi-error').isVisible();
      if (hasError) {
        const msg = await page2.locator('.multi-error').innerText();
        throw new Error(`Player 2 Auto-place #${i + 1} produced unexpected error: ${msg}`);
      }
    }
    console.log('   ✓ Player 2 auto-placed 50 times with 0 errors');

    // Step 6: Submit fleet and ready up
    console.log('6. Submitting fleets for both players...');
    await page1.locator('button:has-text("READY FOR BATTLE")').click();
    await page1.locator('text=YOUR FLEET IS READY!').waitFor({ state: 'visible' });
    console.log('   ✓ Player 1 fleet submitted successfully (No "Invalid ship placement")');

    await page2.locator('button:has-text("READY FOR BATTLE")').click();
    console.log('   ✓ Player 2 fleet submitted successfully (No "Invalid ship placement")');

    // Both ready -> Transition to "playing"
    await page1.locator('.battle-status').waitFor({ state: 'visible' });
    await page2.locator('.battle-status').waitFor({ state: 'visible' });
    console.log('7. Game transitioned to playing! Turn synchronization confirmed.');

    // Step 7: Play full game to completion
    console.log('8. Playing game to completion...');

    // Find Player 2's own ship cell indices from page 2
    const p2OwnShipCells = await page2.evaluate(() => {
      const myBoard = document.querySelectorAll('.battle-boards section')[0];
      const cells = myBoard.querySelectorAll('.battle-cell');
      const shipIndices = [];
      cells.forEach((cell, idx) => {
        if (cell.classList.contains('own-ship')) {
          shipIndices.push(idx);
        }
      });
      return shipIndices;
    });

    console.log(`   Player 2 ship cells (${p2OwnShipCells.length} total):`, p2OwnShipCells);
    if (p2OwnShipCells.length !== 17) {
      throw new Error(`Expected 17 ship cells for Player 2, found ${p2OwnShipCells.length}`);
    }

    // Determine whose turn it is
    let turnStatus = await page1.locator('.battle-status').innerText();
    let p1Turn = turnStatus.includes('YOUR TURN');
    console.log(`   Initial turn: ${p1Turn ? 'Player 1' : 'Player 2'}`);

    // If it's Player 2's turn initially, Player 2 shoots one cell to pass turn or test miss
    if (!p1Turn) {
      const p2EnemyGrid = page2.locator('.battle-boards section').nth(1).locator('.battle-cell');
      await p2EnemyGrid.nth(0).click();
      await sleep(500);
      await page1.locator('.battle-status:has-text("YOUR TURN")').waitFor({ state: 'visible' });
      console.log('   Turn passed to Player 1');
    }

    // Player 1 tests Fish challenge by missing on purpose if needed, or shoots ships directly
    const p1EnemyGrid = page1.locator('.battle-boards section').nth(1).locator('.battle-cell');

    // Player 1 fires at all 17 ship cells!
    // Since hit grants an immediate extra turn in Battleship, Player 1 can sink all ships
    for (let i = 0; i < p2OwnShipCells.length; i++) {
      const targetCell = p2OwnShipCells[i];

      // Handle fish challenge if it ever pops up
      const challengeBox = page1.locator('.fish-challenge-box');
      if (await challengeBox.isVisible()) {
        console.log('   Fish API challenge detected! Submitting answer...');
        await page1.locator('.fish-challenge-box input').fill('5');
        await page1.locator('.fish-challenge-box button[type="submit"]').click();
        await sleep(500);
      }

      await page1.locator('.battle-status:has-text("YOUR TURN")').waitFor({ state: 'visible', timeout: 10000 });
      await p1EnemyGrid.nth(targetCell).click();
      await sleep(300);
    }

    // Step 8: Verify win screen
    console.log('9. Verifying game results on both browsers...');
    await page1.locator('.multi-card h1:has-text("VICTORY")').waitFor({ state: 'visible', timeout: 15000 });
    const victoryMsg = await page1.locator('.multi-card h1').innerText();
    console.log(`   ✓ Player 1 reached victory screen: "${victoryMsg}"`);

    await page2.locator('.multi-card h1:has-text("lost")').waitFor({ state: 'visible', timeout: 15000 });
    const lossMsg = await page2.locator('.multi-card h1').innerText();
    console.log(`   ✓ Player 2 reached loss screen: "${lossMsg}"`);

    const returnBtn1 = page1.locator('a.multi-primary:has-text("RETURN TO PROFILE")');
    const returnBtn2 = page2.locator('a.multi-primary:has-text("RETURN TO PROFILE")');
    await returnBtn1.waitFor({ state: 'visible' });
    await returnBtn2.waitFor({ state: 'visible' });
    console.log('   ✓ Return to Profile link visible on both screens');

    console.log(`\n>>> SUCCESS: Full E2E Multiplayer Flow PASSED in ${storageMode.toUpperCase()} mode! <<<\n`);
  } catch (err) {
    console.error(`\n!!! E2E TEST FAILED in ${storageMode.toUpperCase()} mode:`, err.message);

    // Save screenshots and traces on failure
    try {
      const resultsDir = path.resolve(CLIENT_DIR, 'playwright-results');
      if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
      const failContexts = browser.contexts();
      if (failContexts[0]) {
        await failContexts[0].tracing.stop({ path: path.join(resultsDir, `trace-p1-${storageMode}.zip`) });
      }
      if (failContexts[1]) {
        await failContexts[1].tracing.stop({ path: path.join(resultsDir, `trace-p2-${storageMode}.zip`) });
      }
      console.log(`Saved failure traces to ${resultsDir}`);
    } catch (traceErr) {
      console.error('Failed to save trace:', traceErr.message);
    }

    throw err;
  } finally {
    await browser.close();
    await servers.stop();
    cleanUpDataFiles(testUserIds, testRoomCodes);
  }
}

// Execute tests for both storage modes
async function runAll() {
  // Mode 1: JSON Fallback mode
  await runE2ETestSuite('json');

  // Mode 2: MongoDB mode
  await runE2ETestSuite('mongodb');

  console.log('\n======================================================');
  console.log('  ALL E2E SCENARIOS COMPLETED AND PASSED IN BOTH MODES!');
  console.log('======================================================\n');
}

runAll().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
