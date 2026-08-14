/* La Cloche Silhouette Trail — interactive trip map.
 * Data: site_data.json (route in map-image pixel coords, days, camps, media).
 * Two synced scrubbers: timeline canvas (linear by distance) and a draggable
 * marker that rides the route on the map. */

(async function () {
  const data = await (await fetch("data/site_data.json")).json();
  data.media = data.media.filter((m) => !m.dropped);  // removed in place.html
  const clips = (await (await fetch("data/clips.json")).json()).filter((c) => !c.dropped);
  const pts = data.points;            // [x, y, dist, elev]
  const total = data.total_m;

  // ---------- map setup ----------
  const ZMAX = 6, TILE = 256;
  const factor = 1 / Math.pow(2, ZMAX);
  const crs = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(factor, 0, factor, 0),
  });
  const ll = (x, y) => L.latLng(y, x);

  const map = L.map("map", {
    crs,
    minZoom: 1,
    maxZoom: ZMAX + 1,
    zoomSnap: 0.5,
    attributionControl: false,
    maxBounds: L.latLngBounds(ll(-800, -800), ll(data.map.width + 800, data.map.height + 800)),
  });
  L.tileLayer("tiles/{z}/{x}/{y}.jpg", {
    tileSize: TILE, minZoom: 0, maxZoom: ZMAX + 1, maxNativeZoom: ZMAX, noWrap: true,
    bounds: L.latLngBounds(ll(0, 0), ll(data.map.width, data.map.height)),
  }).addTo(map);
  map.fitBounds(L.latLngBounds(ll(600, 300), ll(data.map.width - 600, data.map.height - 900)));

  // ---------- day polylines ----------
  const dayOf = (dist) => data.days.find((d) => dist >= d.start && dist <= d.end) || data.days[data.days.length - 1];
  for (const d of data.days) {
    const seg = pts.filter((p) => p[2] >= d.start - 40 && p[2] <= d.end + 40).map((p) => ll(p[0], p[1]));
    L.polyline(seg, { color: "#ffffff", weight: 7, opacity: 0.55, interactive: false }).addTo(map);
  }
  const dayLines = [];
  for (const d of data.days) {
    const seg = pts.filter((p) => p[2] >= d.start - 40 && p[2] <= d.end + 40).map((p) => ll(p[0], p[1]));
    dayLines.push(L.polyline(seg, { color: d.color, weight: 4, opacity: 0.95 }).addTo(map));
  }

  // ---------- side-trip spurs (dashed, in the day's colour) ----------
  for (const s of data.spurs || []) {
    const col = data.days[s.day - 1].color;
    const seg = s.px.map(([x, y]) => ll(x, y));
    L.polyline(seg, { color: "#ffffff", weight: 6, opacity: 0.5, interactive: false }).addTo(map);
    L.polyline(seg, { color: col, weight: 3, opacity: 0.95, dashArray: "7 7" })
      .addTo(map)
      .bindPopup(`<b>${s.name}</b><br>${(s.length_m / 1000).toFixed(1)} km each way, no bag — up and back on day ${s.day}`)
      .on("click", () => setDist(s.jct_dist, "map"));
    const mid = seg[Math.floor(seg.length / 2)];
    L.marker(mid, {
      icon: L.divIcon({ className: "camp-label", html: "Silver Peak ↑", iconSize: null }),
      interactive: false,
    }).addTo(map);
  }

  // ---------- camps ----------
  for (const c of data.camps) {
    L.marker(ll(c.x, c.y), {
      icon: L.divIcon({ className: "camp-icon", html: "⛺", iconSize: [24, 24] }),
    }).addTo(map).bindPopup(`<b>${c.name}</b><br>Night of ${c.night}` +
      (c.provisional ? "<br><i>(position approximate)</i>" : ""));
    L.marker(ll(c.x, c.y + 26), {
      icon: L.divIcon({ className: "camp-label", html: c.name.split(" ")[0], iconSize: null }),
      interactive: false,
    }).addTo(map);
  }

  // ---------- media hotpoints ----------
  const fmtTime = (iso) => {
    const t = new Date(iso);
    return t.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit" });
  };
  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lbImg");
  const lbVid = document.getElementById("lbVid");
  const lbCap = document.getElementById("lbCap");
  const lbClipBig = document.getElementById("lbClipBig");
  const lbAud = document.getElementById("lbAud");
  const esc = (t) => t.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

  // gallery: EVERY item — photos, videos and voice notes — in trail order.
  // `view` is the currently visible subset (technical clips hidden in story
  // mode); the strip and the lightbox arrows both walk `view`.
  const gallery = [
    ...data.media.map((m) => ({ kind: m.type === "video" ? "video" : "photo", m })),
    ...clips.map((c) => ({ kind: "clip", c, dist: c.dist })),
  ].map((it) => (it.kind === "clip" ? it : { ...it, dist: it.m.dist }))
    .sort((a, b) => a.dist - b.dist);
  let view = [], viewIdx = {};

  let lbCur = -1;
  function showLightbox(i) {
    lbCur = (i + view.length) % view.length;
    const it = view[lbCur];
    lbVid.pause(); lbAud.pause();
    lbImg.classList.add("hidden");
    lbVid.classList.add("hidden"); lbVid.removeAttribute("src");
    lbClipBig.classList.add("hidden"); lbAud.removeAttribute("src");
    let cap = "";
    if (it.kind === "clip") {
      const c = it.c;
      const warn = c.flag === "gross" ? '<div class="clip-warn">🤢 fair warning: a touch gross</div>' : "";
      if (c.video) {
        lbVid.classList.remove("hidden");
        lbVid.poster = "media/poster/clip_" + c.id + ".jpg";
        lbVid.src = c.media;
        cap = `<div class="lbNote">🎙 ${esc(c.title)} — ${esc(c.why)}</div>` + warn;
      } else {
        lbClipBig.classList.remove("hidden");
        document.getElementById("lbClipTitle").textContent = c.title;
        document.getElementById("lbClipWhy").textContent = c.why;
        lbAud.src = c.media;
        cap = warn;
      }
    } else if (it.kind === "video") {
      const m = it.m;
      lbVid.classList.remove("hidden");
      lbVid.poster = "media/poster/" + m.file.replace(".mp4", ".jpg");
      lbVid.src = "media/video/" + m.file;
      cap = (m.note ? `<div class="lbNote">📝 ${esc(m.note)}</div>` : "") + fmtTime(m.time);
    } else {
      const m = it.m;
      lbImg.classList.remove("hidden");
      lbImg.src = "media/web/" + m.file;
      cap = (m.note ? `<div class="lbNote">📝 ${esc(m.note)}</div>` : "") + fmtTime(m.time);
    }
    lbCap.innerHTML = cap + `${cap && !cap.endsWith(">") ? " · " : ""}${lbCur + 1}/${view.length}`;
    lb.classList.remove("hidden");
    setDist(it.dist, "lightbox");
  }
  const closeLb = () => { lb.classList.add("hidden"); lbVid.pause(); lbAud.pause(); };
  document.getElementById("lbClose").onclick = closeLb;
  document.getElementById("lbPrev").onclick = () => showLightbox(lbCur - 1);
  document.getElementById("lbNext").onclick = () => showLightbox(lbCur + 1);
  lb.onclick = (e) => { if (e.target === lb) closeLb(); };
  window.addEventListener("keydown", (e) => {
    if (lb.classList.contains("hidden")) return;
    if (e.key === "ArrowLeft") showLightbox(lbCur - 1);
    else if (e.key === "ArrowRight") showLightbox(lbCur + 1);
    else if (e.key === "Escape") closeLb();
  });
  let swipeX = null;
  lb.addEventListener("touchstart", (e) => { swipeX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (swipeX === null) return;
    const dx = e.changedTouches[0].clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 45) showLightbox(lbCur + (dx < 0 ? 1 : -1));
  }, { passive: true });

  for (const m of data.media) {
    const d = dayOf(m.dist);
    const isVideo = m.type === "video";
    const mk = L.circleMarker(ll(m.x, m.y), {
      radius: isVideo ? 7 : 5,
      color: "#fff", weight: 1.5,
      fillColor: d.color, fillOpacity: 0.95,
    }).addTo(map);
    const noteHtml = m.note
      ? `<div class="popup-note">📝 ${m.note.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</div>` : "";
    if (isVideo) {
      const poster = m.file.replace(".mp4", ".jpg");
      mk.bindPopup(`<video class="popup-vid" controls preload="none" playsinline poster="media/poster/${poster}" src="media/video/${m.file}"></video>` +
        noteHtml + `<div class="popup-time">${fmtTime(m.time)}</div>`, { maxWidth: 260 });
    } else {
      mk.bindPopup(`<img class="popup-thumb" src="media/thumb/${m.file}" data-file="${m.file}" data-time="${m.time}">` +
        noteHtml + `<div class="popup-time">${fmtTime(m.time)}</div>`, { maxWidth: 240 });
    }
    mk.on("click", () => setDist(m.dist, "map"));
  }
  map.on("popupopen", (e) => {
    const img = e.popup.getElement().querySelector(".popup-thumb");
    if (img) img.onclick = () => showLightbox(viewIdx[img.dataset.file]);
  });
  map.on("popupclose", (e) => {
    const av = e.popup.getElement() && e.popup.getElement().querySelector("audio, video");
    if (av) av.pause();
  });

  // ---------- voice-note hotpoints (🔊, story/technical filtered) ----------
  const clipMarkers = [];
  const escapeH = (t) => t.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  for (const c of clips) {
    const d = dayOf(c.dist);
    const mk = L.marker(ll(0, 0), {
      icon: L.divIcon({
        className: "",
        html: `<div class="clip-dot" style="--dc:${d.color}">${c.video ? "🎬" : "🔊"}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      }),
      zIndexOffset: 500,
    });
    const badge = c.tag === "technical" ? '<span class="clip-badge">technical</span>' : "";
    const warn = c.flag === "gross" ? '<div class="clip-warn">🤢 fair warning: a touch gross</div>' : "";
    const player = c.video
      ? `<video class="popup-vid" controls preload="none" playsinline poster="media/poster/clip_${c.id}.jpg" src="${c.media}"></video>`
      : `<audio class="popup-audio" controls preload="none" src="${c.media}"></audio>`;
    mk.bindPopup(`<div class="clip-title">🎙 ${escapeH(c.title)}${badge}</div>` +
      `<div class="clip-why">${escapeH(c.why)}</div>${warn}${player}`, { maxWidth: 290 });
    mk.on("click", () => setDist(c.dist, "map"));
    clipMarkers.push({ mk, tag: c.tag, dist: c.dist });
  }
  function updateClips() {
    for (const c of clipMarkers) {
      const show = tech || c.tag !== "technical";
      if (show && !map.hasLayer(c.mk)) {
        const p = distToPoint(c.dist);   // defined below; updateClips only runs after init
        c.mk.setLatLng(ll(p.x, p.y));
        c.mk.addTo(map);
      } else if (!show && map.hasLayer(c.mk)) map.removeLayer(c.mk);
    }
  }

  // ---------- media strip (all media + voice notes, in trail order) ----------
  const strip = document.getElementById("strip");
  let stripCur = -1, stripUserTs = 0;
  for (const ev of ["pointerdown", "touchstart", "wheel"])
    strip.addEventListener(ev, () => { stripUserTs = Date.now(); }, { passive: true });

  function rebuildView() {
    view = gallery.filter((it) => it.kind !== "clip" || tech || it.c.tag !== "technical");
    viewIdx = {};
    view.forEach((it, i) => { viewIdx[it.kind === "clip" ? "clip:" + it.c.id : it.m.file] = i; });
    strip.innerHTML = "";
    stripCur = -1;
    view.forEach((it, i) => {
      const el = document.createElement("div");
      if (it.kind === "clip") {
        el.className = "strip-it strip-clip";
        el.style.setProperty("--dc", dayOf(it.dist).color);
        el.textContent = it.c.video ? "🎬" : "🔊";
        el.title = it.c.title;
      } else {
        el.className = "strip-it" + (it.kind === "video" ? " vid" : "");
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = "";
        img.src = it.kind === "video"
          ? "media/poster/" + it.m.file.replace(".mp4", ".jpg")
          : "media/thumb/" + it.m.file;
        el.appendChild(img);
      }
      el.onclick = () => showLightbox(i);
      strip.appendChild(el);
    });
  }

  function updateStripCur() {
    if (!view.length) return;
    let best = 0, bd = Infinity;
    for (let i = 0; i < view.length; i++) {
      const d = Math.abs(view[i].dist - cur);
      if (d < bd) { bd = d; best = i; }
    }
    if (best === stripCur) return;
    if (stripCur >= 0) strip.children[stripCur].classList.remove("cur");
    stripCur = best;
    const el = strip.children[best];
    el.classList.add("cur");
    // don't fight the user while they're browsing the strip themselves
    if (Date.now() - stripUserTs > 1600)
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }

  // ---------- scrub state ----------
  let cur = 0;
  const distToPoint = (dist) => {
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; (pts[mid][2] < dist) ? lo = mid + 1 : hi = mid; }
    const i = Math.max(1, lo);
    const f = Math.min(1, Math.max(0, (dist - pts[i - 1][2]) / Math.max(pts[i][2] - pts[i - 1][2], 1e-9)));
    return {
      x: pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]),
      y: pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1]),
      elev: pts[i - 1][3] + f * (pts[i][3] - pts[i - 1][3]),
    };
  };

  const scrubIcon = L.divIcon({
    className: "",
    html: '<div style="width:20px;height:20px;border-radius:50%;background:#fff;border:4px solid #e6403c;box-shadow:0 0 8px rgba(0,0,0,.6)"></div>',
    iconSize: [20, 20], iconAnchor: [10, 10],
  });
  const scrubber = L.marker(ll(pts[0][0], pts[0][1]), { icon: scrubIcon, draggable: true, zIndexOffset: 1000 }).addTo(map);

  const nearestDist = (x, y) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i][0] - x, dy = pts[i][1] - y, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = i; }
    }
    return pts[best][2];
  };
  scrubber.on("drag", (e) => {
    const p = e.target.getLatLng();          // lat=y, lng=x
    setDist(nearestDist(p.lng, p.lat), "mapdrag");
  });
  dayLines.forEach((pl) => pl.on("click", (e) => setDist(nearestDist(e.latlng.lng, e.latlng.lat), "map")));

  const dayLabel = document.getElementById("dayLabel");
  const DAYNAMES = ["Sat 8 Aug", "Sun 9 Aug", "Mon 10 Aug", "Tue 11 Aug", "Wed 12 Aug", "Thu 13 Aug"];
  let tech = false;

  function setDist(dist, source) {
    cur = Math.min(total, Math.max(0, dist));
    const p = distToPoint(cur);
    if (source !== "mapdrag") scrubber.setLatLng(ll(p.x, p.y));
    const d = dayOf(cur);
    let txt = `Day ${d.n} · ${DAYNAMES[d.n - 1]} · ${(cur / 1000).toFixed(1)} km · ↕ ${Math.round(p.elev)} m`;
    if (tech) txt += ` · ${((cur - d.start) / 1000).toFixed(1)} km into the day · ${(total / 1000).toFixed(1)} km total`;
    dayLabel.textContent = txt;
    drawTimeline();
    updateStripCur();
  }

  // ---------- timeline canvas (elevation profile + scrubber) ----------
  const tl = document.getElementById("tlCanvas");
  const tctx = tl.getContext("2d");
  const elevs = pts.map((p) => p[3]);
  const eMin = Math.min(...elevs) - 10, eMax = Math.max(...elevs) + 10;
  function sizeCanvas(c) {
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (c.width !== r.width * dpr || c.height !== r.height * dpr) { c.width = r.width * dpr; c.height = r.height * dpr; }
    return { w: r.width, h: r.height, dpr };
  }
  function drawTimeline() {
    const { w, h, dpr } = sizeCanvas(tl);
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.clearRect(0, 0, w, h);
    const X = (dist) => (dist / total) * w;
    const topPad = 8, botPad = 4;
    const Y = (e) => h - botPad - ((e - eMin) / (eMax - eMin)) * (h - topPad - botPad);
    // day-coloured elevation profile
    for (const d of data.days) {
      const seg = pts.filter((p) => p[2] >= d.start - 40 && p[2] <= d.end + 40);
      tctx.beginPath();
      tctx.moveTo(X(seg[0][2]), h);
      for (const p of seg) tctx.lineTo(X(p[2]), Y(p[3]));
      tctx.lineTo(X(seg[seg.length - 1][2]), h);
      tctx.closePath();
      tctx.fillStyle = d.color + "66"; tctx.fill();
      tctx.beginPath();
      for (let i = 0; i < seg.length; i++) (i ? tctx.lineTo : tctx.moveTo).call(tctx, X(seg[i][2]), Y(seg[i][3]));
      tctx.strokeStyle = d.color; tctx.lineWidth = 2; tctx.stroke();
    }
    // media ticks along the profile
    tctx.fillStyle = "rgba(255,255,255,0.8)";
    for (const m of data.media) {
      const x = X(m.dist), p = distToPoint(m.dist);
      tctx.fillRect(x, Y(p.elev) - 8, 1.4, 5);
    }
    // voice-note ticks (gold, above the media ticks)
    tctx.fillStyle = "rgba(255,210,74,0.9)";
    for (const c of clips) {
      if (!tech && c.tag === "technical") continue;
      const x = X(c.dist);
      tctx.fillRect(x - 0.9, Y(distToPoint(c.dist).elev) - 15, 1.8, 6);
    }
    // camp markers at the profile
    tctx.fillStyle = "#ffd24a";
    for (const c of data.camps) {
      const x = X(c.dist), y = Y(distToPoint(c.dist).elev);
      tctx.beginPath(); tctx.moveTo(x, y - 4);
      tctx.lineTo(x - 4, y - 12); tctx.lineTo(x + 4, y - 12);
      tctx.fill();
    }
    // playhead
    const px = X(cur);
    tctx.strokeStyle = "#fff"; tctx.lineWidth = 1.5;
    tctx.beginPath(); tctx.moveTo(px, 0); tctx.lineTo(px, h); tctx.stroke();
    tctx.beginPath(); tctx.arc(px, Y(distToPoint(cur).elev), 5, 0, Math.PI * 2);
    tctx.fillStyle = "#fff"; tctx.fill();
    if (tech) {
      tctx.fillStyle = "#9fb0cc"; tctx.font = "10px system-ui";
      tctx.fillText(`${Math.round(eMax - 10)} m`, 4, 12);
      tctx.fillText(`${Math.round(eMin + 10)} m`, 4, h - 4);
    }
  }
  function tlScrub(e) {
    const r = tl.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    setDist((x / r.width) * total, "timeline");
  }
  let tlDown = false;
  tl.addEventListener("pointerdown", (e) => { tlDown = true; tl.setPointerCapture(e.pointerId); tlScrub(e); });
  tl.addEventListener("pointermove", (e) => { if (tlDown) tlScrub(e); });
  tl.addEventListener("pointerup", () => { tlDown = false; });

  // ---------- toggles ----------
  document.getElementById("modeToggle").onclick = function () {
    tech = !tech;
    this.classList.toggle("active");
    this.innerHTML = tech ? '✨<span class="lbl"> Story mode</span>' : '🥾<span class="lbl"> Technical mode</span>';
    updateClips();
    rebuildView();
    setDist(cur, "toggle");
  };

  // one-time landing note about the two modes
  const note = document.getElementById("modeNote");
  if (!localStorage.getItem("killarney_modenote")) note.classList.remove("hidden");
  document.getElementById("noteClose").onclick = () => {
    note.classList.add("hidden");
    localStorage.setItem("killarney_modenote", "1");
  };

  window.addEventListener("resize", drawTimeline);
  updateClips();
  rebuildView();
  setDist(0, "init");
})();
