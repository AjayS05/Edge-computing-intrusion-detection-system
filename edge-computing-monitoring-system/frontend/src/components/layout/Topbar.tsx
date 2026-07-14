import { useEffect, useState } from "react";
import {
  Activity,
  Camera,
  Cpu,
  Moon,
  PanelLeft,
  RefreshCcw,
  Send,
  Sun,
} from "lucide-react";
import "./Topbar.css";

type Theme = "light" | "dark";

type TopbarProps = {
  pageTitle: string;
  onToggleSidebar?: () => void;
};

function getInitialTheme(): Theme {
  const savedTheme = localStorage.getItem("edge-sentinel-theme");

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return document.documentElement.dataset.theme === "light"
    ? "light"
    : "dark";
}

export function Topbar({ pageTitle, onToggleSidebar }: TopbarProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("edge-sentinel-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((currentTheme) =>
      currentTheme === "dark" ? "light" : "dark",
    );
  }

  function refreshBackendData() {
    window.location.reload();
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-menu-button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <PanelLeft size={18} />
        </button>

        <div className="topbar-title-group">
          <p>EDGE-SENTINEL / PROD</p>
          <h1>{pageTitle}</h1>
        </div>
      </div>

      <div className="topbar-status">
        <div className="topbar-status-pill success">
          <Activity size={16} />
          <span>API</span>
          <strong>200 OK</strong>
        </div>

        <div className="topbar-status-pill success">
          <Camera size={16} />
          <span>STREAMS</span>
          <strong>3/3</strong>
        </div>

        <div className="topbar-status-pill warning">
          <Cpu size={16} />
          <span>CLUSTER</span>
          <strong>5/6</strong>
        </div>

        <div className="topbar-status-pill success">
          <Send size={16} />
          <span>TELEGRAM</span>
          <strong>online</strong>
        </div>

        <button
          type="button"
          className="topbar-icon-button"
          onClick={refreshBackendData}
          aria-label="Refresh backend data"
          title="Refresh backend data"
        >
          <RefreshCcw size={17} />
        </button>

        <button
          type="button"
          className="topbar-icon-button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
}
