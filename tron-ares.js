// --------- DATA MODEL ---------
const channels = [];      // Liste M3U principale
const frChannels = [];    // Liste M3U FR
const iframeItems = [];   // Overlays / iFrames

let currentIndex = -1;
let currentFrIndex = -1;
let currentIframeIndex = -1;
let currentListType = null; // 'channels' | 'fr' | 'iframe'

let overlayMode = false;

let hlsInstance = null;
let dashInstance = null;

let currentEntry = null;
let externalFallbackTried = false;

// --------- DOM REFS ---------
const videoEl = document.getElementById('videoEl');
const iframeOverlay = document.getElementById('iframeOverlay');
const iframeEl = document.getElementById('iframeEl');

const channelFrListEl = document.getElementById('channelFrList');
const channelListEl = document.getElementById('channelList');
const iframeListEl = document.getElementById('iframeList');
const favoriteListEl = document.getElementById('favoriteList');

const statusPill = document.getElementById('statusPill');
const npLogo = document.getElementById('npLogo');
const npTitle = document.getElementById('npTitle');
const npSub = document.getElementById('npSub');
const npBadge = document.getElementById('npBadge');

const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');

const urlInput = document.getElementById('urlInput');
const loadUrlBtn = document.getElementById('loadUrlBtn');
const fileInput = document.getElementById('fileInput');
const openFileBtn = document.getElementById('openFileBtn');
const fileNameLabel = document.getElementById('fileNameLabel');

const iframeTitleInput = document.getElementById('iframeTitleInput');
const iframeUrlInput = document.getElementById('iframeUrlInput');
const addIframeBtn = document.getElementById('addIframeBtn');

const exportM3uJsonBtn = document.getElementById('exportM3uJsonBtn');
const exportIframeJsonBtn = document.getElementById('exportIframeJsonBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const jsonArea = document.getElementById('jsonArea');

const toggleOverlayBtn = document.getElementById('toggleOverlayBtn');
const fullPageBtn = document.getElementById('fullPageBtn');
const playerContainer = document.getElementById('playerContainer');
const appShell = document.getElementById('appShell');

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

const fxToggleBtn = document.getElementById('fxToggleBtn');
const pipToggleBtn = document.getElementById('pipToggleBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');

// --------- UTILS ---------

function setStatus(text) {
  statusPill.textContent = text;
}

function normalizeName(name) {
  return name || 'Flux sans titre';
}

function deriveLogoFromName(name) {
  const initial = (name || '?').trim()[0] || '?';
  return { type: 'letter', value: initial.toUpperCase() };
}

function isProbablyHls(url) {
  return /\.m3u8(\?|$)/i.test(url);
}

function isProbablyDash(url) {
  return /\.mpd(\?|$)/i.test(url);
}

function isProbablyPlaylist(url) {
  return /\.m3u8?(\?|$)/i.test(url);
}

function isYoutubeUrl(url) {
  return /youtu\.be|youtube\.com/i.test(url);
}

function youtubeToEmbed(url) {
  try {
    const u = new URL(url, window.location.href);
    let id = null;
    if (u.hostname.includes('youtu.be')) {
      id = u.pathname.replace('/', '');
    } else {
      id = u.searchParams.get('v');
    }
    return id ? `https://www.youtube.com/embed/${id}` : url;
  } catch {
    return url;
  }
}

// --------- RENDERING ---------

function renderLists() {
  renderChannelList();
  renderChannelFrList();
  renderIframeList();
  renderFavoritesList();
}

function renderChannelFrList() {
  channelFrListEl.innerHTML = '';
  frChannels.forEach((ch, idx) => {
    const el = createChannelElement(ch, idx, 'fr');
    channelFrListEl.appendChild(el);
  });
}

function createChannelElement(entry, index, sourceType) {
  const li = document.createElement('div');
  li.className = 'channel-item';
  li.dataset.index = index;
  li.dataset.type = sourceType;

  if (sourceType === 'channels' && currentListType === 'channels' && index === currentIndex) {
    li.classList.add('active');
  }
  if (sourceType === 'fr' && currentListType === 'fr' && index === currentFrIndex) {
    li.classList.add('active');
  }
  if (sourceType === 'iframe' && currentListType === 'iframe' && index === currentIframeIndex) {
    li.classList.add('active');
  }

  const logoDiv = document.createElement('div');
  logoDiv.className = 'channel-logo';
  if (entry.logo && entry.logo.type === 'image') {
    const img = document.createElement('img');
    img.src = entry.logo.value;
    img.alt = entry.name;
    logoDiv.appendChild(img);
  } else {
    logoDiv.textContent = entry.logo?.value ?? deriveLogoFromName(entry.name).value;
  }

  const metaDiv = document.createElement('div');
  metaDiv.className = 'channel-meta';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'channel-title';
  titleDiv.textContent = normalizeName(entry.name);

  const subDiv = document.createElement('div');
  subDiv.className = 'channel-sub';
  subDiv.textContent = entry.group || (entry.isIframe ? 'Overlay / iFrame' : 'Flux M3U');

  const tagsDiv = document.createElement('div');
  tagsDiv.className = 'channel-tags';

  const tag = document.createElement('div');
  tag.className = 'tag-chip' + (entry.isIframe ? ' tag-chip--iframe' : '');
  tag.textContent = entry.isIframe ? 'IFRAME' : 'STREAM';
  tagsDiv.appendChild(tag);

  if (isYoutubeUrl(entry.url)) {
    const ytTag = document.createElement('div');
    ytTag.className = 'tag-chip tag-chip--iframe';
    ytTag.textContent = 'YOUTUBE';
    tagsDiv.appendChild(ytTag);
  }

  metaDiv.appendChild(titleDiv);
  metaDiv.appendChild(subDiv);
  metaDiv.appendChild(tagsDiv);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'channel-actions';

  const favBtn = document.createElement('button');
  favBtn.className = 'icon-btn';
  favBtn.innerHTML = '★';
  favBtn.title = 'Ajouter / enlever des favoris';
  favBtn.dataset.fav = entry.isFavorite ? 'true' : 'false';
  if (entry.isFavorite) {
    favBtn.setAttribute('data-fav', 'true');
  }

  favBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    entry.isFavorite = !entry.isFavorite;
    favBtn.dataset.fav = entry.isFavorite ? 'true' : 'false';
    if (entry.isFavorite) {
      favBtn.setAttribute('data-fav', 'true');
    } else {
      favBtn.removeAttribute('data-fav');
    }
    renderFavoritesList();
  });

  const ovBtn = document.createElement('button');
  ovBtn.className = 'icon-btn';
  ovBtn.innerHTML = '⧉';
  ovBtn.title = 'Lire cette source en overlay iFrame';
  ovBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    playEntryAsOverlay(entry);
  });

  actionsDiv.appendChild(favBtn);
  actionsDiv.appendChild(ovBtn);

  li.appendChild(logoDiv);
  li.appendChild(metaDiv);
  li.appendChild(actionsDiv);

  li.addEventListener('click', () => {
    if (sourceType === 'channels') {
      playChannel(index);
    } else if (sourceType === 'fr') {
      playFrChannel(index);
    } else if (sourceType === 'iframe') {
      playIframe(index);
    }
  });

  return li;
}

function renderChannelList() {
  channelListEl.innerHTML = '';
  channels.forEach((ch, idx) => {
    const el = createChannelElement(ch, idx, 'channels');
    channelListEl.appendChild(el);
  });
}

function renderIframeList() {
  iframeListEl.innerHTML = '';
  iframeItems.forEach((item, idx) => {
    const el = createChannelElement(item, idx, 'iframe');
    iframeListEl.appendChild(el);
  });
}

function renderFavoritesList() {
  favoriteListEl.innerHTML = '';
  const favs = [
    ...channels.filter(c => c.isFavorite),
    ...frChannels.filter(c => c.isFavorite),
    ...iframeItems.filter(i => i.isFavorite)
  ];
  favs.forEach((entry, idx) => {
    const el = createChannelElement(entry, idx, entry.listType || (entry.isIframe ? 'iframe' : 'channels'));
    favoriteListEl.appendChild(el);
  });
}

function updateNowPlaying(entry, modeLabel) {
  if (!entry) {
    npLogo.textContent = '';
    npTitle.textContent = 'Aucune chaîne sélectionnée';
    npSub.textContent = 'Choisissez une chaîne dans la liste';
    npBadge.textContent = 'IDLE';
    return;
  }

  const logo = entry.logo || deriveLogoFromName(entry.name);
  npLogo.innerHTML = '';
  if (logo.type === 'image') {
    const img = document.createElement('img');
    img.src = logo.value;
    img.alt = entry.name;
    npLogo.appendChild(img);
  } else {
    npLogo.textContent = logo.value;
  }

  npTitle.textContent = normalizeName(entry.name);
  npSub.textContent = entry.group || (entry.isIframe ? 'Overlay / iFrame' : 'Flux M3U');
  npBadge.textContent = modeLabel;
}

// --------- PLAYER LOGIC ---------

function destroyHls() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}

function destroyDash() {
  if (dashInstance) {
    try {
      dashInstance.reset();
    } catch (e) {}
    dashInstance = null;
  }
}

function showVideo() {
  overlayMode = false;
  iframeOverlay.classList.add('hidden');
  iframeEl.src = 'about:blank';
  videoEl.style.visibility = 'visible';
}

function showIframe() {
  overlayMode = true;
  iframeOverlay.classList.remove('hidden');
  videoEl.pause();
  videoEl.style.visibility = 'hidden';
}

function playEntryAsOverlay(entry) {
  if (!entry || !entry.url) return;
  showIframe();

  let url = entry.url;
  if (isYoutubeUrl(url)) {
    url = youtubeToEmbed(url);
    url += (url.includes('?') ? '&' : '?') + 'autoplay=1&mute=1';
  }

  iframeEl.src = url;
  updateNowPlaying(entry, 'IFRAME');
  setStatus('Overlay iFrame actif');
}

function fallbackToExternalPlayer(entry) {
  if (!entry || !entry.url) return;
  const base = 'https://vsalema.github.io/play/?';
  const extUrl = base + encodeURIComponent(entry.url);

  showIframe();
  iframeEl.src = extUrl;
  updateNowPlaying(entry, 'EXT-PLAYER');
  setStatus('Lecture via lecteur externe');
}

function playUrl(entry) {
  if (!entry || !entry.url) return;

  currentEntry = entry;
  externalFallbackTried = false;

  const url = entry.url;

  const forceExternal =
    /rtp\.pt/i.test(url) ||
    /smil:/i.test(url);

  if (forceExternal) {
    fallbackToExternalPlayer(entry);
    return;
  }

  if (entry.isIframe || isYoutubeUrl(url)) {
    playEntryAsOverlay(entry);
    return;
  }

  showVideo();
  destroyHls();
  destroyDash();

  videoEl.removeAttribute('src');
  videoEl.load();

  let modeLabel = 'VIDEO';

  if (isProbablyDash(url) && window.dashjs) {
    try {
      dashInstance = dashjs.MediaPlayer().create();
      dashInstance.updateSettings({
        streaming: {
          lowLatencyEnabled: false,
          stableBufferTime: 20,
          bufferTimeAtTopQuality: 30
        }
      });
      dashInstance.initialize(videoEl, url, true);
      modeLabel = 'DASH';

      dashInstance.on(dashjs.MediaPlayer.events.ERROR, (e) => {
        console.error('DASH error:', e);
        setStatus('Erreur DASH');
        npBadge.textContent = 'ERREUR';
        try {
          videoEl.src = url;
          videoEl.play().catch(() => {});
          setStatus('Fallback HTML5');
          npBadge.textContent = 'FALLBACK';
        } catch (e2) {
          console.error('Fallback HTML5 error:', e2);
        }
      });
    } catch (e) {
      console.error('DASH init error:', e);
      modeLabel = 'VIDEO';
      videoEl.src = url;
    }
  } else if (isProbablyHls(url) && window.Hls && Hls.isSupported()) {
    hlsInstance = new Hls();
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(videoEl);
    modeLabel = 'HLS';

    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS error:', data);
      if (!externalFallbackTried && data.fatal && currentEntry) {
        externalFallbackTried = true;
        fallbackToExternalPlayer(currentEntry);
      }
    });
  } else {
    videoEl.src = url;
    if (url.match(/\.(mp3|aac|ogg)(\?|$)/i)) {
      modeLabel = 'AUDIO';
    } else {
      modeLabel = 'VIDEO';
    }
  }

  videoEl.play().catch(() => {});
  updateNowPlaying(entry, modeLabel);
  setStatus('Lecture en cours');
}

function playChannel(index) {
  if (index < 0 || index >= channels.length) return;
  currentListType = 'channels';
  currentIndex = index;
  const entry = channels[index];
  renderChannelList();
  playUrl(entry);
}

function playFrChannel(index) {
  if (index < 0 || index >= frChannels.length) return;
  currentListType = 'fr';
  currentFrIndex = index;
  const entry = frChannels[index];
  renderChannelFrList();
  playUrl(entry);
}

function playIframe(index) {
  if (index < 0 || index >= iframeItems.length) return;
  currentListType = 'iframe';
  currentIframeIndex = index;
  renderIframeList();
  const entry = iframeItems[index];
  playUrl(entry);
}

function playNext() {
  if (currentListType === 'fr') {
    if (!frChannels.length) return;
    if (currentFrIndex === -1) {
      playFrChannel(0);
    } else {
      playFrChannel((currentFrIndex + 1) % frChannels.length);
    }
  } else if (currentListType === 'iframe') {
    if (!iframeItems.length) return;
    if (currentIframeIndex === -1) {
      playIframe(0);
    } else {
      playIframe((currentIframeIndex + 1) % iframeItems.length);
    }
  } else {
    if (!channels.length) return;
    if (currentIndex === -1) {
      playChannel(0);
    } else {
      playChannel((currentIndex + 1) % channels.length);
    }
  }
}

function playPrev() {
  if (currentListType === 'fr') {
    if (!frChannels.length) return;
    if (currentFrIndex === -1) {
      playFrChannel(frChannels.length - 1);
    } else {
      playFrChannel((currentFrIndex - 1 + frChannels.length) % frChannels.length);
    }
  } else if (currentListType === 'iframe') {
    if (!iframeItems.length) return;
    if (currentIframeIndex === -1) {
      playIframe(iframeItems.length - 1);
    } else {
      playIframe((currentIframeIndex - 1 + iframeItems.length) % iframeItems.length);
    }
  } else {
    if (!channels.length) return;
    if (currentIndex === -1) {
      playChannel(channels.length - 1);
    } else {
      playChannel((currentIndex - 1 + channels.length) % channels.length);
    }
  }
}

// --------- M3U PARSER ---------

function parseM3U(content, listType = 'channels', defaultGroup = 'Playlist') {
  const lines = content.split(/\r?\n/);
  const results = [];
  let lastInf = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#EXTM3U')) continue;

    if (line.startsWith('#EXTINF')) {
      lastInf = line;
    } else if (line.startsWith('#')) {
    } else {
      const url = line;
      let name = 'Sans titre';
      let logo = null;
      let group = '';

      if (lastInf) {
        const nameMatch = lastInf.split(',').slice(-1)[0].trim();
        if (nameMatch) name = nameMatch;

        const logoMatch = lastInf.match(/tvg-logo="([^"]+)"/i);
        if (logoMatch) {
          logo = { type: 'image', value: logoMatch[1] };
        }

        const groupMatch = lastInf.match(/group-title="([^"]+)"/i);
        if (groupMatch) {
          group = groupMatch[1];
        }
      }

      const entry = {
        id: listType + '-ch-' + (results.length + 1),
        name,
        url,
        logo: logo || deriveLogoFromName(name),
        group: group || defaultGroup,
        isIframe: isYoutubeUrl(url),
        isFavorite: false,
        listType
      };

      results.push(entry);
      lastInf = null;
    }
  }

  return results;
}

// --------- LOADERS ---------

async function loadFromUrl(url) {
  if (!url) return;
  setStatus('Chargement…');

  try {
    if (isProbablyPlaylist(url)) {
      const res = await fetch(url);
      const text = await res.text();

      if (text.trim().startsWith('#EXTM3U')) {
        const parsed = parseM3U(text, 'channels', 'Playlist');
        parsed.forEach(ch => channels.push(ch));
        renderLists();
        if (parsed.length && currentIndex === -1 && currentListType !== 'channels') {
          playChannel(channels.length - parsed.length);
        }
        setStatus('Playlist chargée (' + parsed.length + ' entrées)');
      } else {
        const entry = {
          id: 'channels-single-url-' + (channels.length + 1),
          name: url,
          url,
          logo: deriveLogoFromName('S'),
          group: 'Single URL',
          isIframe: isYoutubeUrl(url),
          isFavorite: false,
          listType: 'channels'
        };
        channels.push(entry);
        renderLists();
        playChannel(channels.length - 1);
        setStatus('Flux chargé');
      }
    } else {
      const entry = {
        id: 'channels-single-url-' + (channels.length + 1),
        name: url,
        url,
        logo: deriveLogoFromName('S'),
        group: 'Single URL',
        isIframe: isYoutubeUrl(url),
        isFavorite: false,
        listType: 'channels'
      };
      channels.push(entry);
      renderLists();
      playChannel(channels.length - 1);
      setStatus('Flux chargé');
    }
  } catch (e) {
    console.error(e);
    setStatus('Erreur de chargement (CORS / réseau)');
    alert(
      'Impossible de charger cette URL dans le navigateur.\n' +
      'Ça peut venir d’un blocage CORS ou d’un problème réseau.\n' +
      'Si c’est un flux IPTV, il est peut-être prévu pour une app native (VLC, box, etc.), pas pour le web.'
    );
  }
}

async function loadFrM3u(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();

    if (!text.trim().startsWith('#EXTM3U')) {
      console.error('Fichier FR non valide');
      return;
    }

    const parsed = parseM3U(text, 'fr', 'FR');
    parsed.forEach(ch => frChannels.push(ch));
    renderChannelFrList();
    setStatus('Chaînes FR chargées : ' + parsed.length);
  } catch (e) {
    console.error('Erreur M3U FR', e);
    setStatus('Erreur M3U FR');
  }
}

function loadFromFile(file) {
  if (!file) return;
  fileNameLabel.textContent = file.name;
  setStatus('Lecture du fichier local…');

  const reader = new FileReader();

  if (/\.m3u8?$/i.test(file.name)) {
    reader.onload = () => {
      const text = reader.result.toString();
      const parsed = parseM3U(text, 'channels', 'Playlist locale');
      parsed.forEach(ch => channels.push(ch));
      renderLists();
      if (parsed.length && currentIndex === -1 && currentListType !== 'channels') {
        playChannel(channels.length - parsed.length);
      }
      setStatus('Playlist locale chargée (' + parsed.length + ' entrées)');
    };
    reader.readAsText(file);
  } else {
    const objectUrl = URL.createObjectURL(file);
    const entry = {
      id: 'local-' + (channels.length + 1),
      name: file.name,
      url: objectUrl,
      logo: deriveLogoFromName(file.name),
      group: 'Local',
      isIframe: false,
      isFavorite: false,
      listType: 'channels'
    };
    channels.push(entry);
    renderLists();
    playChannel(channels.length - 1);
    setStatus('Fichier local prêt');
  }
}

function addIframeOverlay() {
  const title = iframeTitleInput.value.trim() || 'Overlay iFrame';
  const url = iframeUrlInput.value.trim();
  if (!url) return;

  const entry = {
    id: 'iframe-' + (iframeItems.length + 1),
    name: title,
    url,
    logo: deriveLogoFromName(title),
    group: 'Overlay',
    isIframe: true,
    isFavorite: false,
    listType: 'iframe'
  };

  iframeItems.push(entry);
  iframeTitleInput.value = '';
  iframeUrlInput.value = '';
  renderLists();
  playIframe(iframeItems.length - 1);
  showIframe();
  setStatus('Overlay ajouté');
}

// --------- JSON EXPORT / IMPORT ---------

function exportM3uToJson() {
  const payload = {
    type: 'm3u',
    version: 1,
    items: channels.map(ch => ({
      name: ch.name,
      url: ch.url,
      logo: ch.logo || deriveLogoFromName(ch.name),
      group: ch.group || '',
      isFavorite: !!ch.isFavorite
    }))
  };
  jsonArea.value = JSON.stringify(payload, null, 2);
  setStatus('Export M3U → JSON prêt');
}

function exportIframeToJson() {
  const payload = {
    type: 'iframe',
    version: 1,
    items: iframeItems.map(it => ({
      name: it.name,
      url: it.url,
      logo: it.logo || deriveLogoFromName(it.name),
      group: it.group || 'Overlay',
      isFavorite: !!it.isFavorite
    }))
  };
  jsonArea.value = JSON.stringify(payload, null, 2);
  setStatus('Export iFrame → JSON prêt');
}

function importFromJson() {
  const text = jsonArea.value.trim();
  if (!text) {
    alert('Colle d’abord du JSON dans la zone prévue.');
    return;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error(e);
    alert('JSON invalide : impossible de parser.');
    return;
  }

  if (!data || !Array.isArray(data.items)) {
    alert("Format JSON inattendu : il manque le tableau 'items'.");
    return;
  }

  const type = data.type || 'm3u';

  if (type === 'm3u') {
    data.items.forEach((item, idx) => {
      const name = item.name || ('M3U ' + (channels.length + idx + 1));
      const url = item.url;
      if (!url) return;

      const entry = {
        id: 'json-ch-' + (channels.length + 1),
        name,
        url,
        logo: item.logo || deriveLogoFromName(name),
        group: item.group || 'Playlist JSON',
        isIframe: isYoutubeUrl(url),
        isFavorite: !!item.isFavorite,
        listType: 'channels'
      };
      channels.push(entry);
    });
    renderLists();
    setStatus('Import JSON M3U terminé (' + data.items.length + ' entrées)');
  } else if (type === 'iframe') {
    data.items.forEach((item, idx) => {
      const name = item.name || ('Overlay ' + (iframeItems.length + idx + 1));
      const url = item.url;
      if (!url) return;

      const entry = {
        id: 'json-iframe-' + (iframeItems.length + 1),
        name,
        url,
        logo: item.logo || deriveLogoFromName(name),
        group: item.group || 'Overlay JSON',
        isIframe: true,
        isFavorite: !!item.isFavorite,
        listType: 'iframe'
      };
      iframeItems.push(entry);
    });
    renderLists();
    setStatus('Import JSON iFrame terminé (' + data.items.length + ' entrées)');
  } else {
    alert("Type JSON inconnu : '" + type + "'. Utilise 'm3u' ou 'iframe'.");
  }
}

// --------- EVENTS ---------

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const tab = btn.dataset.tab;
    document.querySelectorAll('.list').forEach(list => list.classList.remove('active'));

    if (tab === 'channels') {
      channelListEl.classList.add('active');
    } else if (tab === 'fr') {
      channelFrListEl.classList.add('active');
    } else if (tab === 'iframes') {
      iframeListEl.classList.add('active');
    } else if (tab === 'favorites') {
      favoriteListEl.classList.add('active');
    }
  });
});

document.querySelectorAll('.loader-section .collapsible-label').forEach(label => {
  label.addEventListener('click', () => {
    const section = label.closest('.loader-section');
    section.classList.toggle('open');
  });
});

toggleSidebarBtn.addEventListener('click', () => {
  const isCollapsed = sidebar.classList.toggle('collapsed');
  toggleSidebarBtn.classList.toggle('active', !isCollapsed);
});

if (window.innerWidth <= 900) {
  sidebar.classList.add('collapsed');
}

loadUrlBtn.addEventListener('click', () => {
  loadFromUrl(urlInput.value.trim());
});

urlInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    loadFromUrl(urlInput.value.trim());
  }
});

openFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    loadFromFile(fileInput.files[0]);
  }
});

addIframeBtn.addEventListener('click', () => addIframeOverlay());
iframeUrlInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    addIframeOverlay();
  }
});

toggleOverlayBtn.addEventListener('click', () => {
  if (overlayMode) {
    showVideo();
    setStatus('Mode vidéo');
  } else {
    showIframe();
    setStatus('Mode iFrame');
  }
});

fullPageBtn.addEventListener('click', () => {
  const elem = appShell;
  if (!document.fullscreenElement) {
    elem.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

nextBtn.addEventListener('click', playNext);
prevBtn.addEventListener('click', playPrev);

fxToggleBtn.addEventListener('click', () => {
  const active = appShell.classList.toggle('fx-boost');
  playerContainer.classList.toggle('fx-boost-edges', active);
  fxToggleBtn.classList.toggle('btn-accent', active);
});

pipToggleBtn.addEventListener('click', () => {
  const active = playerContainer.classList.toggle('pip-mode');
  pipToggleBtn.classList.toggle('btn-accent', active);
});

let currentTheme = 'classic';

themeToggleBtn.addEventListener('click', () => {
  if (currentTheme === 'classic') {
    document.body.classList.add('theme-redblue');
    currentTheme = 'redblue';
    themeToggleBtn.textContent = 'Thème : Rouge/Bleu';
    themeToggleBtn.classList.add('btn-accent');
    setStatus('Thème Rouge/Bleu actif');
  } else {
    document.body.classList.remove('theme-redblue');
    currentTheme = 'classic';
    themeToggleBtn.textContent = 'Thème : Cyan/Orange';
    themeToggleBtn.classList.remove('btn-accent');
    setStatus('Thème Cyan/Orange actif');
  }
});

exportM3uJsonBtn.addEventListener('click', exportM3uToJson);
exportIframeJsonBtn.addEventListener('click', exportIframeToJson);
importJsonBtn.addEventListener('click', importFromJson);

videoEl.addEventListener('playing', () => setStatus('Lecture en cours'));
videoEl.addEventListener('pause', () => setStatus('Pause'));
videoEl.addEventListener('waiting', () => setStatus('Buffering…'));
videoEl.addEventListener('error', () => {
  const mediaError = videoEl.error;

  if (
    !externalFallbackTried &&
    currentEntry &&
    !currentEntry.isIframe &&
    isProbablyHls(currentEntry.url)
  ) {
    externalFallbackTried = true;
    console.warn('Erreur vidéo, fallback vers lecteur externe pour :', currentEntry.url);
    fallbackToExternalPlayer(currentEntry);
    return;
  }

  let msg = 'Erreur vidéo';
  if (mediaError) {
    switch (mediaError.code) {
      case mediaError.MEDIA_ERR_NETWORK:
        msg = 'Erreur réseau ou CORS possible';
        break;
      case mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        msg = 'Format non supporté ou URL invalide';
        break;
      default:
        msg = 'Erreur de lecture (code ' + mediaError.code + ')';
    }
  }
  setStatus(msg);
  npBadge.textContent = 'ERREUR';
  console.error('Video error', mediaError);
});

// --------- DEMO DE BASE ---------

(function seedDemo() {
  const demoChannels = [
    {
      id: 'demo-1',
      name: 'CMTV',
      url: '//popcdn.day/player.php?stream=CMTVPT',
      logo: { type: 'image', value: 'https://vsalema.github.io/StreamPilot-X-Studio-O/logos/cmtv.png' },
      group: 'TV',
      isIframe: true,
      isFavorite: false,
      listType: 'channels'
    },
    {
      id: 'demo-2',
      name: 'SICN',
      url: 'https://cdnapisec.kaltura.com/p/4526593/sp/4526593/playManifest/entryId/1_j8ztwihx/deliveryProfileId/672/protocol/https/format/applehttp/a.m3u8',
      logo: { type: 'image', value: 'https://vsalema.github.io/tvpt4/css/SICNoticias.png' },
      group: 'TV',
      isIframe: false,
      isFavorite: false,
      listType: 'channels'
    },
    {
      id: 'demo-3',
      name: 'RTP1',
      url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtp1HD.smil/playlist.m3u8',
      logo: { type: 'image', value: 'https://vsalema.github.io/StreamPilot-X-Studio-O/logos/rtp1.jpg' },
      group: 'TV',
      isIframe: true,
      isFavorite: false,
      listType: 'channels'
    },
    {
      id: 'demo-4',
      name: 'TVI',
      url: 'https://raw.githubusercontent.com/ipstreet312/freeiptv/master/ressources/tvipt/sh/tvi.m3u8',
      logo: { type: 'image', value: 'https://vsalema.github.io/StreamPilot-X-Studio-O/logos/TVI.png' },
      group: 'TV',
      isIframe: false,
      isFavorite: false,
      listType: 'channels'
    }
  ];

  const demoIframe1 = {
    id: 'demo-iframe-1',
    name: 'Tony Carreira - 30 Anos de Canções Altice Arena',
    url: 'https://www.youtube.com/embed/efd0qSgR06k?autoplay=1&mute=0',
    logo: {
      type: 'image',
      value: 'https://yt3.googleusercontent.com/600ktvDAxGK71vvfBsBVIVwk66FOKKWuztuZayMnS5x0ysHqCyFQdc5CUT09frMHQhYDsuQXYg=s160-c-k-c0x00ffffff-no-rj'
    },
    group: 'Demo Overlay',
    isIframe: true,
    isFavorite: false,
    listType: 'iframe'
  };

  const demoIframe2 = {
    id: 'demo-iframe-2',
    name: 'RTP Player Externe',
    url: 'https://vsalema.github.io/play/?https://streaming-live.rtp.pt/liverepeater/smil:rtp1HD.smil/playlist.m3u8',
    logo: { type: 'image', value: 'https://vsalema.github.io/StreamPilot-X-Studio-O/logos/rtp1.jpg' },
    group: 'Demo Overlay',
    isIframe: true,
    isFavorite: false,
    listType: 'iframe'
  };

  demoChannels.forEach(ch => channels.push(ch));
  iframeItems.push(demoIframe1, demoIframe2); 
  renderLists();
  updateNowPlaying(null, 'IDLE');
})();

(async function seedMainPlaylist() {
  await loadFromUrl('https://vsalema.github.io/tvpt4/css/TVradioZap-TV-Europe+_s_2024-12-27.m3u');
})();

loadFrM3u('https://vsalema.github.io/tvpt4/css/playlist-tvf-r.m3u');

const customOverlays = [
  
  { title: "CMTV", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/cmtv.png", url: "//popcdn.day/player.php?stream=CMTVPT" },

  { title: "TVI",  logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/TVI.png", url: "https://vsalema.github.io/tvi2/" },

  { title: "TVIR", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/tvir.jpg", url: "https://vsalema.github.io/tvi-reality/" },

  { title: "TVIF", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/tvif.png", url: "https://vsalema.github.io/tvi-ficcao/" },

  { title: "TVIA", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/tvia.png", url: "https://vsalema.github.io/tvi-africa/" },

  { title: "SIC",  logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/sic.jpg", url: "https://vsalema.github.io/sic/" },

  { title: "CNN",  logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/cnn.png", url: "https://vsalema.github.io/CNN/" },

  { title: "RTP1", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/rtp1.jpg", url: "https://vsalema.github.io/play/?https://streaming-live.rtp.pt/liverepeater/smil:rtp1HD.smil/playlist.m3u8" },

  { title: "RTPN", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/rtpn.png", url: "https://vsalema.github.io/play/?https://streaming-live.rtp.pt/livetvhlsDVR/rtpnHDdvr.smil/playlist.m3u8?DVR" },

  { title: "RTPI", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/rtpi.jpg", url: "https://vsalema.github.io/play/?https://streaming-live.rtp.pt/liverepeater/rtpi.smil/playlist.m3u8" },

  { title: "BTV", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/btv.svg", url: "//popcdn.day/go.php?stream=BTV1" },

  { title: "SCP", logo: "https://pplware.sapo.pt/wp-content/uploads/2017/06/scp_00.jpg", url: "//popcdn.day/go.php?stream=SPT1" },

  { title: "11",  logo: "https://www.zupimages.net/up/24/13/qj99.jpg", url: "https://popcdn.day/go.php?stream=Canal11" },

  { title: "BOLA", logo: "https://www.telesatellite.com/images/actu/a/abolatv.jpg", url: "//popcdn.day/go.php?stream=ABOLA" },

  { title: "Sport tv 1", logo: "https://cdn.brandfetch.io/idKvjRibkN/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B", url: "//popcdn.day/go.php?stream=SPT1" },

  { title: "Sport tv 2", logo: "https://cdn.brandfetch.io/idKvjRibkN/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B", url: "//popcdn.day/go.php?stream=SPT2" },

  { title: "Sport tv 3", logo: "https://cdn.brandfetch.io/idKvjRibkN/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B", url: "//popcdn.day/go.php?stream=SPT3" },

  { title: "Sport tv 4", logo: "https://cdn.brandfetch.io/idKvjRibkN/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B", url: "//popcdn.day/go.php?stream=SPT4" },

  { title: "Sport tv 5", logo: "https://cdn.brandfetch.io/idKvjRibkN/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B", url: "//popcdn.day/go.php?stream=SPT5" },

  { title: "DAZN 1 PT",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/71/DAZN_logo.svg", url: "//popcdn.day/go.php?stream=ELEVEN1" },

  { title: "DAZN 2 PT",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/71/DAZN_logo.svg", url: "//popcdn.day/go.php?stream=ELEVEN2" },

  { title: "DAZN 3 PT",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/71/DAZN_logo.svg", url: "//popcdn.day/go.php?stream=ELEVEN3" },

  { title: "DAZN 4 PT",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/71/DAZN_logo.svg", url: "//popcdn.day/go.php?stream=ELEVEN4" },

 { title: "DAZN 5 PT",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/71/DAZN_logo.svg", url: "//popcdn.day/go.php?stream=ELEVEN5" }
];
customOverlays.forEach((item, idx) => {
  iframeItems.push({
    id: "custom-ov-" + (idx + 1),
    name: item.title,
    url: item.url,
    logo: { type: "image", value: item.logo },
    group: "Overlay",
    isIframe: true,
    isFavorite: false
  });
});

renderIframeList();

