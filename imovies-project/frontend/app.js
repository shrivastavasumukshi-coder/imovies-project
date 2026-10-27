// ---------- Config & state ----------
const API = location.protocol === 'file:' ? 'http://localhost:4000/api' : '/api';
const FEE = 1.5;
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const SEATS_PER_ROW = 8;
const GENRES = ['All', 'Action', 'Sci-Fi', 'Drama', 'Animation'];

const CLIENT_ID = (() => {
  try {
    let id = localStorage.getItem('imovies_client');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || Date.now() + '-' + Math.random();
      localStorage.setItem('imovies_client', id);
    }
    return id;
  } catch { return 'anon'; }
})();

let MOVIES = [], bookedTickets = [], bookedSeats = [];
let currentMovie = null, selectedTime = null, selectedSeats = [], discount = 0, promoCode = '';
let activeGenre = 'All';

// ---------- API helper ----------
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'x-client-id': CLIENT_ID },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 3500);
}
const money = n => `$${Number(n).toFixed(2)}`;
const NAV_ON = 'px-3.5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center space-x-2 text-brand-500 bg-brand-500/10 border border-brand-500/20';
const NAV_OFF = 'px-3.5 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all flex items-center space-x-2 border border-transparent';

// ---------- Navigation ----------
async function navigateTo(view) {
  ['movies', 'booking', 'tickets'].forEach(v => document.getElementById('view-' + v).classList.add('hidden'));
  document.getElementById('nav-movies').className = NAV_OFF;
  document.getElementById('nav-tickets').className = NAV_OFF + ' relative';
  document.getElementById('view-' + view).classList.remove('hidden');
  if (view === 'movies') document.getElementById('nav-movies').className = NAV_ON;
  if (view === 'tickets') {
    document.getElementById('nav-tickets').className = NAV_ON + ' relative';
    await loadTickets();
    renderTickets();
  }
  window.scrollTo(0, 0);
}

// ---------- Movies ----------
async function loadMovies() {
  try {
    MOVIES = await api('/movies');
    renderGenres();
    applyFilters();
  } catch (e) {
    document.getElementById('movie-grid').innerHTML =
      `<p class="col-span-full text-center text-rose-400 py-16">Could not reach the server. Start the backend with <code>npm start</code> and open <b>http://localhost:4000</b>.</p>`;
  }
}

function renderGenres() {
  document.getElementById('genre-filters').innerHTML = GENRES.map(g => `
    <button onclick="setGenre('${g}')" class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${g === activeGenre
      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}">${g}</button>`).join('');
}
function setGenre(g) { activeGenre = g; renderGenres(); applyFilters(); }

function applyFilters() {
  const q = document.getElementById('search-input').value.toLowerCase();
  renderMovies(MOVIES.filter(m =>
    (activeGenre === 'All' || m.genre === activeGenre) &&
    (m.title.toLowerCase().includes(q) || m.genre.toLowerCase().includes(q))));
}

function renderMovies(list) {
  const el = document.getElementById('movie-grid');
  if (!list.length) { el.innerHTML = '<p class="col-span-full text-center text-slate-500 py-16">No movies found.</p>'; return; }
  el.innerHTML = list.map(m => `
    <div class="bg-slate-900/90 border border-slate-800/80 rounded-3xl overflow-hidden hover:border-slate-700 transition-all duration-300 group flex flex-col justify-between shadow-xl">
      <div class="relative overflow-hidden aspect-[2/3]">
        <img src="${m.image}" alt="${m.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        <div class="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md border border-slate-800 px-2.5 py-1 rounded-xl text-xs font-bold text-amber-400 flex items-center space-x-1 shadow-lg">
          <i class="fa-solid fa-star text-xs"></i><span>${m.rating}</span></div>
      </div>
      <div class="p-5 flex-grow flex flex-col justify-between space-y-4">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/50">${m.genre}</span>
          <h3 class="text-lg font-bold text-white mt-3 group-hover:text-brand-500 transition-colors">${m.title}</h3>
          <p class="text-xs text-slate-400 mt-1 flex items-center space-x-1"><i class="fa-regular fa-clock text-slate-500"></i><span>${m.duration}</span></p>
        </div>
        <div class="flex items-center justify-between pt-3 border-t border-slate-800/80">
          <div><span class="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Ticket From</span>
            <span class="text-lg font-black text-white">${money(m.price)}</span></div>
          <button onclick="initiateBooking('${m.id}')" class="bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition-all flex items-center space-x-1.5">
            <span>Select Seats</span><i class="fa-solid fa-chevron-right text-[10px]"></i></button>
        </div>
      </div>
    </div>`).join('');
}

// ---------- Booking ----------
async function initiateBooking(id) {
  currentMovie = MOVIES.find(m => m.id === id);
  selectedTime = currentMovie.showtimes[0];
  selectedSeats = []; discount = 0; promoCode = '';
  document.getElementById('selected-movie-title').textContent = currentMovie.title;
  document.getElementById('selected-movie-meta').textContent = `${currentMovie.genre} • ${currentMovie.duration} • ★ ${currentMovie.rating}`;
  document.getElementById('promo-code').value = '';
  document.getElementById('promo-message').classList.add('hidden');
  renderShowtimes();
  await loadSeats();
  navigateTo('booking');
}

function renderShowtimes() {
  document.getElementById('showtime-list').innerHTML = currentMovie.showtimes.map(t => `
    <button onclick="selectTime('${t}')" class="text-xs font-bold px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${t === selectedTime
      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30' : 'text-slate-400 hover:text-white'}">${t}</button>`).join('');
}

async function selectTime(t) {
  selectedTime = t; selectedSeats = [];
  renderShowtimes();
  await loadSeats();
}

async function loadSeats() {
  try {
    const d = await api(`/movies/${currentMovie.id}/seats?showtime=${encodeURIComponent(selectedTime)}`);
    bookedSeats = d.booked;
  } catch { bookedSeats = []; toast('Could not load seat availability.'); }
  renderSeatGrid();
  updateSummary();
}

function renderSeatGrid() {
  let html = '';
  ROWS.forEach(row => {
    html += `<div class="flex items-center space-x-2 sm:space-x-2.5"><span class="w-4 text-xs font-bold text-slate-500">${row}</span>`;
    for (let i = 1; i <= SEATS_PER_ROW; i++) {
      const id = `${row}${i}`;
      const occupied = bookedSeats.includes(id), selected = selectedSeats.includes(id);
      let cls = 'bg-slate-800 border-slate-700 hover:border-brand-500 text-slate-300';
      if (occupied) cls = 'bg-slate-950 border-slate-900 text-slate-800 cursor-not-allowed opacity-40';
      else if (selected) cls = 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-600/50 scale-105';
      html += `<button ${occupied ? 'disabled' : ''} onclick="toggleSeat('${id}')" class="w-7 h-7 sm:w-8 sm:h-8 rounded-t-lg border text-xs font-bold flex items-center justify-center transition-all duration-200 ${cls}">${i}</button>`;
      if (i === 4) html += '<div class="w-3 sm:w-4"></div>';
    }
    html += '</div>';
  });
  document.getElementById('seat-grid').innerHTML = html;
}

function toggleSeat(id) {
  if (selectedSeats.includes(id)) selectedSeats = selectedSeats.filter(s => s !== id);
  else if (selectedSeats.length >= 8) return toast('Maximum 8 seats per booking.');
  else selectedSeats.push(id);
  renderSeatGrid();
  updateSummary();
}

function updateSummary() {
  const n = selectedSeats.length;
  const base = n * currentMovie.price, fee = n ? FEE : 0, disc = n ? discount : 0;
  const total = Math.max(0, base + fee - disc);
  const set = (id, v) => (document.getElementById(id).textContent = v);
  set('summary-seats-list', n ? selectedSeats.join(', ') : 'None');
  set('summary-seat-count', n);
  set('summary-base-price', money(base));
  set('summary-fee', money(fee));
  set('summary-discount', '-' + money(disc));
  set('summary-total-price', money(total));
  document.getElementById('checkout-btn').disabled = n === 0;
}

async function applyPromoCode() {
  const code = document.getElementById('promo-code').value.trim().toUpperCase();
  const msg = document.getElementById('promo-message');
  msg.classList.remove('hidden', 'text-emerald-400', 'text-rose-400');
  try {
    const r = await api('/promo/' + encodeURIComponent(code || 'NONE'));
    discount = r.valid ? r.discount : 0;
    promoCode = r.valid ? code : '';
    msg.textContent = r.valid ? `Discount applied! -${money(discount)} off total.` : 'Invalid promo code.';
    msg.classList.add(r.valid ? 'text-emerald-400' : 'text-rose-400');
  } catch { msg.textContent = 'Could not validate code.'; msg.classList.add('text-rose-400'); }
  updateSummary();
}

async function processCheckout() {
  if (!selectedSeats.length) return;
  const btn = document.getElementById('checkout-btn');
  btn.disabled = true;
  try {
    const { ticket } = await api('/bookings', {
      method: 'POST',
      body: { movieId: currentMovie.id, showtime: selectedTime, seats: selectedSeats, promo: promoCode }
    });
    document.getElementById('modal-ref').textContent = ticket.id;
    document.getElementById('modal-title').textContent = ticket.movieTitle;
    document.getElementById('modal-time').textContent = `${ticket.date} @ ${ticket.showtime}`;
    document.getElementById('modal-seats').textContent = ticket.seats.join(', ');
    document.getElementById('confirmation-modal').classList.remove('hidden');
    document.getElementById('confirmation-modal').classList.add('flex');
    await loadTickets();
  } catch (e) {
    toast(e.message);
    if (e.status === 409) { selectedSeats = []; await loadSeats(); }
  } finally { updateSummary(); }
}

function closeConfirmationModal() {
  const m = document.getElementById('confirmation-modal');
  m.classList.add('hidden'); m.classList.remove('flex');
  navigateTo('tickets');
}

// ---------- Tickets ----------
async function loadTickets() {
  try { bookedTickets = await api('/bookings'); } catch { bookedTickets = []; }
  updateTicketBadge();
}

function renderTickets() {
  const el = document.getElementById('tickets-container');
  if (!bookedTickets.length) {
    el.innerHTML = `<div class="col-span-full py-16 text-center text-slate-500 space-y-3 bg-slate-900/50 rounded-3xl border border-slate-800/50">
      <i class="fa-solid fa-ticket text-4xl text-slate-600"></i><p class="font-medium">You don't have any booked movie tickets yet.</p></div>`;
    return;
  }
  el.innerHTML = bookedTickets.map(t => {
    const active = t.status === 'active';
    return `
    <div class="bg-slate-900/90 border border-slate-800/80 rounded-3xl p-6 flex flex-col justify-between space-y-4 shadow-xl ${active ? '' : 'opacity-60'}">
      <div class="flex items-start justify-between">
        <div>
          <span class="text-xs font-mono font-bold text-brand-500">${t.id}</span>
          <h3 class="text-xl font-extrabold text-white mt-1">${t.movieTitle}</h3>
          <p class="text-xs text-slate-400 mt-1">${t.date} • ${t.showtime}</p>
        </div>
        <div class="${active ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} border text-xs px-3 py-1 rounded-full font-bold">
          ${active ? 'Active' : 'Cancelled'}</div>
      </div>
      <div class="border-t border-b border-slate-800/80 py-3 flex justify-between items-center text-sm">
        <div><span class="text-xs text-slate-500 block">Reserved Seats</span><span class="font-bold text-white">${t.seats.join(', ')}</span></div>
        <div class="text-right"><span class="text-xs text-slate-500 block">Amount Paid</span><span class="font-bold text-white">${money(t.totalPaid)}</span></div>
      </div>
      <div class="pt-2 flex items-center justify-between">
        <div class="h-8 flex space-x-1 items-center opacity-60">
          ${Array.from({ length: 22 }).map(() => `<div class="bg-slate-300 h-full ${Math.random() > 0.5 ? 'w-1' : 'w-0.5'}"></div>`).join('')}
        </div>
        ${active ? `<button onclick="cancelTicket('${t.id}')" class="text-xs font-bold text-rose-400 hover:text-rose-300">Cancel</button>`
                 : '<span class="text-[10px] text-slate-500 font-mono">Refunded</span>'}
      </div>
    </div>`;
  }).join('');
}

async function cancelTicket(id) {
  if (!confirm('Cancel this booking?')) return;
  try { await api('/bookings/' + id, { method: 'DELETE' }); toast('Booking cancelled.'); }
  catch (e) { toast(e.message); }
  await loadTickets();
  renderTickets();
}

function updateTicketBadge() {
  const badge = document.getElementById('ticket-badge');
  const n = bookedTickets.filter(t => t.status === 'active').length;
  badge.textContent = n;
  badge.classList.toggle('hidden', n === 0);
  badge.classList.toggle('flex', n > 0);
}

// ---------- Boot ----------
loadMovies();
loadTickets();
