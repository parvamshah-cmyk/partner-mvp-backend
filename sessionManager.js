const { v4: uuidv4 } = require("uuid");
const { generateBlueprint, generateBaseScore } = require("./scoringEngine");

const birthSteps = ["birthInfo"];

// Grouped trait steps: physical appearance is ONE step covering height + complexion
const traitSteps = ["appearance", "personality", "career"];

const allSteps = [...birthSteps, ...traitSteps];

const stepLabels = {
  birthInfo: "Your Birth Details",
  appearance: "Physical Appearance",
  personality: "Inner Nature",
  career: "Career & Finances",
};

const sessions = new Map();

function createSession() {
  const sessionId = uuidv4();
  const baseScore = generateBaseScore();
  const session = {
    id: sessionId,
    currentStepIndex: 0,
    currentStep: allSteps[0],
    completedSteps: [],
    score: baseScore,
    blueprint: generateBlueprint(),
    extractedTraits: {},
    birthInfo: {},
    createdAt: Date.now(),
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function isBirthStep(step) {
  return birthSteps.includes(step);
}

function saveBirthInfo(sessionId, step, value) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.birthInfo[step] = value;
  sessions.set(sessionId, session);
  return session;
}

function advanceStep(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.completedSteps.push(session.currentStep);
  session.currentStepIndex += 1;

  if (session.currentStepIndex >= allSteps.length) {
    session.currentStep = null;
  } else {
    session.currentStep = allSteps[session.currentStepIndex];
  }

  sessions.set(sessionId, session);
  return session;
}

function updateScore(sessionId, newScore, traits) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.score = newScore;
  Object.assign(session.extractedTraits, traits);
  sessions.set(sessionId, session);
  return session;
}

function isComplete(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  return session.currentStep === null;
}

function getStepInfo(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || !session.currentStep) return null;

  if (isBirthStep(session.currentStep)) {
    const birthIndex = birthSteps.indexOf(session.currentStep);
    return {
      stepNumber: birthIndex + 1,
      totalSteps: birthSteps.length,
      stepName: session.currentStep,
      stepLabel: stepLabels[session.currentStep],
      phase: "birth",
    };
  }

  const traitIndex = traitSteps.indexOf(session.currentStep);
  return {
    stepNumber: traitIndex + 1,
    totalSteps: traitSteps.length,
    stepName: session.currentStep,
    stepLabel: stepLabels[session.currentStep],
    phase: "traits",
  };
}

// Clean up sessions older than 1 hour
setInterval(() => {
  const oneHour = 60 * 60 * 1000;
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > oneHour) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000);

module.exports = {
  allSteps,
  birthSteps,
  traitSteps,
  createSession,
  getSession,
  isBirthStep,
  saveBirthInfo,
  advanceStep,
  updateScore,
  isComplete,
  getStepInfo,
};
