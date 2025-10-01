(function () {
  var VERSION = "0.1.3";
  var CUSTOMER_DIR = "customer_css/";
  var ANALYTICS_ENDPOINT = ""; // Sätt till ditt API-endpoint för användningsstatistik

  var ALLOW = [
    "localhost",
    "127.0.0.1",
    "[::1]",
    "mitt.nercia.se",
    "nercia.se",
  ];
  var CUSTOMER_CSS = {
    "localhost":      "mitt_nercia.css",
    "127.0.0.1":      "mitt_nercia.css",
    "mitt.nercia.se": "mitt_nercia.css",
    "nercia.se":      "mitt_nercia.css",
  };
  var CUSTOMER_ID = {
    "localhost": "demo_local",
    "127.0.0.1": "demo_local",
    "[::1]": "demo_local",
    "mitt.nercia.se": "mitt_nercia",
    "nercia.se": "mitt_nercia"
  };

  function currentScriptBase() {
    var s = document.currentScript || document.getElementsByTagName("script")[document.scripts.length-1];
    var src = s && s.src ? s.src : "";
    return src ? src.replace(/[^\/]+$/, "") : "";
  }
  var CDN = currentScriptBase();
  var IS_DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  function allowedDomain(h){
    h = (h||location.hostname).toLowerCase();
    if (ALLOW.includes(h)) return true;
    for (var i=0;i<ALLOW.length;i++){
      var rule = ALLOW[i];
      if (rule && rule.indexOf("*.")===0){
        var base = rule.slice(2).toLowerCase();
        if (h===base || h.endsWith("."+base)) return true;
      }
    }
    return false;
  }
  function findCustomerCss(h){
    h = (h||location.hostname).toLowerCase();
    if (CUSTOMER_CSS[h]) return CUSTOMER_CSS[h];
    for (var k in CUSTOMER_CSS){
      if (!Object.prototype.hasOwnProperty.call(CUSTOMER_CSS,k)) continue;
      if (k.indexOf("*.")===0){
        var base = k.slice(2).toLowerCase();
        if (h===base || h.endsWith("."+base)) return CUSTOMER_CSS[k];
      }
    }
    return null;
  }

  var host = location.hostname;
  if (!allowedDomain(host)) return;

  var prevConfig = window.__ReaderWidgetConfig || {};
  var resolvedCustomerId = prevConfig.customerId || CUSTOMER_ID[host] || host;
  var analyticsCfg = Object.assign({}, prevConfig.analytics || {});
  if (!analyticsCfg.endpoint && ANALYTICS_ENDPOINT) analyticsCfg.endpoint = ANALYTICS_ENDPOINT;

  window.__ReaderWidgetConfig = Object.assign({}, prevConfig, {
    version: VERSION,
    customerId: resolvedCustomerId,
    analytics: analyticsCfg
  });

  // 1) Bas-CSS
  var linkBase = document.createElement("link");
  linkBase.rel = "stylesheet";
  linkBase.href = CDN + "reader_widget_base.css?v=" + VERSION;
  document.head.appendChild(linkBase);

  // 2) Kund-CSS
  var css = findCustomerCss(host);
  if (css) {
    var linkCust = document.createElement("link");
    linkCust.rel = "stylesheet";
    linkCust.href = CDN + CUSTOMER_DIR + css + "?v=" + VERSION;
    linkCust.onerror = function(){ console.warn("[RW] Misslyckades ladda kund-CSS:", linkCust.href); };
    document.head.appendChild(linkCust);
  }

  // 3) Widget-JS (dev .js, prod .min.js)
  var s = document.createElement("script");
  s.defer = true;
  s.src = CDN + (IS_DEV ? "reader_widget.js" : "reader_widget.min.js") + "?v=" + VERSION;
  document.head.appendChild(s);
})();
