const LANG_LABEL = {
  en: "English", hinglish: "Hinglish", mr: "Marathi", hi: "Hindi", "mr-latn": "Marathi (Roman)", mixed: "Mixed"
};

export function languageLabel(code) {
  return LANG_LABEL[code] || code || "";
}

/** Human-readable category name ("fake_unrelated" is the image model's non-civic class). */
export function categoryLabel(cat) {
  if (!cat) return "—";
  if (cat === "fake_unrelated") return "Not a civic photo";
  if (cat === "unprocessed") return "Not checked";
  return String(cat).replaceAll("_", " ");
}
