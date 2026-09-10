import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchGhlContact } from "@/lib/ghl.functions";

type GhlContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

type Props = {
  onSelect: (contact: GhlContact) => void;
};

export function GhlContactSearch({ onSelect }: Props) {
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GhlContact[] | null>(null);

  const handleSearch = async () => {
    const query = term.trim();
    if (!query) return;
    setLoading(true);
    try {
      const { contacts } = await searchGhlContact({ data: { query } });
      setResults(contacts);
      if (contacts.length === 0) toast.info("Nenhum contacto encontrado.");
    } catch (err) {
      const description = err instanceof Error ? err.message : undefined;
      toast.error("Não foi possível procurar contactos", { description });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sm:col-span-2 space-y-3 rounded-sm border border-border/70 bg-muted/20 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Procurar contacto no GoHighLevel
      </p>
      <div className="flex gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSearch();
            }
          }}
          placeholder="Nome, email ou telefone"
        />
        <Button type="button" variant="outline" onClick={() => void handleSearch()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Search />}
          Procurar
        </Button>
      </div>

      {results && results.length > 0 ? (
        <ul className="divide-y divide-border/60 rounded-sm border border-border/60 bg-background">
          {results.map((contact) => (
            <li key={contact.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {contact.name || "Sem nome"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[contact.email, contact.phone].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onSelect(contact);
                  setResults(null);
                  toast.success("Dados preenchidos a partir do GoHighLevel");
                }}
              >
                Usar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
