// This directive is mandatory for Next.js components that use client-side features (like hooks and browser APIs)
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import type { Auth } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection,
  query,
  limit,
  getDoc,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

// --- FIXED: Using relative path instead of absolute path alias (@/) ---
// This assumes 'src/firebase/config.ts' is correctly located relative to 'src/app/page.tsx'
import { firebaseConfig as actualFirebaseConfig } from "../firebase/config";

// --- Configuration Variables ---
const appId = actualFirebaseConfig.projectId; // Using Project ID as the app ID for the database path
const firebaseConfig = actualFirebaseConfig;
// We don't use the custom token in a standard Next.js environment
const initialAuthToken = null;
// ---------------------------------------------------

// Constants for the game
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;
const GRAVITY = 0.5;
const BALL_RADIUS = 15;
const HOOP_X = CANVAS_WIDTH - 100;
const HOOP_Y = CANVAS_HEIGHT - 100;
const useFirebase = () => {
  const [db, setDb] = useState<Firestore | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // This state is CRUCIAL for the Next.js hydration fix.
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  useEffect(() => {
    // Check if running in browser (client-side)
    if (typeof window === "undefined") return;

    try {
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          // A user is already signed in (or sign-in just succeeded)
          setUserId(user.uid);
          setIsAuthReady(true);
        } else if (!initialAuthToken) {
          // If no user is logged in, try to sign in anonymously
          try {
            const anonymousUser = await signInAnonymously(firebaseAuth);
            setUserId(anonymousUser.user.uid);
          } catch (error) {
            console.error(
              "Anonymous sign-in failed. Please ensure AUTHENTICATION > Anonymous is ENABLED in Firebase Console.",
              error
            );
          } finally {
            // Set ready regardless of success to avoid infinite loading
            setIsAuthReady(true);
          }
        } else {
          // For environments that use initialAuthToken (like Canvas)
          setIsAuthReady(true);
        }
      });

      return () => unsubscribe();
    } catch (e) {
      console.error(
        "Firebase initialization failed. Check your config in src/firebase/config.ts.",
        e
      );
      setIsAuthReady(true); // Fail-safe
    }
  }, []);

  return { db, auth, userId, isAuthReady };
};

// Component for the Scoreboard
interface LeaderboardProps {
  db: Firestore | null;
  appId: string;
}

interface ScoreEntry {
  id: string;
  score: number;
  playerName?: string;
  userId?: string;
  timestamp?: string;
}

const Leaderboard = ({ db, appId }: LeaderboardProps) => {
  const [highScores, setHighScores] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !appId) return;

    // Public collection path: /artifacts/{appId}/public/data/basketball_scores
    const path = `/artifacts/${appId}/public/data/basketball_scores`;
    const q = query(collection(db, path), limit(10));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const scores = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as ScoreEntry))
          .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
          .reverse();

        setHighScores(scores);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching leaderboard:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, appId]);

  return (
    <div className="w-full md:w-1/3 p-4 bg-white/10 rounded-xl shadow-xl backdrop-blur-sm">
      <h2 className="text-2xl font-bold mb-4 text-yellow-300 border-b pb-2">
        Global Leaderboard
      </h2>
      {loading ? (
        <p className="text-gray-300">Loading scores...</p>
      ) : (
        <ol className="space-y-2">
          {highScores.map((entry, index) => (
            <li
              key={entry.id}
              className="flex justify-between items-center text-lg text-gray-100"
            >
              <span className="font-mono w-6 text-center text-purple-300">
                {index + 1}.
              </span>
              <span className="truncate flex-1 ml-2 font-semibold">
                {entry.playerName || `Player ${entry.id.substring(0, 5)}`}
              </span>
              <span className="text-yellow-400 font-extrabold">
                {entry.score}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

// Main Game Component
interface BasketballCanvasProps {
  db: Firestore | null;
  userId: string | null;
  isAuthReady: boolean;
  appId: string;
}

const BasketballCanvas: React.FC<BasketballCanvasProps> = ({
  db,
  userId,
  isAuthReady,
  appId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState("Click or tap and drag to shoot!");
  const [gameState, setGameState] = useState("idle"); // idle, aiming, shooting

  const ball = useRef({ x: 100, y: HOOP_Y, vx: 0, vy: 0, inMotion: false });
  const mouse = useRef({ startX: 0, startY: 0, currentX: 0, currentY: 0 });

  // Function to save the score to Firestore
  // const saveHighScore = useCallback(
  //   async (newScore: number) => {
  //     if (!db || !userId) {
  //       setMessage("Error: Not connected or signed in. Cannot save score.");
  //       return;
  //     }

  //     const path = `/artifacts/${appId}/public/data/basketball_scores`;
  //     const docRef = doc(collection(db, path), userId);

  //     try {
  //       await setDoc(
  //         docRef,
  //         {
  //           userId: userId,
  //           score: newScore,
  //           playerName: `Player ${userId.substring(0, 5)}`,
  //           timestamp: new Date().toISOString(),
  //         },
  //         { merge: true }
  //       );
  //       console.log("Score saved successfully!");
  //       setMessage(`New high score posted! Score: ${newScore}`);
  //     } catch (e) {
  //       // Crucial for debugging: log the actual error details
  //       console.error("Error saving score (Permission Denied likely):", e);
  //       setMessage("Error saving score. Check console and Firebase Rules.");
  //     }
  //   },
  //   [db, userId, appId]
  // );
  const saveHighScore = useCallback(
    async (newScore: number) => {
      // 1. Authentication Safety Check
      if (!db || !userId) {
        console.warn(
          "Attempted to save score before user was fully authenticated."
        );
        setMessage("Connecting to save score...");
        return;
      }

      const path = `/artifacts/${appId}/public/data/basketball_scores`;
      // Use the userId as the document ID so each user only has one entry
      const docRef = doc(collection(db, path), userId);

      try {
        // 2. READ: Get the current high score from the database (REQUIRES getDoc)
        const docSnap = await getDoc(docRef);
        const existingScore = docSnap.exists() ? docSnap.data().score : 0;

        // 3. CHECK: ONLY proceed if the new score is strictly greater than the existing score
        if (newScore > existingScore) {
          // 4. WRITE: Attempt to save the new high score
          await setDoc(
            docRef,
            {
              userId: userId,
              score: newScore,
              playerName: `Player ${userId.substring(0, 5)}`, // Simple name for display
              timestamp: new Date().toISOString(),
            },
            { merge: true }
          );

          console.log("New high score saved successfully!");
          setMessage(`NEW HIGH SCORE! Score: ${newScore}`);
        } else {
          // This prevents unnecessary write operations that would fail the security rule
          console.log(
            `Current score (${newScore}) is not a high score (Existing: ${existingScore}). Not saving.`
          );
        }
      } catch (e) {
        // The error likely originated from the Firestore rule check OR connectivity issue
        console.error("Error saving score:", e);
        setMessage(
          "Error saving score. Check console and Firebase Rules (or Authentication)."
        );
      }
    },
    [db, userId, appId]
  );

  // Game Drawing Logic (drawGame remains the same)
  const drawGame = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const b = ball.current;

      // 1. Clear canvas and set background
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#0a2342"; // Dark Blue court
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 2. Draw the Basketball Hoop (Backboard and Rim)
      const rimWidth = 40;
      const backboardHeight = 50;
      const backboardWidth = 5;
      const rimThickness = 5;

      // Backboard (Red/White)
      ctx.fillStyle = "#c53030"; // Red
      ctx.fillRect(
        HOOP_X + rimWidth / 2,
        HOOP_Y - backboardHeight,
        backboardWidth,
        backboardHeight
      );

      // Rim (Orange) - front part
      ctx.fillStyle = "#f6ad55"; // Orange
      ctx.beginPath();
      ctx.arc(
        HOOP_X + rimWidth / 2,
        HOOP_Y,
        rimWidth / 2 + rimThickness,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Hole in the rim
      ctx.fillStyle = "#0a2342"; // Match background
      ctx.beginPath();
      ctx.arc(HOOP_X + rimWidth / 2, HOOP_Y, rimWidth / 2, 0, Math.PI * 2);
      ctx.fill();

      // 3. Draw the Ball
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#e4780a"; // Orange
      ctx.fill();
      ctx.strokeStyle = "#2d2d2d"; // Black lines
      ctx.lineWidth = 2;
      ctx.stroke();

      // 4. Draw aiming line if aiming
      if (gameState === "aiming") {
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.moveTo(b.x, b.y);
        const dx = mouse.current.currentX - mouse.current.startX;
        const dy = mouse.current.currentY - mouse.current.startY;
        const lineEndX = b.x - dx * 2;
        const lineEndY = b.y - dy * 2;

        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.lineWidth = 3;
        ctx.lineTo(lineEndX, lineEndY);
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
      }
    },
    [gameState]
  );

  // Game Physics Update Logic (updateGame remains the same)
  const updateGame = useCallback(() => {
    const b = ball.current;

    if (b.inMotion) {
      // Apply gravity to vertical velocity
      b.vy += GRAVITY;

      // Update position
      b.x += b.vx;
      b.y += b.vy;

      // Check for scoring (Simple collision logic for a successful shot)
      const rimLeft = HOOP_X;
      const rimRight = HOOP_X + 40;
      const hoopTop = HOOP_Y - 5;
      const hoopBottom = HOOP_Y + 5;

      const justScored =
        b.x > rimLeft && b.x < rimRight && b.y > hoopTop && b.y < hoopBottom;

      if (justScored) {
        setScore((prevScore) => {
          const newScore = prevScore + 2;
          setMessage(`SWISH! Score: ${newScore}`);
          b.inMotion = false;
          b.x = 100;
          b.y = HOOP_Y;
          b.vx = 0;
          b.vy = 0;

          saveHighScore(newScore);
          return newScore;
        });
      }

      // Check for wall/floor collision
      if (b.y + BALL_RADIUS > CANVAS_HEIGHT) {
        // Floor collision
        b.y = CANVAS_HEIGHT - BALL_RADIUS;
        b.vy *= -0.7; // Bounce with energy loss
        b.vx *= 0.9; // Horizontal friction
        if (Math.abs(b.vy) < 1 && Math.abs(b.vx) < 1) {
          b.inMotion = false;
          b.x = 100;
          b.y = HOOP_Y;
          setMessage("Missed shot! Try again.");
        }
      }

      if (b.x + BALL_RADIUS > CANVAS_WIDTH || b.x - BALL_RADIUS < 0) {
        // Side wall collision
        b.vx *= -0.7;
      }
    }
  }, [saveHighScore]);

  // Game Loop (useEffect remains the same)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let animationFrameId: number | undefined;

    const gameLoop = () => {
      updateGame();
      if (ctx) {
        drawGame(ctx);
      }
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [drawGame, updateGame]);

  // Mouse/Touch Handlers (all remain the same)
  const handleStart = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    if (ball.current.inMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX =
      "touches" in e
        ? e.touches[0].clientX
        : (e as React.MouseEvent<HTMLCanvasElement>).clientX;
    const clientY =
      "touches" in e
        ? e.touches[0].clientY
        : (e as React.MouseEvent<HTMLCanvasElement>).clientY;

    mouse.current.startX = clientX - rect.left;
    mouse.current.startY = clientY - rect.top;
    mouse.current.currentX = mouse.current.startX;
    mouse.current.currentY = mouse.current.startY;

    setGameState("aiming");
    setMessage("Dragging...");
  };

  const handleMove = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    if (gameState !== "aiming") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX =
      "touches" in e
        ? e.touches[0].clientX
        : (e as React.MouseEvent<HTMLCanvasElement>).clientX;
    const clientY =
      "touches" in e
        ? e.touches[0].clientY
        : (e as React.MouseEvent<HTMLCanvasElement>).clientY;

    mouse.current.currentX = clientX - rect.left;
    mouse.current.currentY = clientY - rect.top;
  };

  const handleEnd = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    if (gameState !== "aiming") return;

    setGameState("shooting");
    setMessage("Shot fired!");

    // Calculate shot vector based on drag difference
    const dx = mouse.current.currentX - mouse.current.startX;
    const dy = mouse.current.currentY - mouse.current.startY;

    // Launch speed is proportional to the drag distance
    // Shot direction is opposite of the drag direction
    ball.current.vx = -dx / 10;
    ball.current.vy = -dy / 10;
    ball.current.inMotion = true;
  };

  const handleReset = () => {
    setScore(0);
    ball.current = { x: 100, y: HOOP_Y, vx: 0, vy: 0, inMotion: false };
    setGameState("idle");
    setMessage("Game Reset. Click or tap and drag to shoot!");
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-extrabold text-white mb-4 shadow-text">
        Canvas Hoop Shot
      </h1>
      <div className="text-xl font-mono mb-3 text-yellow-300">
        Current Score: <span className="text-4xl font-black">{score}</span>
      </div>

      <div className="w-full max-w-[600px] bg-gray-800 rounded-xl overflow-hidden shadow-2xl mb-4">
        {/* The Game Canvas */}
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-auto cursor-pointer border-4 border-gray-700 rounded-lg"
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center w-full max-w-[600px] space-y-3 sm:space-y-0 sm:space-x-4 mb-4">
        <button
          onClick={handleReset}
          className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg transition duration-200 transform hover:scale-105"
        >
          Reset Score
        </button>
        <div
          className={`p-3 w-full sm:w-auto text-center font-semibold rounded-lg shadow-inner 
            ${
              message.includes("SWISH")
                ? "bg-green-700 text-green-200"
                : "bg-gray-700 text-gray-300"
            }`}
        >
          {message}
        </div>
      </div>

      {/* Firebase Status and User ID */}
      <div className="text-xs text-gray-400 mt-2 text-center w-full max-w-[600px] p-2 bg-gray-800/50 rounded-lg">
        {isAuthReady
          ? `Status: Connected. User ID: ${userId}`
          : "Connecting to Firebase..."}
      </div>

      {/* Leaderboard Section */}
      <Leaderboard db={db} appId={appId} />
    </div>
  );
};

// Main App Component with full layout
const Home = () => {
  const { db, userId, isAuthReady } = useFirebase();

  return (
    <div className="min-h-screen bg-gray-900 font-sans text-white p-4 flex justify-center items-start pt-10">
      <div className="flex flex-col w-full max-w-4xl space-y-8 items-center">
        {/* --- HYDRATION FIX: Only render the game when authentication is ready --- */}
        {!isAuthReady ? (
          <div className="text-xl p-8 bg-gray-800 rounded-xl shadow-lg">
            Connecting to Firebase and signing in...
          </div>
        ) : (
          // If auth fails, userId will be null, but isAuthReady will be true.
          // The component will render, and the saveHighScore function will fail gracefully.
          <BasketballCanvas
            db={db}
            userId={userId}
            isAuthReady={isAuthReady}
            appId={appId}
          />
        )}
      </div>
    </div>
  );
};

export default Home;
