import helper from "./helper.js";

class App {
    start() {
        helper();
    }
}

function runApp() {
    console.log("Running app");
}

const calculate = (a, b) => {
    return a + b;
};