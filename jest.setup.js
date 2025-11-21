import "@testing-library/jest-dom";
import "whatwg-fetch"; // <--- This is the magic line that fixes Firebase

// Mock TextEncoder (Node.js environment sometimes misses this too)
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
