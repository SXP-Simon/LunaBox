// Development-only fixture. The browser test intercepts the service modules;
// no fixture data or mock bridge is included in the production application.
import React from "react";
import { createRoot } from "react-dom/client";
import { vo } from "../src/bindings/models";
import { TemplateExportModal } from "../src/components/modal/TemplateExportModal";
import i18n from "../src/i18n";
import "@unocss/reset/tailwind.css";
import "virtual:uno.css";

await i18n.changeLanguage("zh-CN");
const stats = new vo.PeriodStats({
  start_date: "2026-01-01",
  end_date: "2026-10-19",
  total_games_count: 120,
});
function Harness() {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open export
      </button>
      <TemplateExportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        stats={stats}
        aiSummary="IGNORED_AI_SUMMARY"
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
