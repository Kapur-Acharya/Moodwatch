// MoodMatch script (simple version)
// - gets movies from TMDB
// - supports dark/light mode
// - has watchlist and tooltips

// API settings (keep key secret)
const API_KEY  = 'c510f48340f6e4ea97c4193e841f9275';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL  = 'https://image.tmdb.org/t/p/w500';
const LOGO_URL = 'https://image.tmdb.org/t/p/original';

// App state values
let currentMovieList  = [];
let currentMovieIndex = 0;
let currentMood       = '';
let currentTime       = '';

// ---- RULE-BASED MAPPING ----
const moodToGenre = {
    happy:    '35,10751',   // Comedy, Family
    sad:      '18',         // Drama
    excited:  '28,12',      // Action, Adventure
    scared:   '27,53',      // Horror, Thriller
    curious:  '878,9648',   // Sci-Fi, Mystery
    romantic: '10749'       // Romance
};

const timeRules = {
    short:  { min: 60,  max: 90  },
    medium: { min: 90,  max: 125 },
    long:   { min: 125, max: 300 }
};

// Genre ID → Name lookup (subset of TMDB genres)
const genreNames = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
    53: 'Thriller', 10752: 'War', 37: 'Western'
};

// Streaming regions to try (in priority order)
const WATCH_REGIONS = ['NP', 'IN', 'US', 'GB'];

// ---- DOM ELEMENTS ----
const selectionScreen = document.getElementById('selection-screen');
const resultScreen    = document.getElementById('result-screen');
const loader          = document.getElementById('loader');
const form            = document.getElementById('recommendation-form');
const skipBtn         = document.getElementById('skipBtn');
const saveBtn         = document.getElementById('saveBtn');
const themeToggle     = document.getElementById('themeToggle');
const themeIcon       = document.getElementById('themeIcon');
const watchlistBtn    = document.getElementById('watchlistBtn');
const watchlistModal  = document.getElementById('watchlist-modal');
const watchlistCount  = document.getElementById('watchlistCount');
const logo            = document.querySelector('.logo');

// Theme toggle setup
let isDark = true;

// Load saved theme from browser storage or default to dark
const savedTheme = localStorage.getItem('moodMatchTheme') || 'dark';
applyTheme(savedTheme);

// Switch theme when button clicked
themeToggle.addEventListener('click', () => {
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('moodMatchTheme', newTheme);
});

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    isDark = (theme === 'dark');
    themeIcon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    document.getElementById('themeLabel').textContent = isDark ? 'Dark' : 'Light';
}

// Mood and time buttons: visual selection states
document.querySelectorAll('.mood-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.mood-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        card.querySelector('input').checked = true;
        currentMood = card.dataset.value;
    });
});

document.querySelectorAll('.time-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.time-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        card.querySelector('input').checked = true;
        currentTime = card.querySelector('input').value;
    });
});

// ================================================
// FORM SUBMISSION
// ================================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Read directly from radio inputs (reliable)
    const moodInput = document.querySelector('input[name="mood"]:checked');
    const timeInput = document.querySelector('input[name="time"]:checked');

    if (!moodInput || !timeInput) {
        showToast('⚠️  Please pick a mood and a time!');
        return;
    }

    currentMood = moodInput.value;
    currentTime = timeInput.value;

    await fetchMovies(currentMood, currentTime);
});

// ================================================
// SKIP → Next random pick
// ================================================
skipBtn.addEventListener('click', showRandomMovie);

// ================================================
// SAVE → Watchlist
// ================================================
saveBtn.addEventListener('click', () => {
    const movie = currentMovieList[currentMovieIndex];
    if (movie) saveToWatchlist(movie);
});

// ================================================
// LOGO CLICK - GO TO HOME
// ================================================
logo.addEventListener('click', () => {
    resultScreen.classList.add('hidden');
    selectionScreen.classList.remove('hidden');
    form.reset();
    // Clear card selections visually
    document.querySelectorAll('.mood-card, .time-card').forEach(c => c.classList.remove('selected'));
});

// ================================================
// FETCH MOVIES
// ================================================
async function fetchMovies(mood, time) {
    // Show loader
    selectionScreen.classList.add('hidden');
    loader.classList.remove('hidden');

    const genreIds = moodToGenre[mood];
    const rule     = timeRules[time];

    // Randomise page (1–3) for variety
    const page = Math.floor(Math.random() * 3) + 1;

    const url = `${BASE_URL}/discover/movie`
        + `?api_key=${API_KEY}`
        + `&language=en-US`
        + `&sort_by=popularity.desc`
        + `&include_adult=false`
        + `&page=${page}`
        + `&with_genres=${genreIds}`
        + `&with_runtime.gte=${rule.min}`
        + `&with_runtime.lte=${rule.max}`
        + `&vote_count.gte=100`       // Bug fix: filter out obscure/unrated films
        + `&vote_average.gte=5.5`;    // Bug fix: ensure decent quality

    try {
        const res  = await fetch(url);
        const data = await res.json();

        if (data.results && data.results.length > 0) {
            currentMovieList = data.results;
            showRandomMovie();
            loader.classList.add('hidden');
            resultScreen.classList.remove('hidden');
        } else {
            // Fallback: try page 1 without runtime filter
            await fetchMoviesFallback(genreIds);
        }
    } catch (err) {
        console.error('Fetch error:', err);
        showToast('⚠️  Network error. Please try again.');
        loader.classList.add('hidden');
        selectionScreen.classList.remove('hidden');
    }
}

async function fetchMoviesFallback(genreIds) {
    const url = `${BASE_URL}/discover/movie`
        + `?api_key=${API_KEY}`
        + `&language=en-US`
        + `&sort_by=popularity.desc`
        + `&include_adult=false`
        + `&page=1`
        + `&with_genres=${genreIds}`
        + `&vote_count.gte=50`;

    try {
        const res  = await fetch(url);
        const data = await res.json();

        if (data.results && data.results.length > 0) {
            currentMovieList = data.results;
            showRandomMovie();
            loader.classList.add('hidden');
            resultScreen.classList.remove('hidden');
            showToast('💡 Showing broader results for your mood.');
        } else {
            showToast('No movies found. Try a different mood!');
            loader.classList.add('hidden');
            selectionScreen.classList.remove('hidden');
        }
    } catch (err) {
        showToast('⚠️  Something went wrong.');
        loader.classList.add('hidden');
        selectionScreen.classList.remove('hidden');
    }
}

// ================================================
// DISPLAY A MOVIE
// ================================================
function showRandomMovie() {
    if (currentMovieList.length === 0) return;

    const idx   = Math.floor(Math.random() * currentMovieList.length);
    currentMovieIndex = idx;
    const movie = currentMovieList[idx];

    // Title
    document.getElementById('movie-title').textContent = movie.title || 'Unknown Title';

    // Overview
    document.getElementById('movie-overview').textContent =
        movie.overview || 'No description available for this title.';

    // Year
    const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
    document.getElementById('movie-year').textContent = year;

    // Rating
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
    document.getElementById('movie-rating').textContent = rating;

    // Runtime (not always in discover results, shown if present)
    const runtimeEl = document.getElementById('movie-runtime');
    if (movie.runtime) {
        runtimeEl.textContent = `${movie.runtime} min`;
        runtimeEl.classList.remove('hidden');
    } else {
        runtimeEl.classList.add('hidden');
    }

    // Poster
    const posterEl = document.getElementById('movie-poster');
    posterEl.src = movie.poster_path
        ? IMG_URL + movie.poster_path
        : 'https://via.placeholder.com/300x450?text=No+Poster';
    posterEl.alt = movie.title + ' Poster';

    // Genre Tags
    renderGenreTags(movie.genre_ids || []);

    // Reset Save button
    saveBtn.innerHTML = '<i class="fas fa-heart"></i> Save';
    saveBtn.classList.remove('saved');

    // Hide providers while loading
    document.getElementById('providers-section').classList.add('hidden');
    document.getElementById('no-providers').classList.add('hidden');

    // Fetch watch providers
    fetchWatchProviders(movie.id, movie.title);
}

// ================================================
// GENRE TAGS
// ================================================
function renderGenreTags(ids) {
    const container = document.getElementById('genre-tags');
    container.innerHTML = '';
    ids.slice(0, 3).forEach(id => {
        if (genreNames[id]) {
            const tag = document.createElement('span');
            tag.className = 'genre-tag';
            tag.textContent = genreNames[id];
            container.appendChild(tag);
        }
    });
}

// ================================================
// WATCH PROVIDERS (TMDB + JustWatch link)
// ================================================
async function fetchWatchProviders(movieId, movieTitle) {
    const url = `${BASE_URL}/movie/${movieId}/watch/providers?api_key=${API_KEY}`;

    try {
        const res  = await fetch(url);
        const data = await res.json();
        const results = data.results || {};

        // Find first available region from priority list
        let regionData = null;
        for (const region of WATCH_REGIONS) {
            if (results[region]) {
                regionData = results[region];
                break;
            }
        }

        if (regionData) {
            // Prefer flatrate (subscription), then rent, then buy
            const providers = regionData.flatrate
                || regionData.rent
                || regionData.buy
                || [];

            if (providers.length > 0) {
                renderProviders(providers, regionData.link);
                return;
            }
        }

        // No providers found → show JustWatch search link
        showNoProviders(movieTitle);

    } catch (err) {
        console.warn('Watch providers fetch failed:', err);
        showNoProviders(movieTitle);
    }
}

function renderProviders(providers, juswatchLink) {
    const list = document.getElementById('providers-list');
    list.innerHTML = '';

    // Show up to 5 providers
    providers.slice(0, 5).forEach(p => {
        const img = document.createElement('img');
        img.src   = LOGO_URL + p.logo_path;
        img.alt   = p.provider_name;
        img.title = p.provider_name;
        list.appendChild(img);
    });

    // Set JustWatch link
    const link = document.getElementById('justwatch-link');
    link.href  = juswatchLink || 'https://www.justwatch.com';

    document.getElementById('providers-section').classList.remove('hidden');
    document.getElementById('no-providers').classList.add('hidden');
}

function showNoProviders(movieTitle) {
    const searchQuery    = encodeURIComponent(movieTitle);
    const noProvidersEl  = document.getElementById('no-providers');
    const jwSearchLink   = document.getElementById('tmdb-search-link');
    jwSearchLink.href    = `https://www.justwatch.com/us/search?q=${searchQuery}`;
    noProvidersEl.classList.remove('hidden');
    document.getElementById('providers-section').classList.add('hidden');
}

// ================================================
// WATCHLIST — localStorage
// ================================================
function saveToWatchlist(movie) {
    let watchlist = getWatchlist();

    if (watchlist.some(m => m.id === movie.id)) {
        showToast('Already in your watchlist!');
        return;
    }

    watchlist.push({
        id:           movie.id,
        title:        movie.title,
        poster_path:  movie.poster_path,
        release_date: movie.release_date,
        vote_average: movie.vote_average
    });

    localStorage.setItem('moodMatchWatchlist', JSON.stringify(watchlist));
    saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
    saveBtn.classList.add('saved');
    updateBadge();
    showToast(`❤️  "${movie.title}" saved!`);
}

function getWatchlist() {
    return JSON.parse(localStorage.getItem('moodMatchWatchlist')) || [];
}

function updateBadge() {
    const count = getWatchlist().length;
    if (count > 0) {
        watchlistCount.textContent = count > 9 ? '9+' : count;
        watchlistCount.classList.remove('hidden');
    } else {
        watchlistCount.classList.add('hidden');
    }
}

// ---- Watchlist Modal ----
watchlistBtn.addEventListener('click', () => {
    renderWatchlist();
    watchlistModal.classList.remove('hidden');
});

// Close on backdrop click or X
watchlistModal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
watchlistModal.querySelector('.close-modal').addEventListener('click', closeModal);

function closeModal() { watchlistModal.classList.add('hidden'); }

function renderWatchlist() {
    const list      = getWatchlist();
    const container = document.getElementById('watchlist-container');
    const emptyMsg  = document.getElementById('empty-msg');

    container.innerHTML = '';

    if (list.length === 0) {
        emptyMsg.style.display = 'block';
        return;
    }

    emptyMsg.style.display = 'none';

    list.forEach(movie => {
        const item   = document.createElement('div');
        item.className = 'saved-item';
        const year   = movie.release_date ? movie.release_date.split('-')[0] : '';
        const rating = movie.vote_average ? ` ⭐ ${movie.vote_average.toFixed(1)}` : '';
        item.innerHTML = `
            <img src="${movie.poster_path ? IMG_URL + movie.poster_path : 'https://via.placeholder.com/44x60?text=?'}" alt="${movie.title}">
            <div class="saved-item-info">
                <strong>${movie.title}</strong>
                <small>${year}${rating}</small>
            </div>
            <div class="remove-btn" title="Remove" onclick="window.removeFromWatchlist(${movie.id})">
                <i class="fas fa-trash-alt"></i>
            </div>
        `;
        container.appendChild(item);
    });
}

window.removeFromWatchlist = function(id) {
    let list = getWatchlist().filter(m => m.id !== id);
    localStorage.setItem('moodMatchWatchlist', JSON.stringify(list));
    renderWatchlist();
    updateBadge();
    showToast('Removed from watchlist.');
};

// ================================================
// TOAST NOTIFICATIONS
// ================================================
let toastTimer = null;

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    // Force reflow before adding show class
    void toast.offsetWidth;
    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 350);
    }, 2800);
}

// ================================================
// INIT
// ================================================
updateBadge();
