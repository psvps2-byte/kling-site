import uk from "@/app/messages/uk.json";
import en from "@/app/messages/en.json";

export type Lang = "uk" | "en";

export function getLang(): Lang {
  if (typeof window === "undefined") return "uk";
  const saved = window.localStorage.getItem("lang");
  return saved === "en" ? "en" : "uk";
}

export function setLang(lang: Lang) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("lang", lang);
}

export function t(lang: Lang) {
  return lang === "en" ? (en as any) : (uk as any);
}