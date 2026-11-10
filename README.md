# Battle Ocean

Battle Ocean is a browser-based naval battle game. Play solo missions or
challenge another player in a private, turn-based multiplayer room.

## Features

- Solo battles with selectable grid sizes, ship placement, shots, score, and
  bomb tracking.
- Multiplayer battles with room codes, fleet placement, turn-based shooting,
  hit/miss feedback, and match results.
- Fish API puzzle challenges after missed shots; answer correctly to continue,
  or fail the mission/battle on a wrong answer or timeout.
- Account registration, login, and player profiles.
- Server-side fleet validation and shared ship placement rules.

## Tech stack

- **Frontend:** React, Vite, React Router, Socket.IO client.
- **Backend:** Node.js, Express, Socket.IO.
- **Database:** MongoDB via Mongoose. A local JSON fallback store is also
  available for development.
- **Tests:** Vitest for client tests and Node's test runner for server tests.

## Repository layout

```text
client/   React/Vite application
server/   Express API and Socket.IO multiplayer server
shared/   Shared ship rules
```

## Run locally

Requirements: Node.js and npm.

1. Install dependencies:

   ```sh
   cd server
   npm install
   cd ../client
   npm install
   ```

2. Configure the backend. Copy `server/.env.example` to `server/.env`, then set
   `JWT_SECRET`. For persistent local accounts, also set `MONGODB_URI` to a
   reachable MongoDB instance. To use the JSON fallback for development, set
   `STORAGE_MODE=json`.

3. Configure the local client proxy port. The Vite proxy defaults to port
   `5005`; set `PORT=5005` in `server/.env`, or set `BACKEND_PORT` in the
   environment where Vite runs to match the backend port.

4. Start the backend and frontend in separate terminals:

   ```sh
   cd server
   npm run dev
   ```

   ```sh
   cd client
   npm run dev
   ```

The client runs at the URL printed by Vite (typically `http://localhost:5173`).
For a different backend port, configure Vite's `BACKEND_PORT` to match it.

## Tests and build

Run each command from its project directory:

```sh
# Client
cd client
npm test
npm run lint
npm run build
```

```sh
# Server
cd server
npm test
```

The client also provides `npm run test:e2e` for its Playwright end-to-end
workflow.

## Deploy

The recommended arrangement is a Vercel-hosted frontend and a persistent
Node.js backend on Render, with MongoDB Atlas for the database.

### Vercel frontend

1. Import this repository into Vercel and set **Root Directory** to `client`.
2. Use the Vite settings: build command `npm run build`, output directory
   `dist`, and install command `npm install`.
3. Add these environment variables for the environments you deploy:
   - `VITE_API_URL=https://<render-service>.onrender.com/api`
   - `VITE_SOCKET_URL=https://<render-service>.onrender.com`
4. Deploy or redeploy after setting the variables.

### Render backend

1. Create a Render **Web Service** connected to this repository.
2. Set **Root Directory** to `server`, **Build Command** to `npm install`, and
   **Start Command** to `npm start`.
3. Configure:
   - `MONGODB_URI`: MongoDB Atlas connection string.
   - `JWT_SECRET`: a strong, private secret.
   - `CLIENT_ORIGINS`: the exact Vercel site origin, such as
     `https://your-app.vercel.app`. Multiple origins can be comma-separated.
   - `NODE_ENV=production`.
4. Keep one backend instance unless room state and Socket.IO are migrated to
   shared infrastructure.
5. After deployment, check
   `https://<render-service>.onrender.com/api/health`; the database should
   report `"connected"`.

Vercel's `client/vercel.json` configures SPA fallback routing. The frontend
environment template is `client/.env.example`; the backend template is
`server/.env.example`.

## Deployment notes

- Keep all secrets in the hosting provider's environment settings. Never commit
  `.env` files or paste secrets into source code.
- The multiplayer room state is currently held in memory and is written to a
  local JSON file as a best-effort feature. Use one persistent backend instance;
  active rooms may be lost on restart and do not synchronize across instances.
- Accounts in the local JSON fallback store are not automatically copied to
  MongoDB Atlas. Players need to register on the deployed service unless
  accounts are migrated separately.
