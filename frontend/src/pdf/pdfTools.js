// frontend/src/pdf/pdfTools.js

/* =========================
   Helpers
   ========================= */

// URL absolue depuis un href relatif
const toAbs = (href) => {
  try { return new URL(href, window.location.origin).href; }
  catch { return href; }
};

// Blob -> data:URL
async function urlToDataURL(url) {
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* =========================
   CSS collector
   ========================= */

// Récupère TOUT le CSS (balises <style> + fichiers <link rel="stylesheet">)
export async function collectAllCssText() {
  let cssText = "";

  // 1) styles inline
  document.querySelectorAll("style").forEach((s) => {
    cssText += s.textContent || "";
  });

  // 2) fichiers css liés
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'));
  for (const link of links) {
    const url = toAbs(link.getAttribute("href"));
    try {
      const res = await fetch(url, { credentials: "omit" });
      if (res.ok) {
        cssText += "\n\n/* ---- " + url + " ---- */\n" + (await res.text());
      }
    } catch { /* ignore */ }
  }
  return cssText;
}

/* =========================
   Images inlining
   ========================= */

// Remplace toutes les <img src="…"> par des data:URL (si pas déjà en data:)
async function inlineAllImages(contentHTML) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = contentHTML;

  const imgs = Array.from(wrapper.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) return;

      const abs = src.startsWith("http") ? src : toAbs(src);
      const dataUrl = await urlToDataURL(abs);
      if (dataUrl) {
        img.setAttribute("src", dataUrl);
      } else {
        // si l'image échoue, ne pas imprimer un "alt" visible
        img.setAttribute("src", "");
        img.setAttribute("alt", "");
        img.style.visibility = "hidden";
      }
    })
  );

  return wrapper.innerHTML;
}

/* =========================
   Standalone HTML builder
   ========================= */

// Construit un document HTML AUTONOME (A4, sans marges) à partir d’un nœud
export async function buildStandaloneHTMLFrom(node, { title = "PDF" } = {}) {
  const rawHTML = node ? node.outerHTML : "<div/>";
  const contentHTML = await inlineAllImages(rawHTML);   // ← EMBARQUE les images
  const allCss = await collectAllCssText();

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { size: A4; margin: 0; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    /* IMPORTANT : le conteneur du preview doit avoir cette classe */
    .preview-body, .pdf-root {
      width: 210mm !important;
      min-height: 297mm !important;
      margin: 0 !important;
      overflow: hidden !important;
      background: #fff !important;
    }
    ${allCss}
  </style>
</head>
<body>
  ${contentHTML}

  <script>
    // Attendre polices + images pour éviter les décalages
    (function waitForAssets(){
      const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      const imgs = Array.from(document.images || []);
      Promise.all([
        fontsReady,
        ...imgs.map(img => (img.complete && img.naturalWidth > 0)
          ? Promise.resolve()
          : new Promise(res => { img.addEventListener('load', res, {once:true}); img.addEventListener('error', res, {once:true}); })
        )
      ]).then(() => document.body.setAttribute('data-ready', '1'));
    })();
  </script>
</body>
</html>`;
}

/* =========================
   Generate & Save
   ========================= */

// Sauvegarde un PDF via l’API exposée par preload (Electron)
// selector : le conteneur qui englobe tout le visuel du preview (ex: ".preview-body")
export async function generateAndSaveFromSelector(
  filename,
  {
    selector = ".preview-body",
    type = "facture", // 'facture' | 'facture_cachee' | 'devis'
  } = {}
) {
  if (!window?.electronAPI?.saveHTMLAsPDF) {
    // fallback : impression navigateur si Electron n’est pas dispo
    window.print();
    return true;
  }

  const root = document.querySelector(selector) || document.body;
  const html = await buildStandaloneHTMLFrom(root, { title: filename });

  const res = await window.electronAPI.saveHTMLAsPDF({
    type,
    fileName: filename,
    html,
  });

  if (!res?.success) throw new Error(res?.error || "saveHTMLAsPDF failed");

  // Ouvrir localement si l’API expose openPath (optionnel)
  if (res.path && window.electronAPI.openPath) {
    try { await window.electronAPI.openPath(res.path); } catch {}
  }
  return true;
}
