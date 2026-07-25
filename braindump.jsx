import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Check, Trash2, Sparkles, AlertCircle, ListTodo, NotebookPen, Heart, Trees, Trophy, Lock } from "lucide-react";

const BUCKETS = [
  { key: "today", label: "Today", accent: "#E5707E" },
  { key: "week", label: "This week", accent: "#F2A65A" },
  { key: "someday", label: "Someday", accent: "#7FA88F" },
];

const TASKS_KEY = "braindump:tasks";
const NOTES_KEY = "braindump:notes";
const COMPANION_KEY = "braindump:companion";
const STATS_KEY = "braindump:stats";
const DAILY_PET_LIMIT = 5;

const ACHIEVEMENTS = [
  { id: "first_task", label: "First Steps", desc: "complete your first task", check: (s) => s.tasksCompleted >= 1 },
  { id: "ten_tasks", label: "On a Roll", desc: "complete 10 tasks", check: (s) => s.tasksCompleted >= 10 },
  { id: "first_note", label: "Getting It Out", desc: "save your first note", check: (s) => s.notesSaved >= 1 },
  { id: "ten_notes", label: "Open Journal", desc: "save 10 notes", check: (s) => s.notesSaved >= 10 },
  { id: "first_pet", label: "Friendly", desc: "pet a companion", check: (s) => s.pets >= 1 },
  {
    id: "any_bloom",
    label: "Green Thumb",
    desc: "grow any companion past its early stage",
    check: (s) => Object.values(s.companionData).some((p) => p >= GROWTH_MIN[2]),
  },
  {
    id: "any_radiant",
    label: "Fully Grown",
    desc: "grow any companion to its final stage",
    check: (s) => Object.values(s.companionData).some((p) => p >= GROWTH_MIN[4]),
  },
  {
    id: "menagerie",
    label: "Menagerie",
    desc: "start growing every companion at least once",
    check: (s) => SPECIES.every((sp) => (s.companionData[sp.id] || 0) > 0),
  },
  { id: "reflexes", label: "Quick Reflexes", desc: "score 10 in Spark Catch", check: (s) => s.highScore >= 10 },
  { id: "spark_master", label: "Spark Master", desc: "score 20 in Spark Catch", check: (s) => s.highScore >= 20 },
];

const GROWTH_MIN = [0, 8, 20, 40, 70];
const STAGE_SIZES = [30, 42, 56, 70, 86];

const CATEGORIES = {
  cleaning: { label: "Cleaning", affinity: "cat" },
  health: { label: "Health & self-care", affinity: "plant" },
  creative: { label: "Creative", affinity: "cloud" },
  work: { label: "Work / admin", affinity: "star" },
  social: { label: "Social / errands", affinity: "blob" },
  other: { label: "Other", affinity: null },
};
const BASE_TASK_XP = 2;
const BONUS_TASK_XP = 4;

const SPECIES = [
  {
    id: "blob",
    label: "Blob",
    kind: "shape",
    zone: "ground",
    colors: ["#5C6B57", "#7FA88F", "#9FCBB0", "#F2A65A", "#F7C978"],
    stageNames: ["seed", "sprout", "bloom", "glow", "radiant"],
    likes: "social & errand tasks",
  },
  {
    id: "cat",
    label: "Cat",
    kind: "emoji",
    zone: "ground",
    emojis: ["🥚", "🐱", "😺", "🐈", "🦁"],
    color: "#F2A65A",
    stageNames: ["egg", "kitten", "cat", "big cat", "lion"],
    likes: "cleaning tasks",
  },
  {
    id: "plant",
    label: "Plant",
    kind: "emoji",
    zone: "ground",
    emojis: ["🌱", "🌿", "🪴", "🌳", "🌸"],
    color: "#7FA88F",
    stageNames: ["seed", "sprout", "potted plant", "tree", "blossom"],
    likes: "health & self-care tasks",
  },
  {
    id: "cloud",
    label: "Cloud",
    kind: "emoji",
    zone: "sky",
    emojis: ["☁️", "⛅", "🌤️", "🌥️", "🌈"],
    color: "#8FB6D9",
    stageNames: ["wisp", "small cloud", "sunny cloud", "storm cloud", "rainbow"],
    likes: "creative tasks",
  },
  {
    id: "star",
    label: "Star",
    kind: "emoji",
    zone: "sky",
    emojis: ["✨", "⭐", "🌟", "💫", "🌠"],
    color: "#F7C978",
    stageNames: ["spark", "star", "bright star", "shimmer", "shooting star"],
    likes: "work & admin tasks",
  },
];

function stageIndexFor(points) {
  let idx = 0;
  GROWTH_MIN.forEach((m, i) => {
    if (points >= m) idx = i;
  });
  return idx;
}

function useVoiceCapture() {
  // Shared mic engine with an iOS-safe auto-restart, since Safari's
  // `continuous` mode silently drops the connection after a pause.
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const shouldListenRef = useRef(false);

  const buildRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcript + " ";
        } else {
          interim += transcript;
        }
      }
      setLiveTranscript(finalTranscriptRef.current + interim);
    };

    rec.onerror = (e) => {
      // "no-speech" fires constantly on iOS during natural pauses — not a real error.
      if (e.error !== "no-speech") {
        setError("Mic hiccup (" + e.error + ") — still trying to listen.");
      }
    };

    rec.onend = () => {
      if (shouldListenRef.current) {
        // iOS/Safari drops the session on its own; silently pick it back up.
        try {
          rec.start();
        } catch (_) {
          /* already starting, ignore */
        }
      } else {
        setListening(false);
      }
    };

    return rec;
  }, []);

  const start = useCallback(() => {
    setError(null);
    const rec = buildRecognition();
    if (!rec) {
      setError("Voice capture isn't supported here — open this page directly in Safari (not inside an app webview or as a home-screen icon).");
      return;
    }
    finalTranscriptRef.current = "";
    setLiveTranscript("");
    recognitionRef.current = rec;
    shouldListenRef.current = true;
    rec.start();
    setListening(true);
  }, [buildRecognition]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
    const dump = finalTranscriptRef.current.trim();
    setLiveTranscript("");
    return dump;
  }, []);

  return { listening, liveTranscript, error, start, stop };
}

export default function BrainDump() {
  const [tab, setTab] = useState("tasks");

  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [taskError, setTaskError] = useState(null);
  const [nag, setNag] = useState(null);

  const [companionData, setCompanionData] = useState({});
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [notesSaved, setNotesSaved] = useState(0);
  const [pets, setPets] = useState(0);
  const [petGate, setPetGate] = useState({ count: 0, date: "" });
  const [activeSpecies, setActiveSpecies] = useState("blob");
  const [companionHighScore, setCompanionHighScore] = useState(0);
  const [bump, setBump] = useState(false);
  const [sparks, setSparks] = useState([]);
  const [sessionScore, setSessionScore] = useState(0);
  const [gameRunning, setGameRunning] = useState(false);
  const gameAreaRef = useRef(null);
  const spawnTimerRef = useRef(null);

  const taskVoice = useVoiceCapture();
  const noteVoice = useVoiceCapture();

  // ---- load persisted data ----
  useEffect(() => {
    (async () => {
      try {
        const t = await window.storage.get(TASKS_KEY, false);
        if (t && t.value) setTasks(JSON.parse(t.value));
      } catch (_) {}
      try {
        const n = await window.storage.get(NOTES_KEY, false);
        if (n && n.value) setNotes(JSON.parse(n.value));
      } catch (_) {}
      try {
        const c = await window.storage.get(COMPANION_KEY, false);
        if (c && c.value) {
          const parsed = JSON.parse(c.value);
          if (parsed.data) {
            setCompanionData(parsed.data);
            setActiveSpecies(parsed.active || "blob");
          } else if (typeof parsed.points === "number") {
            // migrate the old single-companion save
            setCompanionData({ blob: parsed.points });
          }
          setCompanionHighScore(parsed.highScore || 0);
        }
      } catch (_) {}
      try {
        const st = await window.storage.get(STATS_KEY, false);
        if (st && st.value) {
          const parsed = JSON.parse(st.value);
          setTasksCompleted(parsed.tasksCompleted || 0);
          setNotesSaved(parsed.notesSaved || 0);
          setPets(parsed.pets || 0);
          setPetGate(parsed.petGate || { count: 0, date: "" });
        }
      } catch (_) {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.storage.set(TASKS_KEY, JSON.stringify(tasks), false).catch(() => {});
  }, [tasks, loaded]);

  useEffect(() => {
    if (!loaded) return;
    window.storage.set(NOTES_KEY, JSON.stringify(notes), false).catch(() => {});
  }, [notes, loaded]);

  useEffect(() => {
    if (!loaded) return;
    window.storage
      .set(STATS_KEY, JSON.stringify({ tasksCompleted, notesSaved, pets, petGate }), false)
      .catch(() => {});
  }, [tasksCompleted, notesSaved, pets, petGate, loaded]);

  useEffect(() => {
    if (!loaded) return;
    window.storage
      .set(COMPANION_KEY, JSON.stringify({ data: companionData, active: activeSpecies, highScore: companionHighScore }), false)
      .catch(() => {});
  }, [companionData, activeSpecies, companionHighScore, loaded]);

  // ---- mini-game: sparks spawn while the game is running, tapping one scores a point ----
  useEffect(() => {
    if (!gameRunning) return;
    spawnTimerRef.current = setInterval(() => {
      const id = crypto.randomUUID();
      const x = 8 + Math.random() * 84;
      const y = 8 + Math.random() * 74;
      setSparks((prev) => [...prev, { id, x, y }]);
      setTimeout(() => setSparks((prev) => prev.filter((s) => s.id !== id)), 1400);
    }, 850);
    return () => clearInterval(spawnTimerRef.current);
  }, [gameRunning]);

  const addCompanionPoints = (n) => {
    setCompanionData((prev) => ({ ...prev, [activeSpecies]: (prev[activeSpecies] || 0) + n }));
  };

  const popSpark = (id) => {
    setSparks((prev) => prev.filter((s) => s.id !== id));
    setSessionScore((s) => s + 1);
    addCompanionPoints(1);
  };

  const startGame = () => {
    setSessionScore(0);
    setSparks([]);
    setGameRunning(true);
  };

  const endGame = () => {
    setGameRunning(false);
    setSparks([]);
    setCompanionHighScore((h) => Math.max(h, sessionScore));
  };

  const petCompanion = () => {
    setBump(true);
    setTimeout(() => setBump(false), 260);
    const today = new Date().toDateString();
    const current = petGate.date === today ? petGate.count : 0;
    if (current >= DAILY_PET_LIMIT) return;
    setPetGate({ count: current + 1, date: today });
    addCompanionPoints(1);
    setPets((c) => c + 1);
  };

  // ---- nag rotation ----
  useEffect(() => {
    const urgent = tasks.filter((t) => t.bucket === "today" && !t.done);
    if (urgent.length === 0) {
      setNag(null);
      return;
    }
    let i = 0;
    setNag(urgent[0]);
    const id = setInterval(() => {
      i = (i + 1) % urgent.length;
      setNag(urgent[i]);
    }, 6000);
    return () => clearInterval(id);
  }, [tasks]);

  const handleStopTaskDump = async () => {
    const dump = taskVoice.stop();
    if (!dump) return;
    await processTranscript(dump);
  };

  const handleStopNoteDump = () => {
    const dump = noteVoice.stop();
    if (!dump) return;
    setNotes((prev) => [
      { id: crypto.randomUUID(), text: dump, createdAt: Date.now() },
      ...prev,
    ]);
    setNotesSaved((c) => c + 1);
  };

  const processTranscript = async (dump) => {
    setProcessing(true);
    setTaskError(null);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: `You turn rambling voice-dump transcripts into a task list for someone with ADHD who thinks out loud. Extract every distinct actionable item or thing-to-remember from the transcript below. For each one, guess a bucket: "today" (urgent or time-sensitive), "week" (needs doing soon but not urgent), or "someday" (vague, low-priority, or aspirational). Also guess a category from this exact list: "cleaning" (tidying, chores, laundry, dishes), "health" (self-care, appointments, exercise, food, rest), "creative" (writing, art, music, projects, hobbies), "work" (job tasks, admin, emails, deadlines, studying), "social" (calls, messages, errands, seeing people), or "other" if none fit. Keep task text short and concrete, in the person's own words where possible, imperative-ish phrasing.

Respond with ONLY a raw JSON array, no markdown fences, no preamble, in this exact shape:
[{"text": "call the landlord about the leak", "bucket": "today", "category": "work"}, {"text": "...", "bucket": "week", "category": "cleaning"}]

If the transcript contains no actionable items, respond with [].

Transcript:
"""${dump}"""`,
            },
          ],
        }),
      });
      const data = await response.json();
      const textBlock = (data.content || []).find((b) => b.type === "text");
      if (!textBlock) throw new Error("No response content");
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const newTasks = parsed.map((p) => ({
          id: crypto.randomUUID(),
          text: p.text,
          bucket: ["today", "week", "someday"].includes(p.bucket) ? p.bucket : "someday",
          category: Object.keys(CATEGORIES).includes(p.category) ? p.category : "other",
          done: false,
          createdAt: Date.now(),
        }));
        setTasks((prev) => [...newTasks, ...prev]);
      }
    } catch (e) {
      setTaskError("Couldn't sort that dump — try again?");
    } finally {
      setProcessing(false);
    }
  };

  const toggleDone = (id) => {
    const target = tasks.find((t) => t.id === id);
    if (target && !target.done) {
      const cat = CATEGORIES[target.category] || CATEGORIES.other;
      const beneficiary = cat.affinity || activeSpecies;
      const amount = cat.affinity ? BONUS_TASK_XP : BASE_TASK_XP;
      setCompanionData((prev) => ({ ...prev, [beneficiary]: (prev[beneficiary] || 0) + amount }));
      setTasksCompleted((c) => c + 1);
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };
  const deleteTask = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));
  const moveTask = (id, bucket) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, bucket } : t)));
  const setTaskCategory = (id, category) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, category } : t)));
  const deleteNote = (id) => setNotes((prev) => prev.filter((n) => n.id !== id));

  const activeCount = tasks.filter((t) => !t.done).length;

  const fmtDate = (ts) =>
    new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#14161F",
        color: "#E8E6E1",
        fontFamily: "'Inter', -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 16px 80px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap');
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.06); opacity: 0.85; }
        }
        @keyframes listenPulse {
          0% { box-shadow: 0 0 0 0 rgba(229,112,126,0.5); }
          70% { box-shadow: 0 0 0 22px rgba(229,112,126,0); }
          100% { box-shadow: 0 0 0 0 rgba(229,112,126,0); }
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .bd-task { animation: dropIn 0.35s ease-out; }
        .bd-mic-idle { animation: breathe 3.4s ease-in-out infinite; }
        .bd-mic-listening { animation: listenPulse 1.6s ease-out infinite; }
        @keyframes twinkle {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); }
        }
        @keyframes drift {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(6px); }
        }
        @keyframes bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .bd-twinkle { animation: twinkle 2.6s ease-in-out infinite; display: inline-block; }
        .bd-drift { animation: drift 5s ease-in-out infinite; display: inline-block; }
        .bd-bob { animation: bob 3.2s ease-in-out infinite; display: inline-block; }
        button { font-family: inherit; }
        ::selection { background: #F2A65A; color: #14161F; }
      `}</style>

      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: 28,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          brain dump
        </h1>
        <p style={{ color: "#8B8D99", fontSize: 14, margin: "6px 0 0" }}>
          {tab === "tasks"
            ? activeCount === 0
              ? "nothing pending — talk whenever"
              : `${activeCount} open thing${activeCount === 1 ? "" : "s"} rattling around`
            : `${notes.length} raw note${notes.length === 1 ? "" : "s"} saved`}
        </p>
      </div>

      {/* tab switcher */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 3,
          marginTop: 20,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 11,
          padding: 3,
          maxWidth: 460,
        }}
      >
        {[
          { key: "tasks", label: "Tasks", icon: ListTodo, color: "#F2A65A" },
          { key: "notes", label: "Notes", icon: NotebookPen, color: "#7FA88F" },
          { key: "companion", label: "Companion", icon: Heart, color: "#F7C978" },
          { key: "scene", label: "Scene", icon: Trees, color: "#8FB6D9" },
          { key: "achievements", label: "Awards", icon: Trophy, color: "#D9A8E5" },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 9px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: active ? `${t.color}2E` : "transparent",
                color: active ? t.color : "#8B8D99",
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "tasks" && (
        <>
          {nag && (
            <div
              key={nag.id}
              style={{
                marginTop: 18,
                padding: "10px 16px",
                borderRadius: 12,
                background: "rgba(229,112,126,0.12)",
                border: "1px solid rgba(229,112,126,0.35)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                maxWidth: 380,
                width: "100%",
              }}
            >
              <AlertCircle size={16} color="#E5707E" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#F0C7CC" }}>
                still today: <strong>{nag.text}</strong>
              </span>
            </div>
          )}

          <div style={{ marginTop: 36, marginBottom: 20 }}>
            <button
              onClick={taskVoice.listening ? handleStopTaskDump : taskVoice.start}
              disabled={processing}
              aria-label={taskVoice.listening ? "Stop recording" : "Start recording"}
              className={taskVoice.listening ? "bd-mic-listening" : "bd-mic-idle"}
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                border: "none",
                cursor: processing ? "default" : "pointer",
                background: "linear-gradient(135deg, #F2A65A, #E5707E)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
              }}
            >
              {processing ? (
                <Sparkles size={34} color="#14161F" />
              ) : taskVoice.listening ? (
                <Square size={30} color="#14161F" fill="#14161F" />
              ) : (
                <Mic size={34} color="#14161F" />
              )}
            </button>
          </div>

          <p style={{ fontSize: 13, color: "#8B8D99", minHeight: 18, textAlign: "center" }}>
            {processing
              ? "sorting your brain..."
              : taskVoice.listening
              ? "listening — tap the square when you're done rambling"
              : "tap and just talk, however messy"}
          </p>

          {taskVoice.liveTranscript && (
            <div
              style={{
                marginTop: 14,
                maxWidth: 420,
                width: "100%",
                fontSize: 14,
                color: "#B7B9C4",
                fontStyle: "italic",
                padding: "10px 14px",
                borderLeft: "2px solid #F2A65A",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 6,
              }}
            >
              {taskVoice.liveTranscript}
            </div>
          )}

          {(taskError || taskVoice.error) && (
            <div style={{ marginTop: 14, color: "#E5707E", fontSize: 13, maxWidth: 380, textAlign: "center" }}>
              {taskError || taskVoice.error}
            </div>
          )}

          <div style={{ marginTop: 44, width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 28 }}>
            {BUCKETS.map((b) => {
              const items = tasks.filter((t) => t.bucket === b.key);
              if (items.length === 0) return null;
              return (
                <div key={b.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: b.accent, display: "inline-block" }} />
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, fontSize: 15, color: "#CFD1DA" }}>
                      {b.label}
                    </span>
                    <span style={{ fontSize: 12, color: "#6E7080" }}>{items.filter((t) => !t.done).length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {items.map((t) => (
                      <div
                        key={t.id}
                        className="bd-task"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.04)",
                          opacity: t.done ? 0.45 : 1,
                        }}
                      >
                        <button
                          onClick={() => toggleDone(t.id)}
                          aria-label={t.done ? "Mark not done" : "Mark done"}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: `1.5px solid ${b.accent}`,
                            background: t.done ? b.accent : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          {t.done && <Check size={14} color="#14161F" />}
                        </button>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 14,
                            textDecoration: t.done ? "line-through" : "none",
                            color: t.done ? "#8B8D99" : "#E8E6E1",
                          }}
                        >
                          {t.text}
                        </span>
                        <select
                          value={t.category || "other"}
                          onChange={(e) => setTaskCategory(t.id, e.target.value)}
                          title="Which kind of task this is — feeds a matching companion extra"
                          style={{ background: "transparent", color: "#6E7080", border: "none", fontSize: 11, cursor: "pointer" }}
                        >
                          {Object.entries(CATEGORIES).map(([key, c]) => (
                            <option key={key} value={key} style={{ color: "#14161F" }}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={t.bucket}
                          onChange={(e) => moveTask(t.id, e.target.value)}
                          style={{ background: "transparent", color: "#8B8D99", border: "none", fontSize: 12, cursor: "pointer" }}
                        >
                          {BUCKETS.map((bb) => (
                            <option key={bb.key} value={bb.key} style={{ color: "#14161F" }}>
                              {bb.label}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => deleteTask(t.id)} aria-label="Delete task" style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}>
                          <Trash2 size={14} color="#B7B9C4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {loaded && tasks.length === 0 && (
              <p style={{ textAlign: "center", color: "#6E7080", fontSize: 13, marginTop: 20 }}>
                empty for now — tap the orb and dump whatever's in your head
              </p>
            )}
          </div>
        </>
      )}

      {tab === "notes" && (
        <>
          <div style={{ marginTop: 36, marginBottom: 20 }}>
            <button
              onClick={noteVoice.listening ? handleStopNoteDump : noteVoice.start}
              aria-label={noteVoice.listening ? "Stop recording" : "Start recording"}
              className={noteVoice.listening ? "bd-mic-listening" : "bd-mic-idle"}
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                background: "linear-gradient(135deg, #7FA88F, #4F7A66)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
              }}
            >
              {noteVoice.listening ? <Square size={30} color="#0E1712" fill="#0E1712" /> : <Mic size={34} color="#0E1712" />}
            </button>
          </div>

          <p style={{ fontSize: 13, color: "#8B8D99", minHeight: 18, textAlign: "center" }}>
            {noteVoice.listening ? "listening — this one just gets saved raw, no sorting" : "tap and ramble — nothing here gets parsed or judged"}
          </p>

          {noteVoice.liveTranscript && (
            <div
              style={{
                marginTop: 14,
                maxWidth: 420,
                width: "100%",
                fontSize: 14,
                color: "#B7B9C4",
                fontStyle: "italic",
                padding: "10px 14px",
                borderLeft: "2px solid #7FA88F",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 6,
              }}
            >
              {noteVoice.liveTranscript}
            </div>
          )}

          {noteVoice.error && (
            <div style={{ marginTop: 14, color: "#E5707E", fontSize: 13, maxWidth: 380, textAlign: "center" }}>
              {noteVoice.error}
            </div>
          )}

          <div style={{ marginTop: 40, width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 10 }}>
            {notes.map((n) => (
              <div
                key={n.id}
                className="bd-task"
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  borderLeft: "2px solid #7FA88F",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#6E7080" }}>{fmtDate(n.createdAt)}</span>
                  <button onClick={() => deleteNote(n.id)} aria-label="Delete note" style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}>
                    <Trash2 size={13} color="#B7B9C4" />
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "#E8E6E1", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{n.text}</p>
              </div>
            ))}
            {loaded && notes.length === 0 && (
              <p style={{ textAlign: "center", color: "#6E7080", fontSize: 13, marginTop: 20 }}>
                nothing saved yet — this is just an open journal, talk whenever
              </p>
            )}
          </div>
        </>
      )}

      {tab === "companion" && (
        <>
          {(() => {
            const species = SPECIES.find((s) => s.id === activeSpecies) || SPECIES[0];
            const points = companionData[activeSpecies] || 0;
            const idx = stageIndexFor(points);
            const size = STAGE_SIZES[idx];
            const stageName = species.stageNames[idx];
            const color = species.kind === "shape" ? species.colors[idx] : species.color;

            return (
              <>
                <div style={{ display: "flex", gap: 8, marginTop: 26, flexWrap: "wrap", justifyContent: "center", maxWidth: 340 }}>
                  {SPECIES.map((sp) => {
                    const spPoints = companionData[sp.id] || 0;
                    const spIdx = stageIndexFor(spPoints);
                    const preview = sp.kind === "emoji" ? sp.emojis[spIdx] : "●";
                    const isActive = sp.id === activeSpecies;
                    return (
                      <button
                        key={sp.id}
                        onClick={() => setActiveSpecies(sp.id)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                          padding: "8px 12px",
                          borderRadius: 12,
                          border: isActive ? `1px solid ${sp.kind === "shape" ? sp.colors[4] : sp.color}66` : "1px solid transparent",
                          background: isActive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 20,
                            color: sp.kind === "shape" ? sp.colors[spIdx] : undefined,
                          }}
                        >
                          {preview}
                        </span>
                        <span style={{ fontSize: 10, color: isActive ? "#E8E6E1" : "#6E7080" }}>{sp.label}</span>
                      </button>
                    );
                  })}
                </div>

                <p style={{ fontSize: 13, color: "#8B8D99", marginTop: 20, textAlign: "center" }}>
                  your {species.label.toLowerCase()} is a <strong style={{ color }}>{stageName}</strong> — it only ever grows, tap it or finish a task to nudge it along
                </p>
                <p style={{ fontSize: 11, color: "#5A5C68", marginTop: 2, textAlign: "center" }}>
                  grows extra from {species.likes}
                </p>

                <button
                  onClick={petCompanion}
                  aria-label="Pet your companion"
                  style={{
                    marginTop: 20,
                    width: 140,
                    height: 140,
                    borderRadius: "50%",
                    border: "none",
                    cursor: "pointer",
                    background: "rgba(255,255,255,0.03)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {species.kind === "shape" ? (
                    <div
                      style={{
                        width: size,
                        height: size,
                        borderRadius: "50%",
                        background: `radial-gradient(circle at 35% 30%, ${color}, ${color}99)`,
                        boxShadow: `0 0 26px ${color}66`,
                        transform: bump ? "scale(1.18)" : "scale(1)",
                        transitionProperty: "transform, width, height",
                        transitionDuration: "0.25s, 0.4s, 0.4s",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: size,
                        lineHeight: 1,
                        display: "inline-block",
                        transform: bump ? "scale(1.18)" : "scale(1)",
                        transitionProperty: "transform, font-size",
                        transitionDuration: "0.25s, 0.4s",
                      }}
                    >
                      {species.emojis[idx]}
                    </span>
                  )}
                </button>

                <p style={{ fontSize: 12, color: "#6E7080", marginTop: 10 }}>{points} points earned</p>
                <p style={{ fontSize: 11, color: "#5A5C68", marginTop: 4 }}>
                  {(() => {
                    const today = new Date().toDateString();
                    const used = petGate.date === today ? petGate.count : 0;
                    const left = Math.max(0, DAILY_PET_LIMIT - used);
                    return left > 0
                      ? `${left} head-pat${left === 1 ? "" : "s"} left today — finishing tasks grows them too`
                      : "out of head-pats for today — finish a task to keep growing it";
                  })()}
                </p>

                <div style={{ marginTop: 36, width: "100%", maxWidth: 420 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: "#CFD1DA" }}>
                      spark catch
                    </span>
                    <span style={{ fontSize: 12, color: "#6E7080" }}>
                      best: {companionHighScore} {gameRunning ? `· now: ${sessionScore}` : ""}
                    </span>
                  </div>

                  {!gameRunning ? (
                    <button
                      onClick={startGame}
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: 12,
                        border: "1px solid rgba(247,201,120,0.4)",
                        background: "rgba(247,201,120,0.1)",
                        color: "#F7C978",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      bored? tap to play — 20 seconds of catching sparks
                    </button>
                  ) : (
                    <div
                      ref={gameAreaRef}
                      style={{
                        position: "relative",
                        width: "100%",
                        height: 220,
                        borderRadius: 16,
                        background: "rgba(255,255,255,0.03)",
                        overflow: "hidden",
                      }}
                    >
                      {sparks.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => popSpark(s.id)}
                          aria-label="Catch spark"
                          style={{
                            position: "absolute",
                            left: `${s.x}%`,
                            top: `${s.y}%`,
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            border: "none",
                            cursor: "pointer",
                            background: "radial-gradient(circle at 35% 30%, #F7C978, #F2A65A)",
                            boxShadow: "0 0 14px rgba(247,201,120,0.6)",
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {gameRunning && (
                    <button
                      onClick={endGame}
                      style={{
                        marginTop: 10,
                        width: "100%",
                        padding: "10px",
                        borderRadius: 10,
                        border: "none",
                        background: "rgba(255,255,255,0.05)",
                        color: "#8B8D99",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      done for now
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </>
      )}

      {tab === "scene" && (
        <>
          <p style={{ fontSize: 13, color: "#8B8D99", marginTop: 24, marginBottom: 20, textAlign: "center" }}>
            everyone you've raised so far, together — tap one to make it the active companion
          </p>

          <div
            style={{
              width: "100%",
              maxWidth: 460,
              borderRadius: 20,
              overflow: "hidden",
              background: "linear-gradient(180deg, #1A1D2B 0%, #262A3D 55%, #2E2519 55%, #23200f 100%)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* sky zone */}
            <div
              style={{
                minHeight: 130,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-evenly",
                paddingBottom: 14,
                paddingTop: 18,
              }}
            >
              {SPECIES.filter((s) => s.zone === "sky").map((sp) => {
                const spPoints = companionData[sp.id] || 0;
                const spIdx = stageIndexFor(spPoints);
                const isActive = sp.id === activeSpecies;
                return (
                  <button
                    key={sp.id}
                    onClick={() => setActiveSpecies(sp.id)}
                    aria-label={`Select ${sp.label}`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      opacity: isActive ? 1 : 0.75,
                    }}
                  >
                    <span
                      className={sp.id === "star" ? "bd-twinkle" : "bd-drift"}
                      style={{ fontSize: STAGE_SIZES[spIdx] * 0.6 + 16 }}
                    >
                      {sp.emojis[spIdx]}
                    </span>
                    {isActive && (
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#F7C978" }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* horizon line */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

            {/* ground zone */}
            <div
              style={{
                minHeight: 110,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-evenly",
                paddingTop: 14,
                paddingBottom: 10,
              }}
            >
              {SPECIES.filter((s) => s.zone === "ground").map((sp) => {
                const spPoints = companionData[sp.id] || 0;
                const spIdx = stageIndexFor(spPoints);
                const isActive = sp.id === activeSpecies;
                const size = STAGE_SIZES[spIdx];
                return (
                  <button
                    key={sp.id}
                    onClick={() => setActiveSpecies(sp.id)}
                    aria-label={`Select ${sp.label}`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      opacity: isActive ? 1 : 0.75,
                    }}
                  >
                    {sp.kind === "shape" ? (
                      <div
                        style={{
                          width: size,
                          height: size,
                          borderRadius: "50%",
                          background: `radial-gradient(circle at 35% 30%, ${sp.colors[spIdx]}, ${sp.colors[spIdx]}99)`,
                          boxShadow: `0 0 20px ${sp.colors[spIdx]}55`,
                        }}
                      />
                    ) : (
                      <span className="bd-bob" style={{ fontSize: size * 0.7 + 10 }}>
                        {sp.emojis[spIdx]}
                      </span>
                    )}
                    {isActive && (
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#F7C978" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 460 }}>
            {SPECIES.map((sp) => (
              <span key={sp.id} style={{ fontSize: 12, color: "#6E7080" }}>
                {sp.label}: {sp.stageNames[stageIndexFor(companionData[sp.id] || 0)]}
              </span>
            ))}
          </div>
        </>
      )}

      {tab === "achievements" && (
        <>
          {(() => {
            const stats = { tasksCompleted, notesSaved, pets, companionData, highScore: companionHighScore };
            const unlockedCount = ACHIEVEMENTS.filter((a) => a.check(stats)).length;
            return (
              <>
                <p style={{ fontSize: 13, color: "#8B8D99", marginTop: 24, marginBottom: 4, textAlign: "center" }}>
                  {unlockedCount} of {ACHIEVEMENTS.length} unlocked
                </p>
                <div
                  style={{
                    marginTop: 16,
                    width: "100%",
                    maxWidth: 460,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  {ACHIEVEMENTS.map((a) => {
                    const done = a.check(stats);
                    return (
                      <div
                        key={a.id}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 12,
                          background: done ? "rgba(217,168,229,0.1)" : "rgba(255,255,255,0.03)",
                          border: done ? "1px solid rgba(217,168,229,0.35)" : "1px solid transparent",
                          opacity: done ? 1 : 0.55,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          {done ? <Trophy size={14} color="#D9A8E5" /> : <Lock size={12} color="#6E7080" />}
                          <span style={{ fontSize: 13, fontWeight: 600, color: done ? "#E8E6E1" : "#8B8D99" }}>
                            {a.label}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: "#6E7080" }}>{a.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
