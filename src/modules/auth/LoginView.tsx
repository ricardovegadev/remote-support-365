import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Headset,
  Loader2,
  Lock,
  Mail,
  MonitorCheck,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "./AuthContext";

function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Las credenciales ingresadas no son válidas. Verifica tu correo y contraseña.";
  }
  if (normalized.includes("email not confirmed")) {
    return "La dirección de correo electrónico aún no ha sido confirmada.";
  }
  if (normalized.includes("too many requests") || normalized.includes("rate limit")) {
    return "Se han realizado demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
  }
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "No fue posible conectar con el servidor de autenticación. Comprueba tu conexión de red.";
  }

  return message || "No se pudo iniciar sesión. Inténtalo nuevamente.";
}

function LoginView() {
  const { signInWithPassword, isConfigured } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setErrorMessage("Ingresa tu correo electrónico corporativo.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage("Ingresa un formato de correo electrónico válido.");
      return;
    }

    if (!password) {
      setErrorMessage("Ingresa tu contraseña.");
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await signInWithPassword(trimmedEmail, password);
      if (error) {
        setErrorMessage(translateAuthError(error.message));
      }
    } catch {
      setErrorMessage("Ocurrió un error inesperado al procesar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-layout">
      <section className="auth-showcase" aria-hidden="true">
        <div className="auth-showcase-inner">
          <div className="brand auth-brand">
            <div className="brand-symbol">
              <Headset size={23} />
            </div>

            <div className="brand-copy">
              <strong>REMOTE SUPPORT</strong>
              <span>365 · PROFESSIONAL</span>
            </div>
          </div>

          <div className="eyebrow auth-eyebrow">
            <span className="live-dot" />
            PLATAFORMA MULTIEMPRESA DE SOPORTE REMOTO
          </div>

          <h1>Centro de operaciones y asistencia técnica segura.</h1>

          <p>
            Supervisa tickets, coordina equipos de soporte y gestiona sesiones
            remotas auditadas bajo control de acceso por organización.
          </p>

          <div className="auth-highlights">
            <div className="auth-highlight-card">
              <div className="operation-icon blue">
                <ShieldCheck size={18} />
              </div>
              <div>
                <strong>Aislamiento multiempresa</strong>
                <span>
                  Acceso gobernado por políticas Row Level Security (RLS) y
                  roles verificados en base de datos.
                </span>
              </div>
            </div>

            <div className="auth-highlight-card">
              <div className="operation-icon green">
                <MonitorCheck size={18} />
              </div>
              <div>
                <strong>Trazabilidad operativa</strong>
                <span>
                  Registro auditable de tickets, asignaciones, consentimientos y
                  sesiones de soporte.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="auth-form-panel">
        <div className="auth-card panel">
          <div className="auth-card-header">
            <div className="brand auth-mobile-brand">
              <div className="brand-symbol">
                <Headset size={21} />
              </div>
              <div className="brand-copy">
                <strong>REMOTE SUPPORT</strong>
                <span>365 · PROFESSIONAL</span>
              </div>
            </div>

            <span className="auth-kicker">ACCESO A LA CONSOLA</span>
            <h2>Iniciar sesión</h2>
            <p>
              Ingresa con las credenciales autorizadas de tu organización para
              acceder al panel.
            </p>
          </div>

          {!isConfigured && (
            <div className="auth-alert auth-alert-warning" role="alert">
              <AlertCircle size={17} />
              <div>
                <strong>Configuración de entorno pendiente</strong>
                <span>
                  Define las variables <code>VITE_SUPABASE_URL</code> y{" "}
                  <code>VITE_SUPABASE_ANON_KEY</code> en tu entorno local para
                  habilitar la autenticación.
                </span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="auth-alert auth-alert-error" role="alert">
              <AlertCircle size={17} />
              <span>{errorMessage}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="auth-email">Correo electrónico</label>
              <div className="auth-input-wrapper">
                <Mail size={16} className="auth-input-icon" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  placeholder="usuario@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Contraseña</label>
              <div className="auth-input-wrapper">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  disabled={submitting}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="primary-button auth-submit-button"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={17} className="auth-spinner" />
                  Verificando credenciales...
                </>
              ) : (
                "Acceder al panel"
              )}
            </button>
          </form>

          <div className="auth-footer-note">
            <ShieldCheck size={15} />
            <span>
              Acceso restringido a usuarios autorizados. El alta de cuentas se
              gestiona mediante invitación organizacional.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default LoginView;
