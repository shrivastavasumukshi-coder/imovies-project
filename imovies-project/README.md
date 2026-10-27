# IMovies – Interactive Movie Ticket Booking

A full-stack movie ticket booking app: a Tailwind-styled single-page frontend and a Node.js/Express REST API
with persistent bookings (JSON file storage).

## Features
- Browse movies, search by title/genre, filter by genre
- Pick a showtime and seats on an interactive cinema seat map
- Live availability: seats booked by others are blocked (server rejects double-booking with HTTP 409)
- Promo code `IMOVIES20` (-$5.00); prices are calculated and verified on the server
- "My Tickets" page with booking history and cancellation (frees the seats)
- Bookings persist across restarts (`backend/data/bookings.json`), scoped per browser

## Tech stack
Frontend: HTML, Tailwind CSS (CDN), Font Awesome, vanilla JavaScript  
Backend: Node.js, Express, CORS

## Project structure
```
imovies-project/
├── backend/
│   ├── server.js          # Express API + static file server
│   ├── package.json
│   └── data/bookings.json # created automatically on first booking
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── README.md
```

## Setup & run
Requirements: [Node.js](https://nodejs.org) 16 or newer.

```bash
cd backend
npm install
npm start
```
Open **http://localhost:4000** (the backend serves the frontend). An internet connection is needed for the
Tailwind/Font Awesome CDNs and movie posters.

Optional: `npm run dev` (auto-restart with nodemon). Change the port with `PORT=5000 npm start`.

## API reference
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/movies` | List all movies |
| GET | `/api/movies/:id/seats?showtime=…` | Booked seats for a showtime |
| GET | `/api/promo/:code` | Validate a promo code |
| GET | `/api/bookings` | Bookings of the current client (`x-client-id` header) |
| POST | `/api/bookings` | Create booking `{movieId, showtime, seats[], promo?}` |
| DELETE | `/api/bookings/:id` | Cancel a booking |

## Notes
- No login system: bookings are tied to a random client ID stored in the browser's localStorage.
- Payment is simulated; no real transactions occur.
- For production, swap the JSON file for a database (e.g. MongoDB/PostgreSQL) and add authentication.
