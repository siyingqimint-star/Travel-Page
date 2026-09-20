(() => {
  const OVERVIEW_HASHES = new Set(["", "#top", "#flights", "#route", "#drive", "#today"]);
  const TRAVEL_HASHES = new Set(["#itinerary"]);
  const PREP_HASHES = new Set(["#prep"]);
  const isLedgerHash = (hash) => hash === "#ledger" || hash.startsWith("#ledger-");

  const moduleEnabled = (name) => {
    // 优先读 app.js 注入的运行时配置；配置未就绪时回退到 DOM hidden 状态
    const config = window.TRAVEL_PLAN_CONFIG;
    if (config?.modules) return config.modules[name] === true;
    const element = document.querySelector(`#overview-view [data-module="${name}"], #main [data-module="${name}"], #prep-view [data-module="${name}"]`);
    return element ? !element.hidden : false;
  };

  function viewForHash(hash) {
    if (isLedgerHash(hash) && moduleEnabled("ledger")) return "ledger";
    if (PREP_HASHES.has(hash) && moduleEnabled("todo")) return "prep";
    if (TRAVEL_HASHES.has(hash) && moduleEnabled("itinerary")) return "travel";
    return "overview";
  }

  const VIEWS = ["overview", "travel", "ledger", "prep"];
  const TAB_FOR_VIEW = { overview: "overview", travel: "trip", ledger: "ledger", prep: "prep" };
  const HOME_HASH = { overview: "#top", travel: "#itinerary", ledger: "#ledger", prep: "#prep" };

  let activeView = "overview";
  const scrollPositions = { overview: 0, travel: 0, ledger: 0, prep: 0 };
  let scrollFrame = 0;
  let browserRouteFrame = 0;
  let pendingBrowserRestore = false;

  function elements() {
    return {
      views: Object.fromEntries(VIEWS.map((view) => [view, document.querySelector(`[data-site-view="${view}"]`)])),
      tabBar: document.querySelector("#tab-bar"),
      tabItems: [...document.querySelectorAll(".tab-bar__item")],
      skipLink: document.querySelector("#skip-link")
    };
  }

  function updateTabs(view) {
    const tab = TAB_FOR_VIEW[view];
    document.querySelectorAll(".tab-bar__item").forEach((item) => {
      const isActive = item.dataset.tab === tab;
      item.classList.toggle("is-active", isActive);
      if (isActive) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }

  function setVisibleView(nextView, options = {}) {
    const { views, tabBar, skipLink } = elements();
    if (!views[nextView]) return;

    const viewChanged = activeView !== nextView;
    if (viewChanged) scrollPositions[activeView] = window.scrollY;
    activeView = nextView;

    VIEWS.forEach((view) => {
      const element = views[view];
      if (!element) return;
      element.hidden = view !== nextView;
      element.toggleAttribute("inert", view !== nextView);
    });
    document.body.dataset.activeView = nextView;
    document.body.dataset.activeTab = TAB_FOR_VIEW[nextView];
    updateTabs(nextView);
    if (skipLink) skipLink.href = `#${views[nextView].id}`;

    if (nextView === "ledger") {
      const tab = location.hash === "#ledger-stats" ? "stats" : location.hash === "#ledger" ? "entry" : "";
      if (tab) window.TravelLedger?.setActiveTab?.(tab, { updateHash: false });
    }

    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (nextView !== "ledger" && viewChanged) window.dispatchEvent(new Event("travel-view:shown"));
      if (options.targetId && nextView === "travel") {
        document.getElementById(options.targetId)?.scrollIntoView({ block: "start" });
      } else if ((viewChanged || options.forceScroll) && options.restore) {
        window.scrollTo({ top: scrollPositions[nextView] || 0 });
      } else if (viewChanged || options.forceScroll) {
        window.scrollTo({ top: 0 });
      }
    });
    void tabBar;
  }

  function routeFromLocation(options = {}) {
    const hash = location.hash;
    const nextView = viewForHash(hash);
    const targetId = nextView === "travel" && TRAVEL_HASHES.has(hash) && hash !== "" ? hash.slice(1) : "";
    setVisibleView(nextView, { ...options, targetId });
  }

  function navigate(hash) {
    const nextView = viewForHash(hash);
    scrollPositions[activeView] = window.scrollY;
    if (location.hash === hash && viewForHash(location.hash) === nextView) {
      setVisibleView(nextView, { targetId: nextView === "travel" ? hash.slice(1) : "" });
      return;
    }
    history.pushState({ view: nextView }, "", hash);
    setVisibleView(nextView, { targetId: nextView === "travel" ? hash.slice(1) : "" });
  }

  function scheduleBrowserRoute({ restore = false } = {}) {
    pendingBrowserRestore ||= restore;
    if (browserRouteFrame) return;
    browserRouteFrame = requestAnimationFrame(() => {
      browserRouteFrame = 0;
      const shouldRestore = pendingBrowserRestore;
      pendingBrowserRestore = false;
      routeFromLocation({ restore: shouldRestore });
    });
  }

  function syncTabAvailability() {
    const { tabBar } = elements();
    if (!tabBar) return;
    document.querySelector('.tab-bar__item[data-tab="ledger"]')?.classList.toggle("is-hidden", !moduleEnabled("ledger"));
    document.querySelector('.tab-bar__item[data-tab="prep"]')?.classList.toggle("is-hidden", !moduleEnabled("todo"));
    document.querySelector('.tab-bar__item[data-tab="trip"]')?.classList.toggle("is-hidden", !moduleEnabled("itinerary"));
    document.querySelector('.tab-bar__item[data-tab="overview"]')?.classList.toggle("is-hidden", !moduleEnabled("flights") && !moduleEnabled("overview") && !moduleEnabled("driving"));
    tabBar.hidden = false;
  }

  function setup() {
    history.scrollRestoration = "manual";
    activeView = viewForHash(location.hash);
    if (!location.hash) history.replaceState({ view: "overview" }, "", "#top");
    routeFromLocation({ restore: false, forceScroll: true });
    // Tab 栏在模块配置就绪后再显示；3 秒兜底（数据加载失败时也能导航）
    setTimeout(() => syncTabAvailability(), 3000);

    document.addEventListener("click", (event) => {
      const tabItem = event.target.closest(".tab-bar__item");
      if (tabItem && !tabItem.classList.contains("is-hidden")) {
        event.preventDefault();
        const tab = tabItem.dataset.tab;
        const targetView = Object.entries(TAB_FOR_VIEW).find(([, value]) => value === tab)?.[0] || "overview";
        navigate(HOME_HASH[targetView] || "#top");
        return;
      }

      const ledgerLink = event.target.closest("#ledger-navigation-link");
      if (ledgerLink) {
        event.preventDefault();
        navigate("#ledger");
        return;
      }

      const wordmark = event.target.closest("#wordmark");
      if (wordmark) {
        event.preventDefault();
        scrollPositions[activeView] = 0;
        if (activeView === "overview") navigate("#top");
        else navigate(HOME_HASH[activeView]);
        return;
      }
    });

    window.addEventListener("popstate", () => scheduleBrowserRoute({ restore: true }));
    window.addEventListener("hashchange", () => scheduleBrowserRoute());
    window.addEventListener("travel-config:ready", () => {
      syncTabAvailability();
      activeView = viewForHash(location.hash);
      routeFromLocation({ forceScroll: false });
    });
    window.addEventListener("travel-ledger:navigate", (event) => {
      const hash = event.detail?.tab === "stats" ? "#ledger-stats" : "#ledger";
      if (location.hash !== hash) history.pushState({ view: "ledger" }, "", hash);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
