# EcoQuest — Global Cleanup Challenge

Multiplayer browser-based cleanup game for school clubs. Each club uses the same live URL, joins with a room code, and competes to sort waste in 4 fictional city sites.

## Running locally

Run `npm install` then `npm start` and visit http://localhost:3000.

## Hosting on Render (free)

In the Render dashboard choose **New > Blueprint**, connect this GitHub repository and approve the `render.yaml` service. The service is configured for Node, free plan, `npm install` build and `npm start`. Use the generated onrender.com URL; a first visit after idle can take about a minute. No Google Maps API key required. The mapped locations are simulated educational sites.

## Google Meet

Host creates a room code and shares the same URL and code to all students. Divide them into breakout rooms, up to 4 players per team. All teams see a common leaderboard. Game data is stored in the Node.js process's memory, so restarting or sleeping the free instance resets active game sessions.