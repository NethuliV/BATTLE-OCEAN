# Battle Ocean client

React and Vite frontend for Battle Ocean.

## Local development

From this directory, install dependencies and start the Vite dev server:

```sh
npm install
npm run dev
```

The Vite development server proxies `/api` and `/socket.io` to port `5005` by
default. Set `BACKEND_PORT` to match the backend's `PORT` if you use a different
port.

## Deploy the frontend to Vercel

1. Import the repository into Vercel and set **Root Directory** to `client`.
2. Use the Vite defaults: build command `npm run build`, output directory
   `dist`, and install command `npm install`.
3. Add these Vercel environment variables for Production (and Preview if used):
   - `VITE_API_URL`: the backend URL ending in `/api`, for example
     `https://your-backend.example.com/api`.
   - `VITE_SOCKET_URL`: the backend origin without a path, for example
     `https://your-backend.example.com`.
4. Deploy or redeploy after setting the variables.

`vercel.json` provides SPA fallback routing for client-side routes. The example
variables are in `.env.example`.

## Deploy the backend

The backend is an Express server with Socket.IO and in-memory multiplayer room
state. Deploy the `server` directory to a persistent Node.js hosting service
that supports WebSocket connections; do not deploy it as Vercel serverless
functions. Configure:

- `MONGODB_URI`: a reachable MongoDB connection string (for example, MongoDB
  Atlas).
- `JWT_SECRET`: a long, random secret.
- `CLIENT_ORIGINS`: comma-separated exact origins allowed to call the backend,
  including the production Vercel domain and any Vercel Preview domains you
  want to use.
- `PORT`: provided by most hosting services; the server defaults to `5000`.

The backend uses in-memory room state, so run one backend instance unless
multiplayer state and Socket.IO are moved to shared infrastructure. The host
must keep that process running and support WebSocket upgrades for `/socket.io`.
See `../server/.env.example` for the backend environment variable template.

## Checks

```sh
npm run build
npm test
npm run lint
```
