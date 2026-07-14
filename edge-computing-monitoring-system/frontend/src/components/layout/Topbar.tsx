import {
  Activity,
  Camera,
  Cpu,
  PanelLeft,
  Send,
} from "lucide-react";
import "./TopBar.css";

type TopbarProps = {
  pageTitle: string;
  onToggleSidebar?: () => void;
};

export function Topbar({ pageTitle, onToggleSidebar }: TopbarProps) {
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
      </div>
    </header>
  );
}
