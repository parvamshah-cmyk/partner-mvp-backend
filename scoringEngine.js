const MIN_SCORE = 0;
const MAX_SCORE = 98;

// Generate a polarized blueprint — clear favorites and clear mismatches per trait
function generateBlueprint() {
  function randomize(options) {
    // Shuffle so the favored value is random each session
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    const result = {};
    shuffled.forEach((opt, i) => {
      if (i === 0) {
        result[opt] = 55 + Math.floor(Math.random() * 25); // 55-79 (strong match)
      } else if (i === 1) {
        result[opt] = 25 + Math.floor(Math.random() * 20); // 25-44 (decent match)
      } else {
        result[opt] = 5 + Math.floor(Math.random() * 15);  // 5-19 (weak match)
      }
    });
    return result;
  }

  return {
    height: randomize(["tall", "average", "short"]),
    complexion: randomize(["dark", "fair", "wheatish"]),
    bodyType: randomize(["slim", "athletic", "average", "heavy"]),
    career: randomize(["govt", "business", "tech", "creative", "medical", "service"]),
    finances: randomize(["wealthy", "stable", "average", "struggling"]),
    personality: randomize(["ambitious", "easygoing", "romantic", "reserved", "outgoing"]),
  };
}

// Start from 20 — Destiny Quotient baseline
function generateBaseScore() {
  return 20;
}

function calculateDelta(blueprint, step, traitValue) {
  const stepBlueprint = blueprint[step];
  if (!stepBlueprint || !traitValue || !(traitValue in stepBlueprint)) {
    return 0;
  }

  const probability = stepBlueprint[traitValue];

  // Wide swings — big jumps up for matches, real drops for mismatches
  if (probability > 50) return 14 + Math.floor(Math.random() * 10);  // +14 to +23
  if (probability >= 25) return 5 + Math.floor(Math.random() * 9);   // +5 to +13
  if (probability >= 12) return -(3 + Math.floor(Math.random() * 6)); // -3 to -8
  return -(6 + Math.floor(Math.random() * 7));                       // -6 to -12
}

function applyScore(currentScore, delta) {
  const raw = currentScore + delta;
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, raw));
}

function getProbability(blueprint, step, traitValue) {
  const stepBlueprint = blueprint[step];
  if (!stepBlueprint || !traitValue) return 0;
  return stepBlueprint[traitValue] || 0;
}

// Pick the top N trait values by probability from a single trait's blueprint
function pickTopValues(blueprint, trait, count = 2) {
  const traitBlueprint = blueprint[trait];
  if (!traitBlueprint) return [];

  return Object.entries(traitBlueprint)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([val]) => val);
}

module.exports = {
  generateBlueprint,
  generateBaseScore,
  calculateDelta,
  applyScore,
  getProbability,
  pickTopValues,
  MIN_SCORE,
  MAX_SCORE,
};
