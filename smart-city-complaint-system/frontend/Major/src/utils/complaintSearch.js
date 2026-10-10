// Words an admin might type that map to evidence verdicts / flags
const ALIASES = {
  fake: ["LIKELY_FAKE", "FAKE_MISMATCH", "DUPLICATE"],
  mismatch: ["FAKE_MISMATCH"],
  duplicate: ["DUPLICATE"],
  reused: ["DUPLICATE"],
  "re-used": ["DUPLICATE"],
  suspicious: ["SUSPICIOUS"],
  verified: ["VERIFIED"],
  unverified: ["UNVERIFIED"],
  ai: ["LIKELY_FAKE"],
  review: ["__REVIEW__"],
  surge: ["__SURGE__"]
};

const LANGS = { english: "en", hinglish: "hinglish", marathi: "mr", hindi: "hi" };

function haystack(c) {
  return [
    c._id, c.description, c.englishGloss, c.category, c.rootCauseCategory, c.symptomCategory,
    c.imageCategory, c.clipVisualCategory, c.language, c.status, c.veracityStatus, c.causeText,
    c.citizen?.name, c.citizen?.email
  ].filter(Boolean).join(" ").toLowerCase().replaceAll("_", " ");
}

/** true if every word of the query matches the complaint (AND search). */
export function complaintMatches(c, query) {
  const text = haystack(c);
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => {
    const alias = ALIASES[word];
    if (alias) {
      if (alias[0] === "__REVIEW__") return Boolean(c.needsManualReview);
      if (alias[0] === "__SURGE__") return Boolean(c.surgeFlag);
      return alias.includes(c.veracityStatus) || (word === "fake" && c.isFake);
    }
    if (LANGS[word]) {
      const lang = c.language || "";
      return word === "marathi" ? lang.startsWith("mr") : lang === LANGS[word];
    }
    return text.includes(word.replaceAll("_", " "));
  });
}
