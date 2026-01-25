"use client";

import React from "react";
import type { Aspect } from "../types";

export default function RatioSelect({
  value,
  onChange,
  lang,
}: {
  value: Aspect;
  onChange: (v: Aspect) => void;
  lang: string;
}) {
  return (
    <div className="vPill" style={{ alignItems: "center" }}>
      <span style={{ opacity: 0.75, marginRight: 8 }}>{lang === "uk" ? "Формат" : "Ratio"}</span>
      <select
        className="vSelect"
        value={value}
        onChange={(e) => onChange(e.target.value as Aspect)}
        aria-label={lang === "uk" ? "Вибір формату" : "Choose ratio"}
      >
        <option value="1:1">1:1</option>
        <option value="9:16">9:16</option>
        <option value="16:9">16:9</option>
      </select>
    </div>
  );
}
