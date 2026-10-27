const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const DATA_FILE = path.join(__dirname, 'data', 'bookings.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend'))); // serves the frontend

// ---------- Data ----------
const MOVIES = [
  { id: 'm1', title: 'Cyberpunk Odyssey 2099', genre: 'Sci-Fi', rating: '4.9', duration: '2h 25m', price: 14.5,
    image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80',
    showtimes: ['12:30 PM', '03:45 PM', '07:15 PM', '10:30 PM'] },
  { id: 'm2', title: 'Shadow of the Dragon', genre: 'Action', rating: '4.7', duration: '2h 10m', price: 12.0,
    image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80',
    showtimes: ['01:00 PM', '04:15 PM', '08:00 PM'] },
  { id: 'm3', title: 'Whimsical Forest', genre: 'Animation', rating: '4.8', duration: '1h 45m', price: 10.5,
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
    showtimes: ['11:00 AM', '02:00 PM', '05:30 PM'] },
  { id: 'm4', title: 'The Last Symphony', genre: 'Drama', rating: '4.6', duration: '2h 05m', price: 11.0,
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80',
    showtimes: ['03:00 PM', '06:30 PM', '09:45 PM'] }
];
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const PER_ROW = 8;
const MAX_SEATS = 8;
const BOOKING_FEE = 1.5;
const PROMOS = { IMOVIES20: 5.0 };

// ---------- Persistence (JSON file) ----------
const loadBookings = () => {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; }
};
const saveBookings = (b) => {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(b, null, 2));
};

// ---------- Helpers ----------
const allSeats = () => ROWS.flatMap(r => Array.from({ length: PER_ROW }, (_, i) => `${r}${i + 1}`));

// Pre-occupied seats (simulates other customers); deterministic per movie+showtime
function baseOccupied(movieId, showtime) {
  const seed = (movieId + showtime).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const out = [];
  ROWS.forEach((row, r) => {
    for (let i = 1; i <= PER_ROW; i++) if ((seed + r * 8 + i) % 5 === 0) out.push(`${row}${i}`);
  });
  return out;
}
function bookedSeats(movieId, showtime) {
  const real = loadBookings()
    .filter(b => b.status === 'active' && b.movieId === movieId && b.showtime === showtime)
    .flatMap(b => b.seats);
  return [...new Set([...baseOccupied(movieId, showtime), ...real])];
}

// ---------- Routes ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/movies', (req, res) => res.json(MOVIES));

app.get('/api/movies/:id/seats', (req, res) => {
  const movie = MOVIES.find(m => m.id === req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found.' });
  const showtime = req.query.showtime;
  if (!movie.showtimes.includes(showtime)) return res.status(400).json({ error: 'Invalid showtime.' });
  res.json({ booked: bookedSeats(movie.id, showtime) });
});

app.get('/api/promo/:code', (req, res) => {
  const discount = PROMOS[req.params.code.toUpperCase()];
  res.json(discount ? { valid: true, discount } : { valid: false, discount: 0 });
});

app.get('/api/bookings', (req, res) => {
  const clientId = req.get('x-client-id');
  res.json(loadBookings().filter(b => b.clientId === clientId));
});

app.post('/api/bookings', (req, res) => {
  const clientId = req.get('x-client-id') || 'anon';
  const { movieId, showtime, seats, promo } = req.body || {};

  const movie = MOVIES.find(m => m.id === movieId);
  if (!movie) return res.status(404).json({ error: 'Movie not found.' });
  if (!movie.showtimes.includes(showtime)) return res.status(400).json({ error: 'Invalid showtime.' });
  if (!Array.isArray(seats) || seats.length === 0) return res.status(400).json({ error: 'Select at least one seat.' });
  if (seats.length > MAX_SEATS) return res.status(400).json({ error: `Maximum ${MAX_SEATS} seats per booking.` });

  const valid = new Set(allSeats());
  if (new Set(seats).size !== seats.length || !seats.every(s => valid.has(s)))
    return res.status(400).json({ error: 'Invalid seat selection.' });

  const taken = new Set(bookedSeats(movieId, showtime));
  const conflicts = seats.filter(s => taken.has(s));
  if (conflicts.length) return res.status(409).json({ error: `Seat(s) already booked: ${conflicts.join(', ')}` });

  const discount = PROMOS[String(promo || '').toUpperCase()] || 0;
  const totalPaid = Math.max(0, seats.length * movie.price + BOOKING_FEE - discount);

  const booking = {
    id: 'TICK-' + Math.floor(100000 + Math.random() * 900000),
    clientId, movieId, movieTitle: movie.title, showtime, seats,
    totalPaid: Number(totalPaid.toFixed(2)),
    status: 'active',
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    createdAt: new Date().toISOString()
  };
  const all = loadBookings();
  all.unshift(booking);
  saveBookings(all);
  res.status(201).json({ success: true, ticket: booking });
});

app.delete('/api/bookings/:id', (req, res) => {
  const clientId = req.get('x-client-id');
  const all = loadBookings();
  const b = all.find(x => x.id === req.params.id && x.clientId === clientId);
  if (!b) return res.status(404).json({ error: 'Booking not found.' });
  b.status = 'cancelled';
  saveBookings(all);
  res.json({ success: true, ticket: b });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.listen(PORT, () => console.log(`IMovies running at http://localhost:${PORT}`));
