# Reader Widget

En tillgänglighets-widget för att ge stöd till användare med läs- och skrivsvårigheter. Widgeten bäddas in via **en enda script-rad** hos kund, och all logik/styles hostas centralt.

---

## Projektstruktur

```
/
├─ allowlist.loader.js      → Loader som kunder bäddar in
├─ reader_widget.js         → Widget-logik (icke-minifierad)
├─ reader_widget.min.js     → Widget-logik (minifierad)
├─ reader_widget_base.css   → Bas-styling (ligger i layer rw-base)
├─ customer_css/            → Kundspecifika CSS-filer
│   ├─ mitt_nercia.css
│   └─ ...
└─ index.html               → Test/demo-sida
```

---

## Hur det fungerar

1. **Kunden bäddar in loadern:**

   ```html
   <script async src="https://cdn.din-domän.se/reader/0.1.3/allowlist.loader.js"></script>
   ```

2. **Loadern gör:**

   * Kontrollerar att domänen är tillåten (`ALLOW` i `allowlist.loader.js`).
   * Laddar `reader_widget_base.css` (standardlayout, lager `rw-base`).
   * Laddar ev. kundspecifik CSS från `customer_css/` (lager `rw-customer`).
   * Laddar `reader_widget(.min).js`.

3. **Basen vs. kund:**

   * `reader_widget_base.css` innehåller all standard-styling.
   * `mitt_nercia.css` eller annan kundfil innehåller overrides i `@layer rw-customer`.
   * Ordningen `@layer rw-base, rw-customer;` gör att kund alltid vinner över bas.

---

## Lägga till en ny kund/domän

1. Öppna **`allowlist.loader.js`**.
2. Lägg till domänen i `ALLOW`:

   ```js
   var ALLOW = [
     "mitt.nercia.se",
     "kund1.se",
     "*.kund2.se"   // wildcard för alla subdomäner
   ];
   ```
3. Om kunden ska ha egen styling, mappa i `CUSTOMER_CSS`:

   ```js
   var CUSTOMER_CSS = {
     "mitt.nercia.se": "mitt_nercia.css",
     "kund1.se": "kund1.css",
     "*.kund2.se": "kund2.css"
   };
   ```
4. Skapa filen i `customer_css/`, t.ex. `customer_css/kund1.css`.

---

## När kunden ska ha **standard-styling**

* Lägg **bara** domänen i `ALLOW`, inte i `CUSTOMER_CSS`.
* Loadern laddar då enbart `reader_widget_base.css` + JS.

Exempel:

```js
var ALLOW = ["standardkund.se"];
var CUSTOMER_CSS = { /* tomt för denna */ };
```

---

## Exempel-flöde (från förfrågan till leverans)

1. **Kundförfrågan:** Ny kund vill ha widgeten på sin domän `kund1.se`.
2. **Uppdatera loadern:**

   * Lägg till `"kund1.se"` i `ALLOW`.
   * Lägg till `"kund1.se": "kund1.css"` i `CUSTOMER_CSS`.
3. **Skapa kundens CSS:**

   * Lägg en ny fil `customer_css/kund1.css`.
   * Ange deras font, färger, ev. logotyper i `@layer rw-customer { ... }`.
4. **Deploy:** Lägg upp filerna på CDN (t.ex. `/reader/0.1.4/`).
5. **Test:** Besök `https://kund1.se`, öppna DevTools → Network → se att `customer_css/kund1.css` laddas (200). Kontrollera att deras profil syns.
6. **Leverans:** Ge kunden **en** rad att lägga in:

   ```html
   <script async src="https://cdn.din-domän.se/reader/0.1.4/allowlist.loader.js"></script>
   ```

---

## Kund-CSS exempel

```css
/* customer_css/mitt_nercia.css */
@import url("https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;700&display=swap");

@layer rw-customer {
  :root {
    --rw-font-family: "Ubuntu", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    --rw-accent: #1876d4;
  }

  .rw-tool {
    background: var(--rw-accent);
    color: #fff;
  }
  .rw-tool:hover {
    background: #1668bb;
  }
  .rw-tool[aria-pressed="true"] {
    background: #12599f;
  }
}
```

---

## Minifiering

### JS

Minifiera `reader_widget.js` → `reader_widget.min.js` med Terser:

```bash
npx terser reader_widget.js -o reader_widget.min.js
```
```bash
npx terser allowlist.loader.js -o allowlist.loader.min.js
```

### CSS

Använd valfritt verktyg, t.ex. cssnano:

```bash
npx cssnano reader_widget_base.css reader_widget_base.min.css
```

---

### Devtools

```bash
const s = document.createElement('script');
s.src = 'https://gopurpl.github.io/reader_widget/allowlist.loader.min.js?' + Date.now();
s.async = true;
document.head.appendChild(s);
```

```bash
ReaderWidget.open()
```
```bash
ReaderWidget.close()
```

## Features i widgeten

* Uppläsning av markerad text eller hela sidan
* Röstval (svenska/engelska)
* Justerbar hastighet och zoom
* Dyslexiläge
* Radfokus/spotlight
* Tangentbordsgenvägar

---

## Support

För frågor eller önskemål om anpassning:
**support@din-domän.se**
