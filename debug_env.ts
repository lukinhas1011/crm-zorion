import dotenv from 'dotenv';
dotenv.config();

console.log("--- ENV VAR DEBUG ---");
console.log("GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
if (process.env.GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY length:", process.env.GEMINI_API_KEY.length);
    console.log("GEMINI_API_KEY first 4 chars:", process.env.GEMINI_API_KEY.substring(0, 4));
}
console.log("API_KEY exists:", !!process.env.API_KEY);
if (process.env.API_KEY) {
    console.log("API_KEY length:", process.env.API_KEY.length);
    console.log("API_KEY first 4 chars:", process.env.API_KEY.substring(0, 4));
}
console.log("--- END DEBUG ---");
