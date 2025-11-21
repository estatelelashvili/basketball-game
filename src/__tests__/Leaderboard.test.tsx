import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Leaderboard } from "../app/page"; // Ensure Leaderboard is exported in page.tsx

// --- 1. THE MOCK SETUP ---
// We need to store the callback function that 'onSnapshot' receives
// so we can trigger it manually to simulate data arriving.
let snapshotCallback: Function;

jest.mock("firebase/firestore", () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  limit: jest.fn(),
  // When the component calls onSnapshot, we capture the callback (cb)
  // and return a dummy unsubscribe function.
  onSnapshot: jest.fn((query, cb) => {
    snapshotCallback = cb;
    return jest.fn(); // returns dummy unsubscribe
  }),
}));

describe("Leaderboard Component", () => {
  const mockDb = {} as any;
  const appId = "test-app";

  // Reset mocks before each test so previous tests don't interfere
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders loading state initially", () => {
    render(<Leaderboard db={mockDb} appId={appId} />);
    expect(screen.getByText(/Loading scores.../i)).toBeInTheDocument();
  });

  test("renders player scores after data arrives", async () => {
    render(<Leaderboard db={mockDb} appId={appId} />);

    // 1. Verify it starts loading
    expect(screen.getByText(/Loading scores.../i)).toBeInTheDocument();

    // 2. ACT: Simulate Firebase returning data
    // We manually call the callback that the component registered
    const mockData = {
      docs: [
        { id: "1", data: () => ({ score: 100, playerName: "Jordan" }) },
        { id: "2", data: () => ({ score: 90, playerName: "LeBron" }) },
      ],
    };

    // We wrap this in 'act' automatically by using waitFor or just calling it.
    // Since we are outside the component, calling the callback triggers a state update.
    // React Testing Library handles the 'act' warning usually, but let's see.
    React.act(() => {
      snapshotCallback(mockData);
    });

    // 3. ASSERT: Wait for the UI to update
    // 'waitFor' retries the assertion until it passes or times out
    await waitFor(() => {
      expect(screen.queryByText(/Loading scores.../i)).not.toBeInTheDocument();
    });

    // Check if players are on screen
    expect(screen.getByText("Jordan")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("LeBron")).toBeInTheDocument();
  });
});
