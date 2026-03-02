console.log("--- ENV VAR KEYS ---");
Object.keys(process.env).forEach(key => {
    if (key.includes("API") || key.includes("KEY") || key.includes("GEMINI")) {
        console.log(key);
    }
});
console.log("--- END KEYS ---");
