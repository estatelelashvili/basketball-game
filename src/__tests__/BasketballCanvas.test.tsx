import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
// 1. Import the REAL component (Make sure you added 'export' to it in page.tsx!)
import { BasketballCanvas } from "../app/page";

// 2. Mock Firebase (Essential so the internal Leaderboard doesn't crash)
jest.mock("firebase/firestore", () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  limit: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()), // Return dummy unsubscribe function
  getDoc: jest.fn(),
  setDoc: jest.fn(),
}));

// 3. Mock the Canvas API (Jest cannot draw on canvas)
HTMLCanvasElement.prototype.getContext = jest.fn(() => {
  return {
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    setLineDash: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    save: jest.fn(),
    restore: jest.fn(),
  } as unknown as CanvasRenderingContext2D;
}) as any;

describe("BasketballCanvas Game UI", () => {
  const mockProps = {
    db: null,
    userId: "test-user-123",
    isAuthReady: true,
    appId: "test-app",
  };

  // 4. REMOVED '.skip' here
  test("renders the initial score as 0", () => {
    render(<BasketballCanvas {...mockProps} />);

    const scoreText = screen.getByText(/Current Score:/i);
    const scoreValue = screen.getByText("0");

    expect(scoreText).toBeInTheDocument();
    expect(scoreValue).toBeInTheDocument();
  });

  // 5. REMOVED '.skip' here
  test("reset button resets the game state", () => {
    render(<BasketballCanvas {...mockProps} />);

    const resetButton = screen.getByRole("button", { name: /reset score/i });
    expect(resetButton).toBeInTheDocument();

    fireEvent.click(resetButton);

    // Check if the message updates to the reset message
    expect(screen.getByText(/Game Reset/i)).toBeInTheDocument();
  });
});
