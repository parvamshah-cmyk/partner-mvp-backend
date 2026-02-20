const { VertexAI } = require("@google-cloud/vertexai");

const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT_ID,
  location: process.env.GOOGLE_CLOUD_LOCATION,
});

const model = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const stepConfig = {
  appearance: {
    traits: ["height", "complexion", "bodyType"],
    allowedValues: {
      height: ["tall", "average", "short"],
      complexion: ["dark", "fair", "wheatish"],
      bodyType: ["slim", "athletic", "average", "heavy"],
    },
    fallbackQuestion: "Tell me about your partner's physical appearance — how's their height, complexion, and body type?",
  },
  career: {
    traits: ["career", "finances"],
    allowedValues: {
      career: ["govt", "business", "tech", "creative", "medical", "service"],
      finances: ["wealthy", "stable", "average", "struggling"],
    },
    fallbackQuestion: "Tell me about your partner's career and financial situation — what do they do and how are they doing financially?",
  },
  personality: {
    traits: ["personality"],
    allowedValues: {
      personality: ["ambitious", "easygoing", "romantic", "reserved", "outgoing"],
    },
    fallbackQuestion: "How would you describe your partner's personality — ambitious, easygoing, romantic, reserved, or outgoing?",
  },
};


async function callLLM(prompt) {
  const result = await model.generateContent(prompt);
  const text = result.response.candidates[0].content.parts[0].text.trim();
  if (!text) throw new Error("Empty Vertex AI response");
  return text.replace(/^["']+|["']+$/g, "");
}

async function validateBirthInput(step, userMessage, partialBirthData) {
  if (step !== "birthInfo") return { valid: true };

  // If we already have partial data, combine it with the new message
  const fullInput = partialBirthData
    ? `${partialBirthData} ${userMessage}`
    : userMessage;

  try {
    const raw = await callLLM(
      `Check if this user input contains a date of birth AND a birth place/city.

User input: "${fullInput}"

Reply with ONLY a JSON object:
{"valid": true, "hasDate": true, "hasPlace": true} if it contains both a date and a place
{"valid": false, "hasDate": true, "hasPlace": false} if it has a date but no place
{"valid": false, "hasDate": false, "hasPlace": true} if it has a place but no date
{"valid": false, "hasDate": false, "hasPlace": false} if it has neither

Be lenient — accept informal formats like "march 15 98 delhi" or "15/3/1998 mumbai" or just city names like "jaipur" or "delhi".`
    );

    const jsonMatch = raw.match(/\{[^}]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error("LLM birth validation failed:", err.message);
  }

  return { valid: true, hasDate: true, hasPlace: true };
}

async function generateQuestion(step) {
  const config = stepConfig[step];
  if (!config) return "Tell me more about your partner.";

  const allOptions = config.traits
    .map((t) => `${t}: ${config.allowedValues[t].join(", ")}`)
    .join(" | ");

  try {
    const question = await callLLM(
      `You are a friendly astrology matchmaking assistant. Write 1 question asking about ${step === "appearance" ? "the user's PARTNER's physical appearance (height, complexion, and body type)" : step === "career" ? "the user's PARTNER's career and financial situation" : "the user's PARTNER's " + step}.

STRICT RULES:
- Simple, casual English
- MUST be about their PARTNER
- Under 25 words
- Friendly and direct
- NO poetry, NO fancy words
- NO quotes around your answer
- NO astrology terms in the question

EXAMPLES:
${step === "appearance"
    ? '- "Tell me about your partner\'s physical appearance — how tall are they, what\'s their complexion, and what\'s their body type?"'
    : step === "career"
      ? '- "What does your partner do for work, and how are they doing financially?"'
      : '- "How would you describe your partner\'s personality?"'
}

Reply with ONLY the question.`
    );
    if (question.length > 5 && question.length < 200) {
      return question;
    }
  } catch (err) {
    console.error("LLM question generation failed, using fallback:", err.message);
  }
  return config.fallbackQuestion;
}

function extractTraits(step, userMessage) {
  const config = stepConfig[step];
  if (!config) return {};

  const lowerMsg = userMessage.toLowerCase();
  const extracted = {};

  const aliases = {
    height: { tall: ["tall", "lamba", "6 feet", "6ft", "long", "bada"], average: ["average height", "medium height", "normal height", "5.5", "5.6", "5.7", "5.8", "theek"], short: ["short", "chhota", "small", "5 feet", "5ft", "chota", "petite"] },
    complexion: { dark: ["dark", "kaala", "black", "dusky", "brown", "saavla", "kala", "tanned"], fair: ["fair", "gora", "light", "white", "pale", "gori", "lite"], wheatish: ["wheatish", "wheat", "brownish", "sanwla", "sawla", "medium skin"] },
    bodyType: { slim: ["slim", "thin", "patla", "skinny", "lean", "dubla"], athletic: ["athletic", "fit", "muscular", "gym", "toned", "strong build", "sporty"], average: ["average build", "normal build", "medium build", "okay build"], heavy: ["heavy", "mota", "fat", "chubby", "bulky", "healthy", "plump", "overweight", "thick"] },
    career: { govt: ["govt", "gov", "government", "sarkari", "ias", "ips", "bank", "railway", "naukri", "civil", "police", "army", "military", "defence", "defense"], business: ["business", "vyapari", "shop", "own", "startup", "entrepreneur", "dukaan", "self employed", "trader", "dealer"], tech: ["tech", "software", "it", "engineer", "developer", "coding", "computer", "programmer", "data", "cyber"], creative: ["creative", "artist", "music", "design", "writer", "content", "film", "acting", "dance", "photography", "media"], medical: ["doctor", "medical", "nurse", "hospital", "surgeon", "dentist", "pharmacy", "pharmacist", "mbbs", "healthcare", "clinic", "physician", "therapist", "physio"], service: ["teacher", "professor", "lawyer", "advocate", "ca", "accountant", "pilot", "chef", "cook", "driver", "sales", "marketing", "hr", "manager", "consultant", "analyst", "retail"] },
    finances: { wealthy: ["wealthy", "rich", "ameer", "crorepati", "lakhpati", "lots of money", "high income", "very well"], stable: ["stable", "good income", "comfortable", "well off", "decent money", "earning well", "good salary"], average: ["average income", "normal income", "okay financially", "theek thaak", "moderate income", "decent"], struggling: ["struggling", "low income", "poor", "tight", "gareeb", "not much", "barely", "financial trouble", "debt"] },
    personality: { ambitious: ["ambitious", "hardworking", "hard working", "driven", "focused", "goal", "career", "dedicated", "workaholic", "motivated", "determined", "serious", "disciplined", "hustler", "mehnat", "dominant", "bold", "aggressive", "leader", "bossy", "dabang", "strong headed"], easygoing: ["easygoing", "easy going", "calm", "chill", "relaxed", "cool", "peaceful", "composed", "laid back", "laidback", "shant", "simple", "humble", "down to earth", "chilled"], romantic: ["romantic", "loving", "sweet", "caring", "affectionate", "emotional", "sensitive", "pyaar", "love", "warm", "tender", "passionate"], reserved: ["reserved", "shy", "introvert", "introverted", "silent", "alone", "quiet", "homebody", "private", "keep to himself", "keep to herself", "doesn't talk much"], outgoing: ["outgoing", "extrovert", "extroverted", "social", "party", "fun", "energetic", "talkative", "friendly", "cheerful", "lively", "adventurous", "spontaneous"] },
  };

  for (const trait of config.traits) {
    const values = config.allowedValues[trait];

    // Direct match
    for (const val of values) {
      if (lowerMsg.includes(val)) {
        extracted[trait] = val;
        break;
      }
    }

    // Alias match if no direct match
    if (!extracted[trait] && aliases[trait]) {
      for (const [val, words] of Object.entries(aliases[trait])) {
        for (const word of words) {
          if (lowerMsg.includes(word)) {
            extracted[trait] = val;
            break;
          }
        }
        if (extracted[trait]) break;
      }
    }
  }

  return extracted;
}

async function extractTraitsWithLLM(step, userMessage, alreadyExtracted) {
  const config = stepConfig[step];
  if (!config) return alreadyExtracted;

  // Find which traits are still missing
  const missing = config.traits.filter((t) => !alreadyExtracted[t]);
  if (missing.length === 0) return alreadyExtracted;

  try {
    const traitDescriptions = missing
      .map((t) => `${t}: [${config.allowedValues[t].join(", ")}]`)
      .join("\n");

    const raw = await callLLM(
      `User was asked about their PARTNER. Extract these traits from their reply.

Traits to extract:
${traitDescriptions}

User's reply: "${userMessage}"

Reply with ONLY a JSON object like: {${missing.map((t) => `"${t}": "value"`).join(", ")}}
Use null for any trait you can't determine.`
    );

    const jsonMatch = raw.match(/\{[^}]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      for (const trait of missing) {
        const val = parsed[trait];
        if (val && config.allowedValues[trait].includes(val)) {
          alreadyExtracted[trait] = val;
        }
      }
    }
  } catch (err) {
    console.error("LLM extraction failed:", err.message);
  }

  return alreadyExtracted;
}

async function generateCommentary(traits, deltas, currentScore) {
  const traitSummary = Object.entries(traits)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const totalDelta = Object.values(deltas).reduce((a, b) => a + b, 0);

  try {
    const text = await callLLM(
      `You are Atri, a warm and wise astrology assistant. The user just described their ideal partner. Give a SHORT, gentle acknowledgment.

What user described: ${traitSummary}

RULES:
- 1 sentence, under 12 words
- Warm and polished tone — think wise astrologer, not casual friend
- Acknowledge what they said simply
- Do NOT use Hindi words (no bhai, yaar, haha, etc.)
- Do NOT use slang or overly casual language
- Do NOT mention any score, quotient, percentage, or numbers
- Do NOT mention alignment, matching, or compatibility
- Do NOT use astrology terms (save those for the prediction)
- NO exclamation marks more than one
- NO poetry

EXAMPLES:
- "Tall, dark and handsome — a timeless choice."
- "Ambitious with a romantic side, interesting."
- "A doctor — you know what you want."
- "Fair and slim — clear picture."
- "Easygoing nature, that says a lot."
- "Tech career with stable finances, noted."

Reply with ONLY the reaction.`
    );
    if (text.length > 3 && text.length < 120) {
      return text;
    }
  } catch (err) {
    console.error("LLM commentary failed, using fallback:", err.message);
  }

  const traitValues = Object.values(traits).join(", ");
  return `${traitValues} — noted, let me check your chart.`;
}

const predictionIntros = {
  appearance: "your destined partner will look like",
  personality: "your destined partner will have a nature",
  career: "your destined partner will have a profession",
};

async function generateTraitPrediction(step, extractedTraits, blueprint) {
  const config = stepConfig[step];
  if (!config) return { prediction: "Your birth chart shows interesting signs.", detail: "The stars are aligning for you." };

  // Build the chart's predicted traits from the blueprint (top values)
  const chartTraits = {};
  for (const trait of config.traits) {
    if (blueprint[trait]) {
      const sorted = Object.entries(blueprint[trait]).sort((a, b) => b[1] - a[1]);
      chartTraits[trait] = sorted[0][0]; // top predicted value
    }
  }

  const chartSummary = Object.entries(chartTraits)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const userSummary = Object.entries(extractedTraits)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  // Check how many traits match
  const matches = [];
  const mismatches = [];
  for (const trait of config.traits) {
    if (extractedTraits[trait] && chartTraits[trait]) {
      if (extractedTraits[trait] === chartTraits[trait]) {
        matches.push(`${trait}: ${chartTraits[trait]}`);
      } else {
        mismatches.push(`${trait}: chart says ${chartTraits[trait]}, user said ${extractedTraits[trait]}`);
      }
    }
  }

  const intro = predictionIntros[step] || "your partner shows";
  const matchContext = matches.length > 0 && mismatches.length === 0
    ? "ALL traits match the chart — strong alignment"
    : matches.length > 0
      ? `Some traits match (${matches.map(m => m.split(":")[1]).join(", ")}), some differ`
      : "The chart predicted different traits";

  try {
    const raw = await callLLM(
      `You are a confident astrology assistant doing a kundli reading.

The BIRTH CHART predicts these traits: ${chartSummary}
The USER described their partner as: ${userSummary}
Match status: ${matchContext}

Frame what the BIRTH CHART predicts in TWO parts. Reply with a JSON object.

IMPORTANT: Describe what the CHART says (${chartSummary}), NOT what the user said. If the chart and user match, this feels confirmatory. If they differ, mention what the chart shows matter-of-factly.

PART 1 (intro): Start with "According to your birth chart" and include 1-2 astrology terms (Venus in 7th house, Mars-Jupiter conjunction, Rahu in 10th, nakshatra alignment, Mangal dosha, Shukra placement). Then say "${intro}" and describe using the CHART'S predicted traits (${chartSummary}). 1-2 sentences, under 30 words.

PART 2 (detail): Continue with more astrological detail. If traits match, be reassuring and positive. If some don't match, stay warm but note "the stars see a slightly different picture" and still be encouraging about the overall compatibility. 1-2 sentences, under 30 words.

EXAMPLES when traits MATCH:
Part 1: "According to your birth chart, with Venus in your 7th house, your destined partner will look like — tall, fair, with an athletic build."
Part 2: "This matches exactly what you described! Your Shukra-Guru conjunction confirms strong physical compatibility."

EXAMPLES when traits PARTIALLY DIFFER:
Part 1: "Your kundli shows, with Mars in your 7th house, your destined partner will look like — tall, fair-complexioned, with a slim build."
Part 2: "The stars see a slightly different complexion than you described, but your overall planetary alignment is still promising for compatibility."

EXAMPLES when traits MOSTLY DIFFER:
Part 1: "Based on your Rahu-Ketu axis, your destined partner will have a nature that's easygoing with a reserved side."
Part 2: "Your chart painted a different picture than what you described, but remember — cosmic compatibility is about the full chart, not just one aspect."

Reply with ONLY a JSON object: {"part1": "...", "part2": "..."}`
    );

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.part1 && parsed.part2) {
        return { prediction: parsed.part1, detail: parsed.part2 };
      }
    }
  } catch (err) {
    console.error("LLM trait prediction failed, using fallback:", err.message);
  }

  // Fallback
  const chartValues = Object.values(chartTraits).join(", ");
  if (matches.length >= mismatches.length) {
    return {
      prediction: `According to your birth chart, with Venus in your 7th house, ${intro} — ${chartValues}.`,
      detail: `This aligns well with what you described! Your planetary positions confirm strong compatibility here.`,
    };
  }
  return {
    prediction: `According to your birth chart, with Venus in your 7th house, ${intro} — ${chartValues}.`,
    detail: `The stars see a slightly different picture, but your overall chart still shows good compatibility potential.`,
  };
}

async function generateBirthChartCommentary(birthInfo) {
  try {
    const text = await callLLM(
      `You are a friendly astrology assistant. The user just shared their birth details: "${birthInfo}". React with a short, warm observation about their birth chart being ready.

RULES:
- 1-2 sentences, under 25 words
- Mention that you've created their birth chart / kundli
- Sound excited and warm
- Simple casual English
- NO poetry
- Reference something vague about their stars/planets looking interesting

EXAMPLES:
- "Your birth chart is ready! I can already see some interesting planetary alignments — let's dive in."
- "Got your kundli ready! Your Venus placement is looking quite promising — let's explore."
- "Your stars are mapped! Some really interesting alignments showing up — let me ask you a few things."

Reply with ONLY the reaction.`
    );
    if (text.length > 3 && text.length < 180) {
      return text;
    }
  } catch (err) {
    console.error("LLM birth chart commentary failed, using fallback:", err.message);
  }
  return "Your birth chart is ready! I can see some interesting planetary alignments — let's explore your compatibility.";
}

module.exports = {
  stepConfig,
  validateBirthInput,
  generateQuestion,
  extractTraits,
  extractTraitsWithLLM,
  generateCommentary,
  generateBirthChartCommentary,
  generateTraitPrediction,
};
