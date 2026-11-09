import { CircleHelp } from "lucide-react";

interface PlaceholderPanelProps {
  title: string;
  onBack: () => void;
}

function PlaceholderPanel({
  title,
  onBack,
}: PlaceholderPanelProps) {
  return (
    <section className="panel placeholder-panel">
      <div className="placeholder-icon">
        <CircleHelp size={30} />
      </div>

      <h2>{title}</h2>

      <p>
        Esta sección forma parte de la arquitectura de Remote Support 365.
        Su funcionalidad se implementará en las siguientes etapas.
      </p>

      <button className="secondary-button" onClick={onBack}>
        Volver al Dashboard
      </button>
    </section>
  );
}

export default PlaceholderPanel;
