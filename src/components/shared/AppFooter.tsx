import { Link } from 'react-router-dom';

const SUPPORT_EMAIL = 'hi@bleup.app';

export function AppFooter() {
  return (
    <footer className="pt-8 border-t border-border/40 text-center space-y-4">
      <nav className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
        <Link to="/about" className="hover:text-foreground transition-colors">
          About
        </Link>
        <span className="text-border">&middot;</span>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="hover:text-foreground transition-colors"
        >
          Support
        </a>
        <span className="text-border">&middot;</span>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="hover:text-foreground transition-colors"
        >
          Report issue
        </a>
      </nav>
      <p className="text-xs text-muted-foreground/70">
        Built with curiosity. Share what works.
      </p>
    </footer>
  );
}
