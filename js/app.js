const API_FAVORITES_URL = 'http://localhost:3000/favorites';
const API_FOREM_URL = 'https://www.odwb.be/api/explore/v2.1/catalog/datasets/offres-d-emploi-forem/records';

let state = {
    currentView: 'search',
    jobs: [],
    favorites: [],
    currentPage: 1,
    limit: 21,
    totalCount: 0,
    filters: {
        job: '',
        location: '',
        contract: '',
        dateStart: '',
        dateEnd: ''
    }
};

const jobsContainer = document.getElementById('jobs-container');
const searchForm = document.getElementById('search-form');
const btnToggleFavorites = document.getElementById('btn-toggle-favorites');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const pageInfo = document.getElementById('page-info');
const viewTitle = document.getElementById('view-title');
const paginationNav = document.getElementById('pagination');
const btnBack = document.getElementById('btn-back');

document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    // On attend d'abord de récupérer les favoris (locaux ou distants)
    await fetchFavorites();
    // Ensuite on lance la recherche des jobs
    fetchJobs();
});

function initEventListeners() {
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        state.currentView = 'search';
        state.currentPage = 1;
        state.filters.job = document.getElementById('search-job').value.trim();
        state.filters.location = document.getElementById('search-location').value.trim();
        state.filters.contract = document.getElementById('filter-contract').value;
        state.filters.dateStart = document.getElementById('filter-date-start').value;
        state.filters.dateEnd = document.getElementById('filter-date-end').value;
        fetchJobs();
    });

    btnBack.addEventListener('click', () => {
        state.currentView = 'search';
        btnToggleFavorites.textContent = 'Voir mes Favoris';
        viewTitle.textContent = "Offres d'emploi récentes";
        paginationNav.style.display = 'flex';
        btnBack.style.display = 'none';
        renderJobList();
    });

    btnToggleFavorites.addEventListener('click', () => {
        if (state.currentView === 'search') {
            state.currentView = 'favorites';
            btnToggleFavorites.textContent = 'Voir les offres';
            viewTitle.textContent = 'Mes Offres Favorites (Hors-ligne)';
            paginationNav.style.display = 'none';
            renderFavorites();
        } else {
            state.currentView = 'search';
            btnToggleFavorites.textContent = 'Voir mes Favoris';
            viewTitle.textContent = "Offres d'emploi récentes";
            paginationNav.style.display = 'flex';
            fetchJobs();
        }
    });

    btnPrev.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            fetchJobs();
        }
    });

    btnNext.addEventListener('click', () => {
        if (state.currentPage * state.limit < state.totalCount) {
            state.currentPage++;
            fetchJobs();
        }
    });
}

function extractData(item) {
    const fields = item.fields || item.record?.fields || item.record?.record?.fields || item;
    const id = item.numerooffreforem || item.id || item.record?.id || item.record?.record?.id || fields.id;
    return { id, fields };
}

async function fetchJobs() {
    try {
        const offset = (state.currentPage - 1) * state.limit;
        let url = `${API_FOREM_URL}?limit=${state.limit}&offset=${offset}`;
        let whereClauses = [];

        if (state.filters.job) {
            whereClauses.push(`titreoffre LIKE "%${state.filters.job}%"`);
        }
        if (state.filters.location) {
            whereClauses.push(`(lieuxtravaillocalite LIKE "%${state.filters.location}%" OR lieuxtravailcodepostal LIKE "%${state.filters.location}%")`);
        }
        if (state.filters.contract) {
            whereClauses.push(`typecontrat LIKE "%${state.filters.contract}%"`);
        }
        if (state.filters.dateStart) {
            whereClauses.push(`datedebutdiffusion >= "${state.filters.dateStart}"`);
        }
        if (state.filters.dateEnd) {
            whereClauses.push(`datefindiffusion <= "${state.filters.dateEnd}"`);
        }

        if (whereClauses.length > 0) {
            url += `&where=${encodeURIComponent(whereClauses.join(' AND '))}`;
        }

        console.log("URL de requête ODWB:", url);

        const response = await fetch(url);
        if (!response.ok) throw new Error("Erreur réseau API Forem");
        
        const data = await response.json();

        state.jobs = data.results || data.records || [];
        state.totalCount = data.total_count || 0;

        renderJobList();
        updatePaginationDOM();
    } catch (error) {
        console.warn("Impossible de joindre l'API Forem. Basculement automatique sur les favoris.", error);
        
        // Basculement automatique vers l'affichage hors-ligne
        state.currentView = 'favorites';
        btnToggleFavorites.textContent = 'Voir les offres';
        viewTitle.textContent = 'Mes Offres Favorites (Hors-ligne)';
        paginationNav.style.display = 'none';
        
        renderFavorites();

        // Ajout d'un bandeau d'information dans la grille
        const alertBox = document.createElement('div');
        alertBox.style.gridColumn = '1 / -1';
        alertBox.innerHTML = `
            <div style="color: #d9534f; font-weight: bold; text-align: center; background: #fdf7f7; padding: 12px; border: 1px solid #d9534f; border-radius: 4px; margin-bottom: 20px;">
                ⚠️ Connexion au réseau impossible. Affichage automatique de vos favoris enregistrés.
            </div>
        `;
        jobsContainer.prepend(alertBox);
    }
}

async function fetchFavorites() {
    try {
        const response = await fetch(API_FAVORITES_URL);
        if (!response.ok) throw new Error("Erreur de réponse du serveur JSON");
        
        state.favorites = await response.json();
        localStorage.setItem('fav_backup', JSON.stringify(state.favorites));
        console.log("Favoris synchronisés depuis le serveur JSON.");
    } catch (error) {
        console.warn("Serveur JSON inaccessible. Récupération du backup local.");
        const backup = localStorage.getItem('fav_backup');
        state.favorites = backup ? JSON.parse(backup) : [];
    }
}

async function toggleFavorite(item) {
    const { id, fields } = extractData(item);
    const isFav = state.favorites.find(fav => fav.id === id);

    if (isFav) {
        // Approche optimiste : Mise à jour immédiate locale
        state.favorites = state.favorites.filter(fav => fav.id !== id);
        localStorage.setItem('fav_backup', JSON.stringify(state.favorites));
        
        if (state.currentView === 'favorites') renderFavorites(); else renderJobList();

        // Action asynchrone sur le réseau en tâche de fond
        try {
            await fetch(`${API_FAVORITES_URL}/${id}`, { method: 'DELETE' });
        } catch (error) {
            console.error("Échec de la suppression sur le serveur. Conservé en local.", error);
        }
    } else {
        const newFav = { id, fields };

        // Approche optimiste : Mise à jour immédiate locale
        state.favorites.push(newFav);
        localStorage.setItem('fav_backup', JSON.stringify(state.favorites));
        
        if (state.currentView === 'favorites') renderFavorites(); else renderJobList();

        // Action asynchrone sur le réseau en tâche de fond
        try {
            await fetch(API_FAVORITES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newFav)
            });
        } catch (error) {
            console.error("Échec de l'ajout sur le serveur. Sauvegardé en local.", error);
        }
    }
}

function renderJobList() {
    jobsContainer.innerHTML = '';
    if (state.jobs.length === 0) {
        jobsContainer.innerHTML = '<p>Aucune offre trouvée.</p>';
        return;
    }

    state.jobs.forEach(item => {
        const { id, fields } = extractData(item);
        const isFav = state.favorites.some(fav => fav.id === id);
        
        const localite = (fields.lieuxtravaillocalite && fields.lieuxtravaillocalite.length > 0) ? fields.lieuxtravaillocalite[0] : 'Non renseignée';
        const codePostal = (fields.lieuxtravailcodepostal && fields.lieuxtravailcodepostal.length > 0) ? fields.lieuxtravailcodepostal[0] : '';

        const card = document.createElement('div');
        card.className = 'job-card';
        card.innerHTML = `
            <h3>${fields.titreoffre || 'Offre non spécifiée'}</h3>
            <p><strong>Employeur :</strong> ${fields.nomemployeur || 'Non renseigné'}</p>
            <p><strong>Localité :</strong> ${localite} ${codePostal ? '('+codePostal+')' : ''}</p>
            <button class="btn btn-detail" onclick="renderDetails('${id}')">Voir les détails</button>
            <button class="btn btn-fav">${isFav ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'}</button>
        `;

        card.querySelector('.btn-fav').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(item);
        });

        jobsContainer.appendChild(card);
    });
}

function renderFavorites() {
    jobsContainer.innerHTML = '';
    if (state.favorites.length === 0) {
        jobsContainer.innerHTML = '<p>Aucun favori enregistré pour le moment.</p>';
        return;
    }

    state.favorites.forEach(fav => {
        const { id, fields } = extractData(fav);
        const localite = (fields.lieuxtravaillocalite && fields.lieuxtravaillocalite.length > 0) ? fields.lieuxtravaillocalite[0] : 'Non renseignée';
        const codePostal = (fields.lieuxtravailcodepostal && fields.lieuxtravailcodepostal.length > 0) ? fields.lieuxtravailcodepostal[0] : '';

        const card = document.createElement('div');
        card.className = 'job-card favorite';
        card.innerHTML = `
            <h3>${fields.titreoffre || 'Offre non spécifiée'}</h3>
            <p><strong>Employeur :</strong> ${fields.nomemployeur || 'Non renseigné'}</p>
            <p><strong>Localité :</strong> ${localite} ${codePostal ? '('+codePostal+')' : ''}</p>
            <button class="btn btn-detail" onclick="renderDetails('${id}', true)">Voir les détails</button>
            <button class="btn btn-delete">Supprimer des favoris</button>
        `;

        card.querySelector('.btn-delete').addEventListener('click', () => {
            toggleFavorite(fav);
        });

        jobsContainer.appendChild(card);
    });
}

window.renderDetails = function(id, isFromFav = false) {
    const sourceList = isFromFav ? state.favorites : state.jobs;
    const target = sourceList.find(item => extractData(item).id === id);
    
    if (!target) return;
    const { fields } = extractData(target);

    const secteurs = (fields.secteurs && fields.secteurs.length > 0) ? fields.secteurs.join(', ') : 'Non renseigné';

    // On affiche le bouton retour global et on masque la pagination
    btnBack.style.display = 'inline-block';
    paginationNav.style.display = 'none';

    jobsContainer.innerHTML = `
        <div class="job-detail-view">
            <h2>${fields.nomemployeur || 'Employeur non spécifié'}</h2>
            <div class="detail-content">
                <h3>Poste : ${fields.titreoffre || 'Intitulé non disponible'}</h3>
                <p><strong>Secteur d'activité :</strong> ${secteurs}</p>
                <p><strong>Type de contrat :</strong> ${fields.typecontrat || 'Non spécifié'}</p>
                <p><strong>Niveau d'études / Permis B :</strong> ${fields.niveauxetudes || 'Non spécifié'} / ${fields.permisdeconduire || 'Non requis'}</p>
                <p><a href="${fields.url || '#'}" target="_blank" class="job-link">Lien vers l'offre originale</a></p>
            </div>
        </div>
    `;
};

function updatePaginationDOM() {
    pageInfo.textContent = `Page ${state.currentPage} sur ${Math.ceil(state.totalCount / state.limit) || 1}`;
    btnPrev.disabled = state.currentPage === 1;
    btnNext.disabled = state.currentPage * state.limit >= state.totalCount;
}