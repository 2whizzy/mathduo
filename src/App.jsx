import React, { useEffect, useMemo, useRef, useState } from "react";
import './index.css' // Import Tailwind CSS styles
// ==========================
// Math Duel for LG TV Browser
// Single-file React component
// - Local play, 2 players
// - Operation + range selection
// - Timer with ticking sound
// - First to buzz gets 10-option MCQ (ambiguous distractors)
// - Correct: reveal answer; Wrong: keep hidden & allow retries
// - Scoreboard: click player name to add +5
// - Attractive UI with Tailwind & subtle motion (minimal custom CSS)
// ==========================

// Utility: Web Audio tiny sound engine (no external files)
export default function UseSoundEngine() {
  const ctxRef = useRef(null);
  const ensureCtx = () => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) ctxRef.current = new Ctx();
    }
    return ctxRef.current;
  };

  const playBeep = (freq = 440, durationMs = 120, type = "sine", gain = 0.05) => {
    const ctx = ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + durationMs / 1000);
  };

  const click = () => playBeep(660, 60, "square", 0.04);
  const tick = () => playBeep(520, 40, "triangle", 0.03);
  const correct = () => {
    playBeep(700, 90, "sine", 0.06);
    setTimeout(() => playBeep(900, 120, "sine", 0.06), 100);
  };
  const wrong = () => {
    playBeep(220, 160, "sawtooth", 0.06);
    setTimeout(() => playBeep(180, 120, "sawtooth", 0.05), 80);
  };
  const buzz = () => playBeep(300, 220, "square", 0.07);

  return { click, tick, correct, wrong, buzz };
}

// Helpers
const fmtRange = (r) => `${r.min}–${r.max}`;
const DEFAULT_RANGES = [
  { id: "r1", min: 0, max: 100 },
  { id: "r2", min: 0, max: 200 },
  { id: "r3", min: 200, max: 400 },
  { id: "r4", min: 400, max: 800 },
  { id: "r5", min: 800, max: 1200 },
];
const PLAYERS = [
  { id: "p1", name: "Mariana the Queen", emoji: "👑" },
  { id: "p2", name: "Soliyana the Princess", emoji: "👸" },
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateOperands(op, range) {
  let a = randInt(range.min, range.max);
  let b = randInt(range.min, range.max);
  if (op === "÷") {
    // Make division yield an integer result (ambiguous but solvable)
    const divisorCandidates = [2, 3, 4, 5, 6, 7, 8, 9];
    const d = divisorCandidates[randInt(0, divisorCandidates.length - 1)];
    const q = randInt(Math.max(1, Math.floor(range.min / (d || 1))), Math.max(1, Math.floor(range.max / d)));
    return { a: d * q, b: d };
  }
  if (op === "−") {
    // Ensure non-negative sometimes to reduce trickiness
    if (b > a) [b, a] = [a, b];
  }
  return { a, b };
}

function computeAnswer(op, a, b) {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return Math.floor(a / b); // integer division by construction
    default:
      return 0;
  }
}

function buildAmbiguousChoices(correct, op, a, b, count = 10) {
  // Generate plausible distractors clustered around the correct answer,
  // including near-misses, swapped-digits, rounding traps, and parity-similar values.
  const set = new Set([correct]);

  const push = (v) => {
    if (Number.isFinite(v) && !set.has(v) && set.size < count) set.add(v);
  };

  // Base offsets around the correct value
  const offsets = [
    -1, 1, -2, 2, -3, 3, -5, 5, -10, 10, -12, 12, -20, 20, -25, 25,
  ];
  shuffle(offsets).forEach((d) => push(correct + d));

  // For addition/subtraction, include errors from carrying/borrowing
  if (op === "+" || op === "−") {
    const ones = correct % 10;
    push(correct + (ones >= 5 ? - (10 - ones) : (5 - ones))); // rounding trap
  }

  // For multiplication, include partial-product traps
  if (op === "×") {
    push(a * (b - 1));
    push((a - 1) * b);
    push(a * b + a); // forgot one group
  }

  // For division, include quotient +/- 1 and remainder traps
  if (op === "÷") {
    push(correct + 1);
    push(correct - 1);
    push(correct * 2); // confused with divisor or factor
  }

  // Swapped digits or last-two-digit tweaks
  const str = String(correct);
  if (str.length >= 2) {
    const swapped = parseInt(str.slice(0, -2) + str.slice(-1) + str.slice(-2, -1));
    if (!Number.isNaN(swapped)) push(swapped);
    push(parseInt(str.slice(0, -1) + ((+str.slice(-1) + 3) % 10)));
  }

  // Fill with random near values if needed
  while (set.size < count) {
    push(correct + randInt(-30, 30));
  }

  return shuffle([...set]);
}

function Pill({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full border transition transform active:scale-95 shadow-sm ${
        active
          ? "bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white border-transparent"
          : "bg-white/80 backdrop-blur border-fuchsia-300 hover:bg-fuchsia-50"
      }`}
    >
      {children}
    </button>
  );
}

function FancyCard({ children }) {
  return (
    <div className="rounded-2xl p-4 md:p-6 bg-white/80 backdrop-blur shadow-xl border border-fuchsia-200">
      {children}
    </div>
  );
}

export default function App() {
  const sounds = useSoundEngine();

  const [stage, setStage] = useState("setup-op"); // setup-op -> setup-range -> ready -> playing
  const [op, setOp] = useState("+");
  const [range, setRange] = useState(DEFAULT_RANGES[1]);
  const [customRange, setCustomRange] = useState({ min: "", max: "" });

  const [question, setQuestion] = useState(null); // {a,b,op,answer,choices:[]}
  const [revealed, setRevealed] = useState(false);

  const [timer, setTimer] = useState(200);
  const [ticking, setTicking] = useState(false);
  const tickRef = useRef(null);

  const [buzzedBy, setBuzzedBy] = useState(null); // "p1" | "p2" | null

  const [scores, setScores] = useState({ p1: 0, p2: 0 });

  const activeRange = useMemo(() => {
    if (range.id !== "custom") return range;
    const min = Number(customRange.min);
    const max = Number(customRange.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return { min: 0, max: 100 };
    }
    return { min, max };
  }, [range, customRange]);

  const startTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    setTicking(true);
    tickRef.current = setInterval(() => {
      setTimer((t) => {
        if (t > 0) {
          sounds.tick();
          return t - 1;
        } else {
          clearInterval(tickRef.current);
          return 0;
        }
      });
    }, 1000);
  };

  const stopTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    setTicking(false);
  };

  const newQuestion = (keepTimer = false) => {
    const { a, b } = generateOperands(op, activeRange);
    const answer = computeAnswer(op, a, b);
    const choices = buildAmbiguousChoices(answer, op, a, b, 10);
    setQuestion({ a, b, op, answer, choices });
    setRevealed(false);
    setBuzzedBy(null);
    if (!keepTimer) setTimer(30);
  };

  useEffect(() => {
    return () => stopTick();
  }, []);

  const beginGame = () => {
    sounds.click();
    newQuestion();
    setStage("playing");
    startTick();
  };

  const handleBuzz = (pid) => {
    if (buzzedBy) return; // first buzz locks
    sounds.buzz();
    setBuzzedBy(pid);
  };

  const handleChoice = (value) => {
    if (!buzzedBy) return; // must buzz first
    if (!question) return;
    if (revealed) return;
    if (value === question.answer) {
      sounds.correct();
      setRevealed(true);
      stopTick();
      // Allow scoring by tapping player's name (+5)
    } else {
      sounds.wrong();
      // Unlock buzz again for either player to try
      setBuzzedBy(null);
    }
  };

  const addScore = (pid, delta = 5) => {
    sounds.click();
    setScores((s) => ({ ...s, [pid]: s[pid] + delta }));
  };

  const nextRound = () => {
    sounds.click();
    newQuestion();
    startTick();
  };

  const opButtons = ["+", "−", "×", "÷"]; // use nice glyphs

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-fuchsia-100 via-rose-100 to-amber-100 text-gray-800">
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl md:text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-600 to-rose-600">
            Mind Math Duel
          </h1>
          <div className="flex items-center gap-3">
            {PLAYERS.map((p) => (
              <button
                key={p.id}
                onClick={() => addScore(p.id, 5)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 border border-amber-300 shadow hover:shadow-md active:scale-95 transition"
                title="Add +5"
              >
                <span className="text-xl">{p.emoji}</span>
                <span className="font-bold hidden sm:inline">{p.name}</span>
                <span className="font-black">+5</span>
              </button>
            ))}
          </div>
        </header>

        {/* Scoreboard */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {PLAYERS.map((p) => (
            <FancyCard key={p.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{p.emoji}</span>
                  <span className="font-extrabold">{p.name}</span>
                </div>
                <div className="text-3xl font-black bg-gradient-to-r from-amber-500 to-pink-500 text-transparent bg-clip-text">
                  {scores[p.id]}
                </div>
              </div>
            </FancyCard>
          ))}
        </div>

        {/* Setup Stages */}
        {stage !== "playing" && (
          <FancyCard>
            {stage === "setup-op" && (
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-black">1) Choose operation</h2>
                <div className="flex flex-wrap gap-3">
                  {opButtons.map((sym) => (
                    <Pill
                      key={sym}
                      active={op === sym}
                      onClick={() => {
                        sounds.click();
                        setOp(sym);
                        setStage("setup-range");
                      }}
                    >
                      <span className="text-2xl font-black">{sym}</span>
                    </Pill>
                  ))}
                </div>
              </div>
            )}

            {stage === "setup-range" && (
              <div className="space-y-4">
                <h2 className="text-xl md:text-2xl font-black">2) Choose number range</h2>
                <div className="flex flex-wrap gap-3">
                  {DEFAULT_RANGES.map((r) => (
                    <Pill
                      key={r.id}
                      active={range.id === r.id}
                      onClick={() => {
                        sounds.click();
                        setRange(r);
                      }}
                    >
                      {fmtRange(r)}
                    </Pill>
                  ))}
                  <Pill
                    active={range.id === "custom"}
                    onClick={() => {
                      sounds.click();
                      setRange({ id: "custom", min: 0, max: 0 });
                    }}
                  >
                    Custom
                  </Pill>
                </div>
                {range.id === "custom" && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Min"
                      className="px-4 py-2 rounded-xl border border-fuchsia-300"
                      value={customRange.min}
                      onChange={(e) => setCustomRange((c) => ({ ...c, min: e.target.value }))}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Max"
                      className="px-4 py-2 rounded-xl border border-fuchsia-300"
                      value={customRange.max}
                      onChange={(e) => setCustomRange((c) => ({ ...c, max: e.target.value }))}
                    />
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={beginGame}
                    className="w-full md:w-auto px-5 py-3 rounded-2xl font-extrabold text-white bg-gradient-to-r from-fuchsia-600 to-rose-600 shadow-lg hover:shadow-xl active:scale-95"
                  >
                    Start Game
                  </button>
                </div>
              </div>
            )}
          </FancyCard>
        )}

        {/* Gameplay */}
        {stage === "playing" && question && (
          <div className="space-y-6">
            <FancyCard>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="text-center md:text-left">
                  <div className="text-sm uppercase tracking-widest text-fuchsia-600 font-bold">Question</div>
                  <div className="text-3xl md:text-5xl font-black">
                    {question.a} <span className="text-fuchsia-600">{question.op}</span> {question.b} = ?
                  </div>
                  <div className="mt-1 text-xs text-gray-600">Range: {fmtRange(activeRange)}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm uppercase tracking-widest text-rose-600 font-bold">Time Left</div>
                  <div className={`text-4xl md:text-6xl font-black ${timer <= 5 ? "text-rose-600" : "text-gray-800"}`}>{timer}s</div>
                  <div className="mt-2 flex gap-2 justify-center">
                    <button
                      onClick={() => {
                        sounds.click();
                        if (ticking) { stopTick(); } else { startTick(); }
                      }}
                      className="px-3 py-2 rounded-xl bg-white border border-amber-300 shadow"
                    >
                      {ticking ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => { sounds.click(); setTimer(30); }}
                      className="px-3 py-2 rounded-xl bg-white border border-amber-300 shadow"
                    >
                      Reset 30s
                    </button>
                  </div>
                </div>
              </div>
            </FancyCard>

            {/* Buzzers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PLAYERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleBuzz(p.id)}
                  disabled={!!buzzedBy}
                  className={`rounded-2xl p-6 border-2 shadow-lg transition transform active:scale-95 ${
                    buzzedBy
                      ? "bg-white/60 border-gray-200"
                      : p.id === "p1"
                      ? "bg-gradient-to-r from-amber-200 to-rose-200 border-amber-400 hover:shadow-xl"
                      : "bg-gradient-to-r from-fuchsia-200 to-pink-200 border-fuchsia-400 hover:shadow-xl"
                  }`}
                >
                  <div className="text-2xl font-black">{p.emoji} {p.name}</div>
                  <div className="opacity-70">Tap to Buzz In</div>
                </button>
              ))}
            </div>

            {/* Who buzzed */}
            <div className="text-center">
              {buzzedBy ? (
                <div className="inline-block px-4 py-2 rounded-full bg-black/80 text-white font-bold">
                  {PLAYERS.find((x) => x.id === buzzedBy)?.emoji} {PLAYERS.find((x) => x.id === buzzedBy)?.name} — Your turn!
                </div>
              ) : (
                <div className="text-sm text-gray-600">Waiting for a player to buzz…</div>
              )}
            </div>

            {/* Choices */}
            <FancyCard>
              <div className="text-sm uppercase tracking-widest text-fuchsia-600 font-bold mb-3">Choose the answer</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {question.choices.map((choice, idx) => {
                  const isCorrect = revealed && choice === question.answer;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleChoice(choice)}
                      className={`px-4 py-3 rounded-2xl border text-lg font-bold shadow hover:shadow-md active:scale-95 transition ${
                        isCorrect
                          ? "bg-emerald-100 border-emerald-400"
                          : "bg-white border-fuchsia-300"
                      } ${!buzzedBy && !revealed ? "opacity-50 cursor-not-allowed" : ""}`}
                      disabled={!buzzedBy && !revealed}
                    >
                      {choice}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  {revealed ? (
                    <span className="font-bold">Correct Answer:</span>
                  ) : (
                    <span className="opacity-70">Answer hidden until correct.</span>
                  )}
                  {revealed && (
                    <span className="ml-2 inline-block px-2 py-1 rounded-lg bg-emerald-200 border border-emerald-400 font-black">
                      {question.answer}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {revealed && (
                    <button
                      onClick={nextRound}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold shadow"
                    >
                      Next Round
                    </button>
                  )}
                  <button
                    onClick={() => { sounds.click(); newQuestion(true); }}
                    className="px-4 py-2 rounded-xl bg-white border border-amber-300 shadow"
                  >
                    New Question (keep timer)
                  </button>
                </div>
              </div>
            </FancyCard>

            {/* Quick Tips */}
            <div className="text-center text-xs text-gray-600">
              Tip: After a correct answer, tap a player's name at the top to add <span className="font-black">+5</span> to their score.
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-10 text-center text-xs text-gray-500">
          Built for local play · Works on LG TV browser via your PC's local IP.
        </footer>
      </div>
    </div>
  );
}
