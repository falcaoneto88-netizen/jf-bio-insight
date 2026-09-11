import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  signedIn: boolean;
  /** Caminho para onde regressar depois de iniciar sessão. */
  proximo?: string;
  /** Frase curta a explicar o que fica indisponível. */
  descricao?: string;
};

/**
 * Aviso explícito de acesso restrito. Substitui falhas silenciosas
 * quando não há sessão iniciada ou a conta não é administradora.
 */
export function AccessNotice({ signedIn, proximo, descricao }: Props) {
  return (
    <Card className="border-border/70">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="rounded-full border border-border/70 p-3">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-serif text-xl text-foreground">
            {signedIn ? "Conta sem permissão clínica" : "Sessão necessária"}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {descricao ??
              (signedIn
                ? "Esta conta não tem permissão para aceder a dados clínicos. Peça acesso ao responsável da clínica."
                : "Inicie sessão com a conta da clínica para aceder a esta área.")}
          </p>
        </div>
        {!signedIn && (
          <Button asChild>
            <Link to="/auth" search={{ proximo: proximo ?? "/" }}>
              Iniciar sessão
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
