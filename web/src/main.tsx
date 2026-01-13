import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Board from "./pages/Board";
import OkrDetail from "./pages/OkrDetail";
import NewOkr from "./pages/NewOkr";
import { ToastProvider } from "./components/Toast";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Board />} />
          <Route path="/okr/:okrId" element={<OkrDetail />} />
          <Route path="/okr/new" element={<NewOkr />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>
);
