// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAiMoMoaZnjCiIPLgpqGOhgY1h6RTsoJEU",
    authDomain: "cinema-fc14a.firebaseapp.com",
    projectId: "cinema-fc14a",
    storageBucket: "cinema-fc14a.firebasestorage.app",
    messagingSenderId: "263722060197",
    appId: "1:263722060197:web:4b2b78b0dde5f53e96c04c",
    measurementId: "G-0HJ0ZB5KM3"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;

// Auth State Observer
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
        try {
            const docRef = db.collection("catalogs").doc(user.uid);
            const docSnap = await docRef.get();
            // Dans Firebase v8 / compat, exists est une propriété, mais dans v9 c'est une fonction.
            // On vérifie donc la présence des données directement pour être robuste.
            const data = docSnap.data ? docSnap.data() : null;
            
            if (data && data.tierlist) {
                STATE.tierlist = data.tierlist;
                saveStateToLocal();
                if (window.location.hash === '#/catalog' || window.location.hash.startsWith('#/tier/')) {
                    handleRoute();
                }
            }
        } catch (error) {
            console.error("Error fetching tierlist:", error);
            showToast("Erreur lors de la récupération du catalogue depuis le cloud.");
        }
    } else {
        STATE.tierlist = JSON.parse(localStorage.getItem('cinemines_tierlist')) || {
            'S': [], 'A': [], 'B': [], 'C': [], 'D': [], 'E': [], 'F': [], 'Unviewed': []
        };
        if (window.location.hash === '#/catalog' || window.location.hash.startsWith('#/tier/')) {
            handleRoute();
        }
    }
    if (window.location.hash === '#/settings') {
        handleRoute();
    }
});

// State Management
const STATE = {
    theme: localStorage.getItem('cinemines_theme') || 'dark',
    tmdbApiKey: localStorage.getItem('cinemines_api_key') || '',
    watchUrl: localStorage.getItem('cinemines_watch_url') || 'https://vfstreaming.com/recherche?q=%s',
    downloadUrl: localStorage.getItem('cinemines_download_url') || 'https://wawacity.com/recherche?q=%s',
    youtubeEmbedType: localStorage.getItem('cinemines_youtube_embed') || 'thumbnail',
    tierlist: JSON.parse(localStorage.getItem('cinemines_tierlist')) || {
        'S': [], 'A': [], 'B': [], 'C': [], 'D': [], 'E': [], 'F': [], 'Unviewed': []
    }
};

const TIERS_COLORS = {
    S: '#ff7f7f', A: '#ffbf7f', B: '#ffff7f', C: '#7fff7f',
    D: '#7fbfff', E: '#7f7fff', F: '#ff7fff', Unviewed: '#888888'
};

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/original';
const PROFILE_BASE_URL = 'https://image.tmdb.org/t/p/w185';

// Discovery & Filter State
let discoveryState = {
    page: 1,
    totalPages: 1,
    query: '', // For text search
    isLoading: false,
    filters: {
        sort_by: 'popularity.desc',
        year: '',
        vote_average: 0,
        with_original_language: '',
        with_genres: []
    }
};

// Global DOM Elements
const globalSearchInput = document.getElementById('global-search-input');
const globalSearchBtn = document.getElementById('global-search-btn');
const sidebar = document.getElementById('filter-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const openFilterBtn = document.getElementById('open-filter-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');

// Save State
let saveTimeout;

function saveState() {
    saveStateToLocal();
    
    if (currentUser) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            try {
                await db.collection("catalogs").doc(currentUser.uid).set({
                    tierlist: STATE.tierlist,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.error("Error saving to Firestore:", error);
                showToast("Erreur lors de la sauvegarde cloud.");
            }
        }, 1000);
    }
}

function saveStateToLocal() {
    localStorage.setItem('cinemines_theme', STATE.theme);
    localStorage.setItem('cinemines_api_key', STATE.tmdbApiKey);
    localStorage.setItem('cinemines_watch_url', STATE.watchUrl);
    localStorage.setItem('cinemines_download_url', STATE.downloadUrl);
    localStorage.setItem('cinemines_youtube_embed', STATE.youtubeEmbedType);
    localStorage.setItem('cinemines_tierlist', JSON.stringify(STATE.tierlist));
    applyTheme();
}

// UI Helpers
function applyTheme() {
    document.body.className = STATE.theme;
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function isMovieInTierlist(id) {
    for (const rank in STATE.tierlist) {
        if (STATE.tierlist[rank].some(m => m.id === id)) return true;
    }
    return false;
}

// Navigation Helper
function navigateToMovie(id) {
    window.location.hash = '#/movie/' + id;
}

// Routing
function handleRoute() {
    const hash = window.location.hash || '#/';
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const content = document.getElementById('app-content');
    content.className = ''; 
    
    window.onscroll = null;
    
    if (hash === '#/') {
        content.classList.add('padded-container');
        renderDiscovery(content);
        document.querySelector('[data-route="discovery"]')?.classList.add('active');
    } else if (hash === '#/catalog') {
        content.classList.add('padded-container');
        renderCatalog(content);
        document.querySelector('[data-route="catalog"]')?.classList.add('active');
    } else if (hash === '#/catalog/all') {
        content.classList.add('padded-container');
        renderAllCatalog(content);
        document.querySelector('[data-route="catalog"]')?.classList.add('active');
    } else if (hash.startsWith('#/tier/')) {
        content.classList.add('padded-container');
        const rank = hash.split('/')[2];
        renderSingleTier(content, rank);
    } else if (hash === '#/settings') {
        content.classList.add('padded-container');
        renderSettings(content);
        document.querySelector('[data-route="settings"]')?.classList.add('active');
    } else if (hash.startsWith('#/movie/')) {
        const id = hash.split('/')[2];
        renderMoviePage(content, id);
    }
    lucide.createIcons();
    window.scrollTo(0, 0);
}

window.addEventListener('hashchange', handleRoute);

// Global Search Event Listeners
globalSearchBtn.addEventListener('click', () => executeGlobalSearch());
globalSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeGlobalSearch();
});

// Mobile Navbar Event Listeners
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const navLinksMenu = document.getElementById('nav-links-menu');
const mobileSearchToggle = document.getElementById('mobile-search-toggle');
const mobileSearchContainer = document.getElementById('mobile-search-container');
const mobileSearchInput = document.getElementById('mobile-search-input');
const mobileSearchSubmit = document.getElementById('mobile-search-submit');

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        navLinksMenu.classList.toggle('active');
        if(mobileSearchContainer) mobileSearchContainer.classList.remove('active');
    });
}

if (mobileSearchToggle) {
    mobileSearchToggle.addEventListener('click', () => {
        mobileSearchContainer.classList.toggle('active');
        if(navLinksMenu) navLinksMenu.classList.remove('active');
        if (mobileSearchContainer.classList.contains('active')) {
            mobileSearchInput.focus();
        }
    });
}

if (mobileSearchSubmit) {
    mobileSearchSubmit.addEventListener('click', () => {
        executeGlobalSearch(mobileSearchInput.value);
        mobileSearchContainer.classList.remove('active');
    });
}
if (mobileSearchInput) {
    mobileSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            executeGlobalSearch(mobileSearchInput.value);
            mobileSearchContainer.classList.remove('active');
        }
    });
}

function executeGlobalSearch(customQuery) {
    const query = (typeof customQuery === 'string' ? customQuery : globalSearchInput.value).trim();
    if (query) {
        discoveryState.query = query;
        // Reset filters when doing a text search (TMDB limitation: search endpoint doesn't support complex filters well)
        resetFiltersUI();
        if (window.location.hash !== '#/') {
            window.location.hash = '#/';
        } else {
            // Already on discovery, trigger reload manually
            discoveryState.page = 1;
            loadMoviesPage();
        }
    }
}

// Sidebar logic
function toggleSidebar(open) {
    if (open) {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
    } else {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    }
}
openFilterBtn.addEventListener('click', () => toggleSidebar(true));
closeSidebarBtn.addEventListener('click', () => toggleSidebar(false));
sidebarOverlay.addEventListener('click', () => toggleSidebar(false));

const voteSlider = document.getElementById('filter-vote');
const voteValDisplay = document.getElementById('filter-vote-val');
voteSlider.addEventListener('input', (e) => {
    voteValDisplay.textContent = e.target.value;
});

document.getElementById('apply-filters-btn').addEventListener('click', () => {
    // Read values
    discoveryState.filters.sort_by = document.getElementById('filter-sort').value;
    discoveryState.filters.year = document.getElementById('filter-year').value;
    discoveryState.filters.vote_average = document.getElementById('filter-vote').value;
    discoveryState.filters.with_original_language = document.getElementById('filter-lang').value;
    
    // Read genres
    const genreCheckboxes = document.querySelectorAll('.genre-checkbox:checked');
    discoveryState.filters.with_genres = Array.from(genreCheckboxes).map(cb => cb.value);

    // Clear text search since we are filtering
    globalSearchInput.value = '';
    discoveryState.query = '';
    
    toggleSidebar(false);
    
    if (window.location.hash !== '#/') {
        window.location.hash = '#/';
    } else {
        discoveryState.page = 1;
        loadMoviesPage();
    }
});

document.getElementById('reset-filters-btn').addEventListener('click', () => {
    resetFiltersUI();
});

function resetFiltersUI() {
    document.getElementById('filter-sort').value = 'popularity.desc';
    document.getElementById('filter-year').value = '';
    document.getElementById('filter-vote').value = '0';
    voteValDisplay.textContent = '0';
    document.getElementById('filter-lang').value = '';
    document.querySelectorAll('.genre-checkbox').forEach(cb => cb.checked = false);
    
    discoveryState.filters = {
        sort_by: 'popularity.desc',
        year: '',
        vote_average: 0,
        with_original_language: '',
        with_genres: []
    };
}

// Fetch Genres on init
async function fetchGenres() {
    if(!STATE.tmdbApiKey) return;
    try {
        const res = await fetch(`${BASE_URL}/genre/movie/list?api_key=${STATE.tmdbApiKey}&language=fr-FR`);
        const data = await res.json();
        const container = document.getElementById('filter-genres');
        container.innerHTML = data.genres.map(g => `
            <label class="genre-label">
                <input type="checkbox" class="genre-checkbox" value="${g.id}">
                ${g.name}
            </label>
        `).join('');
    } catch(e) {
        console.error("Impossible de charger les genres", e);
    }
}

// Views Renderers
function renderSettings(container) {
    const authUI = currentUser ? `
        <div class="form-group" style="padding: 15px; background: rgba(0,255,0,0.05); border: 1px solid var(--border-color); border-radius: 8px;">
            <h3>Compte Connecté</h3>
            <p style="margin: 10px 0;">Email : <strong>${currentUser.email}</strong></p>
            <button id="logout-btn" class="btn" style="width: 100%; justify-content: center;">Se déconnecter</button>
        </div>
    ` : `
        <div class="form-group" style="padding: 15px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 8px;">
            <h3>Connexion Cloud</h3>
            <p style="font-size: 0.9em; margin-bottom: 10px; opacity: 0.8;">Sauvegardez votre catalogue en ligne.</p>
            <input type="email" id="auth-email" placeholder="Email" style="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color);">
            <input type="password" id="auth-password" placeholder="Mot de passe" style="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color);">
            <div style="display: flex; gap: 10px;">
                <button id="login-btn" class="btn primary" style="flex: 1; justify-content: center;">Connexion</button>
                <button id="register-btn" class="btn" style="flex: 1; justify-content: center;">S'inscrire</button>
            </div>
            <button id="google-login-btn" class="btn" style="width: 100%; justify-content: center; margin-top: 10px; background-color: #fff; color: #757575; border: 1px solid #ddd;">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width: 18px; height: 18px; margin-right: 8px;" alt="Google Logo">
                Continuer avec Google
            </button>
        </div>
    `;

    container.innerHTML = `
        <div class="view active settings-container">
            <h2>Paramètres</h2>
            <br>
            ${authUI}
            <div class="form-group">
                <label>Clé API TMDB</label>
                <input type="text" id="api-key-input" value="${STATE.tmdbApiKey}" placeholder="Entrez votre clé API v3">
            </div>
            <div class="form-group">
                <label>URL d'Action : Regarder (utilisez %s pour le titre)</label>
                <input type="text" id="watch-url-input" value="${STATE.watchUrl}" placeholder="https://example.com/watch?q=%s">
            </div>
            <div class="form-group">
                <label>URL d'Action : Télécharger (utilisez %s pour le titre)</label>
                <input type="text" id="download-url-input" value="${STATE.downloadUrl}" placeholder="https://example.com/download?q=%s">
            </div>
            <div class="form-group">
                <label>Style du Lecteur Bande-Annonce</label>
                <select id="youtube-embed-select" class="input-field" style="width: 100%; padding: 12px; background-color: var(--surface-color); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 8px;">
                    <option value="thumbnail" ${STATE.youtubeEmbedType === 'thumbnail' ? 'selected' : ''}>Miniature interactive (Nouvel onglet, anti-extensions sécurisé)</option>
                    <option value="iframe" ${STATE.youtubeEmbedType === 'iframe' ? 'selected' : ''}>Lecteur intégré direct (Iframe Youtube classique)</option>
                </select>
            </div>
            <div class="form-group">
                <button id="toggle-theme-btn" class="btn">
                    <i data-lucide="${STATE.theme === 'dark' ? 'sun' : 'moon'}"></i>
                    Passer au thème ${STATE.theme === 'dark' ? 'Clair' : 'Sombre'}
                </button>
            </div>
            <div class="form-group" style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 2rem;">
                <button id="save-settings-btn" class="btn primary"><i data-lucide="save"></i> Enregistrer</button>
                <button id="export-btn" class="btn icon-only" title="Exporter Galerie"><i data-lucide="download"></i></button>
                <button id="import-trigger-btn" class="btn icon-only" title="Importer Galerie"><i data-lucide="upload"></i></button>
                <input type="file" id="import-btn" accept=".json" style="display:none;">
            </div>
        </div>
    `;

    // Auth Event Listeners
    if (currentUser) {
        document.getElementById('logout-btn').addEventListener('click', () => {
            firebase.auth().signOut().then(() => {
                showToast('Déconnecté avec succès.');
            }).catch(e => showToast("Erreur : " + e.message));
        });
    } else {
        document.getElementById('login-btn').addEventListener('click', () => {
            const email = document.getElementById('auth-email').value;
            const pass = document.getElementById('auth-password').value;
            firebase.auth().signInWithEmailAndPassword(email, pass).then(() => {
                showToast('Connexion réussie !');
            }).catch(e => showToast("Erreur : " + e.message));
        });
        document.getElementById('register-btn').addEventListener('click', () => {
            const email = document.getElementById('auth-email').value;
            const pass = document.getElementById('auth-password').value;
            firebase.auth().createUserWithEmailAndPassword(email, pass).then(() => {
                showToast('Compte créé avec succès !');
            }).catch(e => showToast("Erreur : " + e.message));
        });
        document.getElementById('google-login-btn').addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            firebase.auth().signInWithPopup(provider).then(() => {
                showToast('Connexion Google réussie !');
            }).catch(e => showToast("Erreur Google : " + e.message));
        });
    }

    document.getElementById('save-settings-btn').addEventListener('click', () => {
        STATE.tmdbApiKey = document.getElementById('api-key-input').value;
        STATE.watchUrl = document.getElementById('watch-url-input').value;
        STATE.downloadUrl = document.getElementById('download-url-input').value;
        STATE.youtubeEmbedType = document.getElementById('youtube-embed-select').value;
        saveState();
        fetchGenres(); // Fetch genres if api key just added
        showToast('Paramètres enregistrés !');
    });

    document.getElementById('toggle-theme-btn').addEventListener('click', (e) => {
        STATE.theme = STATE.theme === 'dark' ? 'light' : 'dark';
        saveState();
        handleRoute();
    });

    document.getElementById('export-btn').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(STATE.tierlist));
        const anchor = document.createElement('a');
        anchor.setAttribute("href", dataStr);
        anchor.setAttribute("download", "cinemines_galerie.json");
        anchor.click();
    });

    document.getElementById('import-trigger-btn').addEventListener('click', () => {
        document.getElementById('import-btn').click();
    });

    document.getElementById('import-btn').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    STATE.tierlist = JSON.parse(evt.target.result);
                    saveState();
                    showToast('Galerie importée avec succès !');
                } catch(err) {
                    showToast('Erreur lors de l\'importation');
                }
                // Réinitialiser la valeur pour permettre d'importer le même fichier
                e.target.value = '';
            };
            reader.readAsText(file);
        }
    });
}

function renderDiscovery(container) {
    container.innerHTML = `
        <div class="view active">
            <h2 style="margin-bottom: 20px;">Discovery</h2>
            <div id="movies-grid" class="movies-grid"></div>
            <div id="loading-indicator" style="display:none; text-align:center; padding: 2rem; color: var(--primary-color);">Chargement...</div>
            <div class="pagination" id="pagination-controls" style="display:none;"></div>
        </div>
    `;

    loadMoviesPage();
    window.onscroll = null; // No more infinite scroll
}

async function loadMoviesPage() {
    if (discoveryState.isLoading) return;
    if (!STATE.tmdbApiKey) {
        document.getElementById('movies-grid').innerHTML = '<p>Veuillez configurer votre clé API TMDB dans les paramètres.</p>';
        return;
    }
    
    discoveryState.isLoading = true;
    document.getElementById('movies-grid').innerHTML = '';
    document.getElementById('loading-indicator').style.display = 'block';
    document.getElementById('pagination-controls').style.display = 'none';
    
    let baseUrl = `${BASE_URL}`;
    if (discoveryState.query) {
        baseUrl += `/search/movie?query=${encodeURIComponent(discoveryState.query)}&api_key=${STATE.tmdbApiKey}&language=fr-FR`;
    } else {
        baseUrl += `/discover/movie?api_key=${STATE.tmdbApiKey}&language=fr-FR`;
        
        // Append filters
        const f = discoveryState.filters;
        if (f.sort_by) baseUrl += `&sort_by=${f.sort_by}`;
        if (f.year) baseUrl += `&primary_release_year=${f.year}`;
        if (f.vote_average > 0) baseUrl += `&vote_average.gte=${f.vote_average}`;
        if (f.with_original_language) baseUrl += `&with_original_language=${f.with_original_language}`;
        if (f.with_genres.length > 0) baseUrl += `&with_genres=${f.with_genres.join(',')}`;
    }
        
    try {
        const fetchPromises = [1, 2, 3].map(i => {
            const tmdbPage = (discoveryState.page - 1) * 3 + i;
            return fetch(`${baseUrl}&page=${tmdbPage}`).catch(e => null);
        });
        
        const responses = await Promise.all(fetchPromises);
        const dataArrays = await Promise.all(responses.map(res => (res && res.ok) ? res.json() : {results: []}));
        
        let allResults = [];
        let maxTotalPages = 0;
        
        dataArrays.forEach(data => {
            if (data.results) allResults = allResults.concat(data.results);
            if (data.total_pages && data.total_pages > maxTotalPages) {
                maxTotalPages = data.total_pages;
            }
        });
        
        discoveryState.totalPages = Math.min(Math.ceil(maxTotalPages / 3), Math.ceil(500 / 3));
        
        if (allResults.length > 0) {
            appendMovieCards(allResults, document.getElementById('movies-grid'));
        } else if (discoveryState.page === 1) {
            document.getElementById('movies-grid').innerHTML = '<p>Aucun résultat trouvé.</p>';
        }
        
        // Update pagination UI
        renderPaginationUI(discoveryState.page, discoveryState.totalPages);
    } catch (e) {
        console.error(e);
        document.getElementById('movies-grid').innerHTML = '<p>Erreur de chargement des films.</p>';
    } finally {
        discoveryState.isLoading = false;
        document.getElementById('loading-indicator').style.display = 'none';
        lucide.createIcons();
    }
}

function renderPaginationUI(current, total) {
    const container = document.getElementById('pagination-controls');
    if (total <= 1) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    
    let html = '';
    
    // Prev button
    html += `<button class="page-btn ${current === 1 ? 'disabled' : ''}" onclick="goToPage(${current - 1})"><i data-lucide="chevron-left"></i></button>`;
    
    if (total <= 7) {
        for (let i = 1; i <= total; i++) {
            html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        }
    } else {
        html += `<button class="page-btn ${1 === current ? 'active' : ''}" onclick="goToPage(1)">1</button>`;
        if (current > 3) html += `<span class="page-ellipsis">...</span>`;
        
        let start = Math.max(2, current - 1);
        let end = Math.min(total - 1, current + 1);
        
        if (current === 1) end = 3;
        if (current === total) start = total - 2;
        
        for (let i = start; i <= end; i++) {
            html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        }
        
        if (current < total - 2) html += `<span class="page-ellipsis">...</span>`;
        html += `<button class="page-btn ${total === current ? 'active' : ''}" onclick="goToPage(${total})">${total}</button>`;
    }
    
    // Next button
    html += `<button class="page-btn ${current === total ? 'disabled' : ''}" onclick="goToPage(${current + 1})"><i data-lucide="chevron-right"></i></button>`;
    
    container.innerHTML = html;
    lucide.createIcons();
}

window.goToPage = function(page) {
    if (page < 1 || page > discoveryState.totalPages || page === discoveryState.page) return;
    discoveryState.page = page;
    loadMoviesPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function appendMovieCards(movies, container) {
    if (!container) return;
    movies.forEach(movie => {
        if (!movie.poster_path) return;
        const isFav = isMovieInTierlist(movie.id);
        const btnClass = isFav ? 'add-fav-btn heart-filled' : 'add-fav-btn';
        
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.innerHTML = `
            <img src="${IMAGE_BASE_URL}${movie.poster_path}" alt="${movie.title}" class="movie-poster">
            <div class="movie-info-overlay">
                <div class="movie-title">${movie.title}</div>
            </div>
            <button class="${btnClass}" title="${isFav ? 'Déjà dans le catalogue' : 'Ajouter à Pas vu'}" 
                    onclick="event.stopPropagation(); addToUnviewed(this, ${movie.id}, '${movie.title.replace(/'/g, "\\'")}', '${movie.poster_path}')">
                <i data-lucide="heart"></i>
            </button>
        `;
        card.addEventListener('click', () => navigateToMovie(movie.id));
        container.appendChild(card);
    });
    lucide.createIcons();
}

window.addToUnviewed = function(btnElement, id, title, poster) {
    if (isMovieInTierlist(id)) {
        showToast(`Ce film est déjà dans votre catalogue.`);
        return;
    }
    
    STATE.tierlist.Unviewed.push({ id, title, poster });
    saveState();
    
    btnElement.classList.add('heart-filled');
    showToast(`${title} ajouté à 'Pas vu'`);
};

function renderCatalog(container) {
    let html = `
        <div class="view active">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2>Votre Catalogue</h2>
                <a href="#/catalog/all" class="btn primary">Tout voir</a>
            </div>
            <br>
    `;
    
    const orderedRanks = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'Unviewed'];
    for (const rank of orderedRanks) {
        if (!STATE.tierlist[rank]) continue;
        html += `
            <div class="tier-row" data-rank="${rank}">
                <div class="tier-label" style="background-color: ${TIERS_COLORS[rank]};" onclick="window.location.hash='#/tier/${rank}'">
                    ${rank === 'Unviewed' ? 'Pas vu' : rank}
                </div>
                <div class="tier-movies" id="tier-${rank}">
                    ${STATE.tierlist[rank].map(movie => `
                        <img src="${IMAGE_BASE_URL}${movie.poster}" alt="${movie.title}" 
                             class="tier-movie" draggable="true" 
                             data-id="${movie.id}" data-rank="${rank}"
                             onclick="navigateToMovie(${movie.id})">
                    `).join('')}
                </div>
            </div>
        `;
    }
    html += `</div>`;
    container.innerHTML = html;
    setupDragAndDrop();
}

function renderAllCatalog(container) {
    let rankedMovies = [];
    const ranks = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
    ranks.forEach(r => {
        if (STATE.tierlist[r]) {
            rankedMovies = rankedMovies.concat(STATE.tierlist[r]);
        }
    });
    
    const unviewedMovies = STATE.tierlist['Unviewed'] || [];
    
    container.innerHTML = `
        <div class="view active" style="padding-top: 40px; position: relative;">
            <a href="javascript:history.back()" class="back-btn" style="top: -10px; left: 0;">
                <i data-lucide="arrow-left"></i> Retour
            </a>
            
            <h2 style="margin-bottom: 20px;">Tous les films classés (${rankedMovies.length})</h2>
            <div class="movies-grid" id="ranked-grid"></div>
            
            <hr style="margin: 3rem 0; border: 1px solid var(--border-color);">
            
            <h2 style="margin-bottom: 20px;">Les films non vus (${unviewedMovies.length})</h2>
            <div class="movies-grid" id="unviewed-grid"></div>
        </div>
    `;
    
    const renderCards = (movies, gridId) => {
        const grid = document.getElementById(gridId);
        movies.forEach(movie => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.innerHTML = `
                <img src="${IMAGE_BASE_URL}${movie.poster}" alt="${movie.title}" class="movie-poster">
                <div class="movie-info-overlay">
                    <div class="movie-title">${movie.title}</div>
                </div>
            `;
            card.addEventListener('click', () => navigateToMovie(movie.id));
            grid.appendChild(card);
        });
    };
    
    renderCards(rankedMovies, 'ranked-grid');
    renderCards(unviewedMovies, 'unviewed-grid');
}

function renderSingleTier(container, rank) {
    if (!STATE.tierlist[rank]) return handleRoute();

    container.innerHTML = `
        <div class="view active" style="padding-top: 40px; position: relative;">
            <a href="javascript:history.back()" class="back-btn" style="top: -10px; left: 0;">
                <i data-lucide="arrow-left"></i> Retour
            </a>
            <h2 style="color: ${TIERS_COLORS[rank]}">Rang : ${rank === 'Unviewed' ? 'Pas vu' : rank}</h2>
            <br>
            <div class="movies-grid"></div>
        </div>
    `;

    const grid = container.querySelector('.movies-grid');
    STATE.tierlist[rank].forEach(movie => {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.innerHTML = `
            <img src="${IMAGE_BASE_URL}${movie.poster}" alt="${movie.title}" class="movie-poster">
            <div class="movie-info-overlay">
                <div class="movie-title">${movie.title}</div>
            </div>
        `;
        card.addEventListener('click', () => navigateToMovie(movie.id));
        grid.appendChild(card);
    });
}

// Drag and Drop Logic
let draggedElement = null;

function setupDragAndDrop() {
    const movies = document.querySelectorAll('.tier-movie');
    const containers = document.querySelectorAll('.tier-movies');

    movies.forEach(movie => {
        movie.addEventListener('dragstart', (e) => {
            draggedElement = movie;
            setTimeout(() => movie.style.opacity = '0.5', 0);
        });
        
        movie.addEventListener('dragend', () => {
            movie.style.opacity = '1';
            containers.forEach(c => c.classList.remove('drag-over'));
            draggedElement = null;
        });
    });

    containers.forEach(container => {
        container.addEventListener('dragover', e => {
            e.preventDefault();
            container.classList.add('drag-over');
            
            if (draggedElement) {
                const afterElement = getDragAfterElement(container, e.clientX);
                if (afterElement == null) {
                    container.appendChild(draggedElement);
                } else {
                    container.insertBefore(draggedElement, afterElement);
                }
            }
        });

        container.addEventListener('dragleave', () => {
            container.classList.remove('drag-over');
        });

        container.addEventListener('drop', e => {
            e.preventDefault();
            container.classList.remove('drag-over');
            
            if (draggedElement) {
                const toRank = container.parentElement.dataset.rank;
                draggedElement.dataset.rank = toRank;
                updateTierlistStateFromDOM();
            }
        });
    });
}

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.tier-movie:not([style*="opacity: 0.5"])')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateTierlistStateFromDOM() {
    const containers = document.querySelectorAll('.tier-row');
    const allMoviesObj = {};
    
    for (const rank in STATE.tierlist) {
        STATE.tierlist[rank].forEach(m => allMoviesObj[m.id] = m);
    }
    
    containers.forEach(row => {
        const rank = row.dataset.rank;
        const moviesInDOM = row.querySelectorAll('.tier-movie');
        
        const newMovies = [];
        moviesInDOM.forEach(movieEl => {
            const id = parseInt(movieEl.dataset.id);
            if (allMoviesObj[id]) {
                newMovies.push(allMoviesObj[id]);
            }
        });
        
        STATE.tierlist[rank] = newMovies;
    });
    
    saveState();
}

// Full Page Movie Logic
async function renderMoviePage(container, id) {
    if(!STATE.tmdbApiKey) {
        container.innerHTML = '<div class="padded-container"><p>Veuillez configurer votre clé API TMDB pour voir les films.</p></div>';
        return;
    }
    
    container.innerHTML = '<div class="padded-container"><p>Chargement du film...</p></div>';

    try {
        const [movieRes, creditsRes, recoRes] = await Promise.all([
            fetch(`${BASE_URL}/movie/${id}?api_key=${STATE.tmdbApiKey}&language=fr-FR&append_to_response=videos&include_video_language=fr,en`),
            fetch(`${BASE_URL}/movie/${id}/credits?api_key=${STATE.tmdbApiKey}&language=fr-FR`),
            fetch(`${BASE_URL}/movie/${id}/recommendations?api_key=${STATE.tmdbApiKey}&language=fr-FR`)
        ]);
        
        const movie = await movieRes.json();
        const credits = await creditsRes.json();
        const recommendations = await recoRes.json();
        
        let trailerKey = null;
        if (movie.videos && movie.videos.results) {
            const ytVideos = movie.videos.results.filter(v => v.site === 'YouTube');
            const officialTrailers = ytVideos.filter(v => v.type === 'Trailer' && v.official);
            const otherTrailers = ytVideos.filter(v => v.type === 'Trailer' && !v.official);
            const teasers = ytVideos.filter(v => v.type === 'Teaser');
            
            if (officialTrailers.length > 0) trailerKey = officialTrailers[0].key;
            else if (otherTrailers.length > 0) trailerKey = otherTrailers[0].key;
            else if (teasers.length > 0) trailerKey = teasers[0].key;
            else if (ytVideos.length > 0) trailerKey = ytVideos[0].key;
        }
        
        const watchUrl = STATE.watchUrl.replace('%s', encodeURIComponent(movie.title));
        const downloadUrl = STATE.downloadUrl.replace('%s', encodeURIComponent(movie.title));
        
        const backdropPath = movie.backdrop_path 
            ? `${BACKDROP_BASE_URL}${movie.backdrop_path}` 
            : `${IMAGE_BASE_URL}${movie.poster_path}`;

        let currentRank = '';
        for (const rank in STATE.tierlist) {
            if (STATE.tierlist[rank].some(m => m.id === parseInt(id))) {
                currentRank = rank;
                break;
            }
        }

        container.innerHTML = `
            <div class="view active movie-page">
                <a href="javascript:history.back()" class="back-btn">
                    <i data-lucide="arrow-left"></i> Retour
                </a>
                <div class="hero-banner" style="background-image: url('${backdropPath}')">
                    <div class="hero-gradient"></div>
                    <div class="hero-content">
                        <div class="hero-title-area">
                            <h1 class="hero-title">${movie.title}</h1>
                            <div class="hero-meta">
                                ${movie.release_date ? movie.release_date.split('-')[0] : 'N/A'} • 
                                ${movie.genres.map(g => g.name).join(', ')} • 
                                ⭐ ${movie.vote_average.toFixed(1)}/10
                            </div>
                        </div>
                        <div class="hero-actions">
                            <select class="rank-select" onchange="changeMovieRank(${movie.id}, '${movie.title.replace(/'/g, "\\'")}', '${movie.poster_path}', this.value)">
                                <option value="" ${!currentRank ? 'selected' : ''}>-- Non classé --</option>
                                <option value="S" ${currentRank === 'S' ? 'selected' : ''}>Rang S</option>
                                <option value="A" ${currentRank === 'A' ? 'selected' : ''}>Rang A</option>
                                <option value="B" ${currentRank === 'B' ? 'selected' : ''}>Rang B</option>
                                <option value="C" ${currentRank === 'C' ? 'selected' : ''}>Rang C</option>
                                <option value="D" ${currentRank === 'D' ? 'selected' : ''}>Rang D</option>
                                <option value="E" ${currentRank === 'E' ? 'selected' : ''}>Rang E</option>
                                <option value="F" ${currentRank === 'F' ? 'selected' : ''}>Rang F</option>
                                <option value="Unviewed" ${currentRank === 'Unviewed' ? 'selected' : ''}>Pas vu</option>
                            </select>
                            <a href="${watchUrl}" target="_blank" class="btn primary" title="Regarder">
                                <i data-lucide="play"></i> <span class="desktop-only">Regarder</span>
                            </a>
                            <a href="${downloadUrl}" target="_blank" class="btn" title="Télécharger">
                                <i data-lucide="download"></i>
                            </a>
                        </div>
                    </div>
                </div>
                
                <div class="movie-details-section">
                    <div class="synopsis-container">
                        ${trailerKey ? (STATE.youtubeEmbedType === 'iframe' ? `
                        <div class="movie-trailer">
                            <iframe src="https://www.youtube-nocookie.com/embed/${trailerKey}?origin=http://localhost" allowfullscreen style="border:none;"></iframe>
                        </div>
                        ` : `
                        <a href="https://www.youtube.com/watch?v=${trailerKey}" target="_blank" class="movie-trailer" style="display: block; position: relative; text-decoration: none; background-color: #000;">
                            <img src="https://img.youtube.com/vi/${trailerKey}/maxresdefault.jpg" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://img.youtube.com/vi/${trailerKey}/hqdefault.jpg'">
                            <div class="ytp-play-button-overlay">
                                <i data-lucide="play" stroke="none" style="width:24px; height:24px; fill:currentColor; margin-left: 4px;"></i>
                            </div>
                        </a>
                        `) : ''}
                        <div class="movie-overview-box">
                            <h2 class="section-title">Synopsis</h2>
                            <div class="movie-overview">
                                ${movie.overview || 'Aucun synopsis disponible.'}
                            </div>
                        </div>
                    </div>
                    
                    <h2 class="section-title">Distribution</h2>
                    <div class="actor-list">
                        ${credits.cast.slice(0, 15).map(actor => {
                            const imgPath = actor.profile_path 
                                ? `${PROFILE_BASE_URL}${actor.profile_path}` 
                                : 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2280%22%20height%3D%2280%22%20fill%3D%22%23aaa%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E';
                            return `
                            <a href="https://www.google.com/search?q=${encodeURIComponent(actor.name)}" target="_blank" class="actor-card">
                                <img src="${imgPath}" alt="${actor.name}" class="actor-img">
                                <span class="actor-name">${actor.name}</span>
                            </a>
                            `;
                        }).join('')}
                    </div>
                    
                    <h2 class="section-title">Titres similaires</h2>
                    <div class="movies-grid" id="reco-grid"></div>
                </div>
            </div>
        `;
        
        if (recommendations.results.length > 0) {
            appendMovieCards(recommendations.results.slice(0, 10), document.getElementById('reco-grid'));
        } else {
            document.getElementById('reco-grid').innerHTML = '<p>Aucune recommandation trouvée.</p>';
        }
        
        lucide.createIcons();
    } catch (e) {
        container.innerHTML = '<div class="padded-container"><p>Erreur lors de la récupération des détails.</p></div>';
    }
}

window.changeMovieRank = function(id, title, poster, newRank) {
    for (const rank in STATE.tierlist) {
        const index = STATE.tierlist[rank].findIndex(m => m.id === id);
        if (index > -1) {
            STATE.tierlist[rank].splice(index, 1);
        }
    }
    
    if (newRank && STATE.tierlist[newRank]) {
        STATE.tierlist[newRank].push({ id, title, poster });
        showToast(`${title} classé dans : ${newRank === 'Unviewed' ? 'Pas vu' : newRank}`);
    } else {
        showToast(`${title} retiré du catalogue.`);
    }
    
    saveState();
};

// Init
fetchGenres();
applyTheme();
handleRoute();
