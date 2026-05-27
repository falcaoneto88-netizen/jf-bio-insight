import { Link } from "@tanstack/react-router";

export function BrandHeader() {
  return (
    <header className="border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-3 group">
          <span className="grid h-9 w-9 place-content-center rounded-sm border border-gold text-gold font-serif text-base tracking-tight transition-colors group-hover:bg-gold group-hover:text-gold-foreground">
            JF
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-serif text-base text-foreground">JF BioReport</span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Clinical Reports
            </span>
          </span>
        </Link>
        <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground sm:block">
          Premium Bioimpedance
        </span>
      </div>
    </header>
  );
}
