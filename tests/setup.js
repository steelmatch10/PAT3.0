// Load app.js functions into global scope for tests
const appExports = require("../assets/app.js");
Object.assign(global, appExports);
