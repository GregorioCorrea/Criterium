import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Board from "./pages/Board";
import OkrDetail from "./pages/OkrDetail";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Board />} />
        <Route path="/okr/:okrId" element={<OkrDetail />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
