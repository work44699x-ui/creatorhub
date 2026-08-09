import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

window.onerror = function (msg, url, line, col, error) {
  document.getElementById("root").innerHTML =
    "<pre style='color:red;padding:20px;white-space:pre-wrap;'>" +
    "ERROR: " + msg + "\nLine: " + line + "\n" + (error && error.stack ? error.stack : "") +
    "</pre>";
};
window.onunhandledrejection = function (event) {
  document.getElementById("root").innerHTML =
    "<pre style='color:red;padding:20px;white-space:pre-wrap;'>" +
    "PROMISE ERROR: " + (event.reason && event.reason.message ? event.reason.message : event.reason) +
    "</pre>";
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
