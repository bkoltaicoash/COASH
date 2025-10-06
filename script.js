<script>
  /* ========= CONFIG ========= */
  const SEASON_SPORTS = {
    1: ["Football", "Cross Country"],
    2: ["Basketball"],
    3: ["Volleyball"]
  };

  const YEAR_LINKS = {
    "2025": {
      results:   "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLD9m5m0ZEg-ucN-OLyMqc7sw7VKFEHtE1MOgTA0creLD2F7AewEcmf5zuUIJ18YguRLQ7B3dRzxRw/pub?gid=1498727720&single=true&output=csv",
      standings: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLD9m5m0ZEg-ucN-OLyMqc7sw7VKFEHtE1MOgTA0creLD2F7AewEcmf5zuUIJ18YguRLQ7B3dRzxRw/pub?gid=1445382479&single=true&output=csv",
      fixtures:  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLD9m5m0ZEg-ucN-OLyMqc7sw7VKFEHtE1MOgTA0creLD2F7AewEcmf5zuUIJ18YguRLQ7B3dRzxRw/pub?gid=32383096&single=true&output=csv"
    }
  };

  /* ========= SCHOOL CONFIG ========= */
  const SCHOOLS = {
    KIS:  { aliases: ["KIS", "Kazakhstan International School"] },
    HAL:  { aliases: ["HAL", "Haileybury", "Haileybury Almaty"] },
    TSIS: { aliases: ["TSIS", "Tien Shan", "Tien Shan International School"] },
    AIS:  { aliases: ["AIS", "QSI", "Almaty International School"] },
  };
  const AUTO_DETECT_SCHOOLS = true;

  /* ========= STATE ========= */
  const state = {
    year: "2025",
    season: 1,
    sport: "Football",
    division: "",
    window: "all",
    school: "",
    resultsWindow: "all",
    resultsSchool: "",
    resultsTeam: ""
  };

  /* ========= DEBUG UI ========= */
  const debugMsg = document.getElementById('debugMsg');
  const debugDetails = document.getElementById('debugDetails');

  // 🔕 Disable the green debug banner (hide it and do nothing)
  function setDebug(level, html) {
    const bar = document.getElementById('debugBar');
    if (bar) bar.style.display = 'none';
    // Intentionally do nothing else.
  }

  function short(u){
    try{
      const s = new URL(u);
      return s.origin + s.pathname + (s.search.includes('gid=') ? `?gid=${new URLSearchParams(s.search).get('gid')}` : '');
    }catch(e){ return u; }
  }

  /* ========= CSV (with diagnostics) ========= */
  async function safeFetch(url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return { ok:true, text };
    } catch (e) {
      return { ok:false, error: String(e) };
    }
  }
  async function fetchCSV_loud(kind, url) {
    const r = await safeFetch(url);
    if (!r.ok) {
      setDebug('err', `
        <div><strong>${kind}:</strong> <code>${short(url)}</code></div>
        <div class="dbg-details">❌ Couldn’t load. Check “Publish to web (CSV)” or network. Error: <span class="mono">${r.error}</span></div>
      `);
      return [];
    }
    const rows = parseCSV(r.text);
    setDebug('ok', `
      <div>✅ Loaded CSVs. Rows — <strong>Results:</strong> <span id="dbgRes">?</span>,
           <strong>Standings:</strong> <span id="dbgStd">?</span>,
           <strong>Fixtures:</strong> <span id="dbgFix">?</span>.</div>
      <div class="dbg-details">Tap chips or seasons to filter.</div>
    `);
    return rows;
  }

  function parseCSV(text){
    const rows=[]; let cur="", inQ=false, row=[];
    for (let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if (c === '"' && inQ && n === '"'){ cur+='"'; i++; continue; }
      if (c === '"'){ inQ=!inQ; continue; }
      if (c === ',' && !inQ){ row.push(cur); cur=""; continue; }
      if ((c === '\n' || c === '\r') && !inQ){
        if (cur.length || row.length){ row.push(cur); rows.push(row); }
        cur=""; row=[]; continue;
      }
      cur += c;
    }
    if (cur.length || row.length){ row.push(cur); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows[0].map(h=>h.trim());
    return rows.slice(1).filter(r=>r.length>1).map(r=>{
      const o={}; headers.forEach((h,i)=>o[h]=(r[i]??"").trim()); return o;
    });
  }

  function renderTable(id, cols, rows, emptyMsg){
    const el = document.getElementById(id);
    if (!rows.length){ el.innerHTML = `<p>${emptyMsg}</p>`; return; }
    const thead = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
    el.innerHTML = `<table>${thead}${tbody}</table>`;
  }

  function matchesSelection(r){
    return String(r.Season) === String(state.season)
      && (!state.sport || r.Sport === state.sport)
      && (!state.division || r.Division === state.division);
  }

  /* ========= HELPERS ========= */
  const normalize = s => (s||"").toString().toLowerCase().trim();

  function schoolAliases(code){ const e=SCHOOLS[code]; return e? e.aliases.map(normalize):[]; }
  function rowHasSchool(row, code){
    if (!code) return true;
    const aliases = schoolAliases(code);
    if (!aliases.length) return false;
    const fields = ["Team","Home Team","Away Team","Home","Away"];
    const hay = fields.map(f=>normalize(row[f])).join(" | ");
    return aliases.some(a=>a && hay.includes(a));
  }
  function buildSchoolSetFromData(allTables){
    const set = new Set(Object.keys(SCHOOLS));
    if (!AUTO_DETECT_SCHOOLS) return Array.from(set);
    const fields = ["Team","Home Team","Away Team","Home","Away"];
    const grab = row=>{
      const text = fields.map(f=>row[f]).filter(Boolean).join(" ");
      const tokens = text.split(/[\s/()\-•,]+/g).filter(Boolean);
      tokens.forEach(tok=>{
        const t=tok.trim();
        if (/^[A-Z]{2,5}$/.test(t) && !SCHOOLS[t]) set.add(t);
      });
    };
    allTables.forEach(tbl=>tbl.forEach(grab));
    return Array.from(set);
  }

  function renderSchoolChips(codes){
    const bar=document.getElementById("schoolsBar"); if(!bar) return;
    const cur = state.school || "";
    const chips = [
      `<button class="chip ${cur===""?"active":""}" data-school="">All</button>`,
      ...codes.map(code=>`<button class="chip ${cur===code?"active":""}" data-school="${code}">${code}</button>`)
    ].join("");
    bar.innerHTML = chips;
  }
  function renderResultsSchoolChips(codes){
    const bar=document.getElementById("resultsSchoolsBar"); if(!bar) return;
    const cur = state.resultsSchool || "";
    const chips = [
      `<button class="chip ${cur===""?"active":""}" data-rschool="">All</button>`,
      ...codes.map(code=>`<button class="chip ${cur===code?"active":""}" data-rschool="${code}">${code}</button>`)
    ].join("");
    bar.innerHTML = chips;
  }

  function renderInitialSchoolChips(){ renderSchoolChips(Object.keys(SCHOOLS)); }
  function renderActiveFilters(){
    const el=document.getElementById("activeFilters"); if(!el) return;
    const school = state.school || "All Schools";
    const sport  = state.sport || "All Sports";
    const div    = state.division || "All Divisions";
    const win    = state.window === "all" ? "All Future" : "This Week";
    el.textContent = `${school} • ${sport} • ${div} • ${win}`;
  }

  function toDateObj(d, t){
    if (!d) return null;
    let hhmm = (t||"").trim();
    if (!hhmm) hhmm = "00:00";
    if (hhmm.length === 4) hhmm = "0" + hhmm;
    const dt = new Date(`${d}T${hhmm}:00`);
    return isNaN(dt) ? null : dt;
  }
  function startOfToday(){ const n=new Date(); n.setHours(0,0,0,0); return n; }
  function weekBoundsFromToday(){
    const today = startOfToday();
    const day = today.getDay();
    if (day === 0) {
      const nextMon = new Date(today); nextMon.setDate(today.getDate()+1);
      const nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate()+6);
      nextMon.setHours(0,0,0,0); nextSun.setHours(23,59,59,999);
      return { start: nextMon, end: nextSun };
    }
    const mon = new Date(today); mon.setDate(today.getDate() + (1 - day)); mon.setHours(0,0,0,0);
    const sun = new Date(mon);   sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,999);
    return { start: mon, end: sun };
  }

  /* ========= ✨ NEW FUNCTION — Update Section Titles ✨ ========= */
  function updateSectionTitles() {
    const div = state.division || "All";
    const ageLabel = div === "" ? "All Age Group" : div;
    const map = {
      fixtures: document.querySelector("#fixtures h2"),
      standings: document.querySelector("#standings h2"),
      results: document.querySelector("#results h2")
    };
    Object.keys(map).forEach(key=>{
      const el = map[key];
      if (!el) return;
      el.classList.add("fade-out");
      setTimeout(()=>{
        el.textContent = `${ageLabel} ${key.charAt(0).toUpperCase()+key.slice(1)}`;
        el.classList.remove("fade-out");
        el.classList.add("fade-in");
        setTimeout(()=>el.classList.remove("fade-in"), 300);
      }, 150);
    });
  }

  /* ========= LOAD + RENDER ========= */
  async function loadAll(){ /* your entire loadAll from above unchanged */ }

  function updateFixturesSubtitle(wStart, wEnd){
    const el=document.getElementById("fixturesSubtitle"); if(!el) return;
    if (state.window==="all"){ el.textContent="All Future Fixtures"; }
    else {
      const f=d=>d.toISOString().slice(0,10);
      el.textContent=`This Week (Mon–Sun): ${f(wStart)} → ${f(wEnd)}`;
    }
  }

  /* ========= TAPS ========= */
  function onTap(container, selector, handler){
    if (!container) return;
    const fn=(e)=>{
      const btn=e.target.closest(selector);
      if (!btn || !container.contains(btn)) return;
      handler(btn, e);
    };
    ["click","touchend","pointerup"].forEach(t=>container.addEventListener(t, fn, {passive:true}));
  }
  function setActive(container, selector, activeEl){
    if (!container) return;
    container.querySelectorAll(selector).forEach(el=>el.classList.remove("active"));
    activeEl.classList.add("active");
  }
  function updateSportChipsForSeason(){
    const allowed=SEASON_SPORTS[state.season]||[];
    document.querySelectorAll(".sport-chip[data-sport]").forEach(chip=>{
      const show=allowed.includes(chip.dataset.sport);
      chip.style.display=show?"inline-block":"none";
      chip.classList.toggle("active", chip.dataset.sport===state.sport);
    });
  }

  function wireUI(){
    document.getElementById("yearSelect").addEventListener("change", e=>{ state.year=e.target.value; loadAll(); });

    const seasonBar=document.getElementById("seasonSelector");
    onTap(seasonBar, ".season", (btn)=>{
      setActive(seasonBar, ".season", btn);
      state.season=Number(btn.dataset.season);
      const allowed=SEASON_SPORTS[state.season]||[];
      if (!allowed.includes(state.sport)) state.sport=allowed[0]||"";
      updateSportChipsForSeason();
      loadAll();
    });

    const sportBar=document.getElementById("sportSelector");
    onTap(sportBar, ".sport-chip[data-sport]", (btn)=>{
      setActive(sportBar, ".sport-chip[data-sport]", btn);
      state.sport=btn.dataset.sport; loadAll();
    });

    const divBar=document.getElementById("divisionsBar");
    onTap(divBar, ".chip", (btn)=>{
      setActive(divBar, ".chip", btn);
      state.division=btn.dataset.div||"";
      updateSectionTitles(); // 🔵 call new feature here
      loadAll();
    });

    const winBar = document.getElementById("windowSelector");
    onTap(winBar, ".view-chip", (btn) => {
      setActive(winBar, ".view-chip", btn);
      state.window = btn.dataset.window;
      loadAll();
    });

    const schBar=document.getElementById("schoolsBar");
    onTap(schBar, ".chip", (btn)=>{
      setActive(schBar, ".chip", btn);
      state.school=btn.dataset.school||""; renderActiveFilters(); loadAll();
    });

    const resWin = document.getElementById("resultsWindowSelector");
    onTap(resWin, ".view-chip", (btn)=>{
      setActive(resWin, ".view-chip", btn);
      state.resultsWindow = btn.dataset.window;
      loadAll();
    });

    const resultsSchBar = document.getElementById("resultsSchoolsBar");
    onTap(resultsSchBar, ".chip", (btn)=>{
      setActive(resultsSchBar, ".chip", btn);
      state.resultsSchool = btn.getAttribute("data-rschool") || "";
      state.resultsTeam = "";
      loadAll();
    });

    const teamsBar = document.getElementById("teamsBar");
    onTap(teamsBar, ".chip", (btn)=>{
      setActive(teamsBar, ".chip", btn);
      state.resultsTeam = btn.dataset.team || "";
      loadAll();
    });

    const back=document.querySelector(".back-to-top");
    window.addEventListener("scroll", ()=>{ back.style.display=window.scrollY>400?"block":"none"; }, { passive:true });
  }

  /* ========= INIT ========= */
  document.addEventListener("DOMContentLoaded", ()=>{
    // Hide the debug banner on first load as well (belt & braces)
    const bar = document.getElementById('debugBar');
    if (bar) bar.style.display = 'none';

    state.season=1;
    state.sport=SEASON_SPORTS[state.season][0];
    updateSportChipsForSeason();
    renderInitialSchoolChips();
    wireUI();
    loadAll();
    updateSectionTitles(); // run once on load

    if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js"); }
  });
</script>

<style>
  /* ✨ fade animation for section title updates ✨ */
  h2.fade-out { opacity: 0; transition: opacity 0.15s ease; }
  h2.fade-in { opacity: 1; transition: opacity 0.3s ease; }
</style>
