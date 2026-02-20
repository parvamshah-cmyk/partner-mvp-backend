require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sessionManager = require("./sessionManager");
const scoringEngine = require("./scoringEngine");
const llmService = require("./llmService");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const birthQuestions = {
  birthInfo: "What's your date of birth and where were you born? (e.g. 15 March 1998, Mumbai)",
};

// Hardcoded questions for each step (shown as last Blob after LLM commentary + prediction)
const hardcodedQuestions = {
  appearance: "So, tell me how do you imagine your ideal partner to look like — height, complexion, body type?",
  personality: "Tell me another one, what do you imagine your ideal partner's nature will be — ambitious or easygoing or romantic?",
  career: "Last one, what do you want your ideal partner's profession to be?",
};

// Start a new session
app.post("/start-session", async (req, res) => {
  try {
    const session = sessionManager.createSession();
    const stepInfo = sessionManager.getStepInfo(session.id);

    res.json({
      sessionId: session.id,
      question: birthQuestions[session.currentStep],
      score: session.score,
      stepInfo,
    });
  } catch (err) {
    console.error("Error starting session:", err);
    res.status(500).json({ error: "Failed to start session" });
  }
});

// Get the hardcoded question for a step
function getNextStepContent(step) {
  return hardcodedQuestions[step] || "Tell me more about your partner.";
}

// Handle chat message
app.post("/chat", async (req, res) => {
  try {
    const { sessionId, userMessage } = req.body;

    if (!sessionId || !userMessage) {
      return res.status(400).json({ error: "sessionId and userMessage are required" });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (sessionManager.isComplete(sessionId)) {
      return res.json({
        complete: true,
        finalScore: session.score,
        message: "Your compatibility analysis is complete.",
        extractedTraits: session.extractedTraits,
      });
    }

    const currentStep = session.currentStep;

    // --- Birth info steps (no scoring, just collect) ---
    if (sessionManager.isBirthStep(currentStep)) {
      // Check if we have partial birth data from a previous attempt
      const partialData = session.birthInfo._partial || null;
      const validation = await llmService.validateBirthInput(currentStep, userMessage, partialData);

      if (!validation.valid) {
        // If date given but no place, remember the date and ask for place only
        if (validation.hasDate && !validation.hasPlace) {
          sessionManager.saveBirthInfo(sessionId, "_partial", userMessage);
          return res.json({
            extractedTrait: null,
            scoreDelta: 0,
            newScore: session.score,
            commentary: "Got your birth date! Now just tell me your birth place/city.",
            nextQuestion: "Which city were you born in?",
            stepInfo: sessionManager.getStepInfo(sessionId),
            complete: false,
            birthStep: true,
          });
        }

        // If place given but no date, remember the place and ask for date only
        if (!validation.hasDate && validation.hasPlace) {
          sessionManager.saveBirthInfo(sessionId, "_partial", userMessage);
          return res.json({
            extractedTrait: null,
            scoreDelta: 0,
            newScore: session.score,
            commentary: "Got your birth place! Now just tell me your date of birth.",
            nextQuestion: "What's your date of birth? (for eg 15 March, 1998)",
            stepInfo: sessionManager.getStepInfo(sessionId),
            complete: false,
            birthStep: true,
          });
        }

        // Neither date nor place
        return res.json({
          extractedTrait: null,
          scoreDelta: 0,
          newScore: session.score,
          commentary: "I need your birth date and city to read your stars. Could you share those?",
          nextQuestion: "What's your date of birth and where were you born? (for eg 15 March, 1998, Jaipur)",
          stepInfo: sessionManager.getStepInfo(sessionId),
          complete: false,
          birthStep: true,
        });
      }

      // Valid — combine partial + current if needed
      const fullBirthInfo = partialData ? `${partialData} ${userMessage}` : userMessage;
      sessionManager.saveBirthInfo(sessionId, currentStep, fullBirthInfo);
      sessionManager.advanceStep(sessionId);

      const updated = sessionManager.getSession(sessionId);
      const stepInfo = sessionManager.getStepInfo(sessionId);

      let nextQuestion;
      if (sessionManager.isBirthStep(updated.currentStep)) {
        nextQuestion = birthQuestions[updated.currentStep];
      } else {
        nextQuestion = getNextStepContent(updated.currentStep);
      }

      // LLM commentary about their birth chart being ready
      const commentary = await llmService.generateBirthChartCommentary(fullBirthInfo);

      return res.json({
        extractedTrait: null,
        scoreDelta: 0,
        newScore: session.score,
        commentary,
        nextQuestion,
        stepInfo,
        complete: false,
        birthStep: true,
      });
    }

    // --- Trait steps (with scoring) ---
    // Step 1: Extract traits via keyword matching
    let extracted = llmService.extractTraits(currentStep, userMessage);

    // Step 2: LLM fallback for any missing traits
    extracted = await llmService.extractTraitsWithLLM(currentStep, userMessage, extracted);

    // Only re-ask if NOTHING was extracted at all
    const hasAnyTrait = Object.keys(extracted).length > 0;

    if (!hasAnyTrait) {
      const retryQuestion = hardcodedQuestions[currentStep] || llmService.stepConfig[currentStep]?.fallbackQuestion || "Tell me more about your partner.";
      return res.json({
        extractedTrait: null,
        scoreDelta: 0,
        newScore: session.score,
        commentary: "Hmm, couldn't quite catch that. Could you say it more clearly?",
        nextQuestion: retryQuestion,
        stepInfo: sessionManager.getStepInfo(sessionId),
        complete: false,
      });
    }

    // Step 3: Score each extracted trait using session blueprint
    const previousScore = session.score;
    const deltas = {};
    let totalDelta = 0;

    for (const [trait, value] of Object.entries(extracted)) {
      const d = scoringEngine.calculateDelta(session.blueprint, trait, value);
      deltas[trait] = d;
      totalDelta += d;
    }

    // Career is the final step — add adaptive boost to land in a good range (65-85)
    const isLastStep = currentStep === "career";
    if (isLastStep) {
      const projectedScore = scoringEngine.applyScore(previousScore, totalDelta);
      const targetMin = 65;
      const targetMax = 85;
      if (projectedScore < targetMin) {
        // Boost to land in target range
        const boost = (targetMin - projectedScore) + Math.floor(Math.random() * 10);
        totalDelta += boost;
      } else if (projectedScore > targetMax) {
        // Gentle pullback to keep it realistic
        const pullback = (projectedScore - targetMax) + Math.floor(Math.random() * 5);
        totalDelta -= Math.floor(pullback * 0.5);
      }
    }

    const newScore = scoringEngine.applyScore(previousScore, totalDelta);

    // Step 4: Update session with new score and all extracted traits
    sessionManager.updateScore(sessionId, newScore, extracted);
    sessionManager.advanceStep(sessionId);

    // Step 5: Generate commentary (Blob 1) and birth chart prediction (Blob 2 + 3)
    const [commentary, predictionResult] = await Promise.all([
      llmService.generateCommentary(extracted, deltas, newScore),
      llmService.generateTraitPrediction(currentStep, extracted, session.blueprint),
    ]);

    // Check if complete (career is the last step)
    if (sessionManager.isComplete(sessionId)) {
      return res.json({
        extractedTrait: extracted,
        scoreDelta: totalDelta,
        newScore,
        commentary,
        prediction: predictionResult.prediction,
        predictionDetail: predictionResult.detail,
        nextQuestion: null,
        stepInfo: null,
        complete: true,
        finalMessage: "Your compatibility analysis is complete.",
      });
    }

    // Hardcoded next question (Blob 4)
    const updatedSession = sessionManager.getSession(sessionId);
    const nextQuestion = getNextStepContent(updatedSession.currentStep);
    const stepInfo = sessionManager.getStepInfo(sessionId);

    res.json({
      extractedTrait: extracted,
      scoreDelta: totalDelta,
      newScore,
      commentary,
      prediction: predictionResult.prediction,
      predictionDetail: predictionResult.detail,
      nextQuestion,
      stepInfo,
      complete: false,
    });
  } catch (err) {
    console.error("Error in chat:", err);
    res.status(500).json({ error: "Failed to process message" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
