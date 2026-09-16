import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apagarJornada, listarJornadas } from "@/lib/journey.functions";

export const Route = createFileRoute("/_authenticated/jornada/")({
  head: () => ({
    meta: [
      { title: "Jornada clínica — Dr. João Falcão" },
      {
        name: "description",
        content:
          "Atendimentos em curso e concluídos da jornada clínica: anamnese, bioimpedância, protocolo e documento final.",
      },
      { property: "og:title", content: "Jornada clínica — Dr. João Falcão" },
      { property: "og:description", content: "Atendimentos da jornada clínica do consultório." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JornadaListPage,
});

const STATUS_LABEL: Record<string, string> = {
  anamnese: "Anamnese",
  bio: "Bioimpedância",
  revisao: "Revisão",
  protocolo: "Protocolo",
  aprovado: "Aprovado",
};

function JornadaListPage() {
  const queryClient = useQueryClient();
  const listar = useServerFn(listarJornadas);
  const apagar = useServerFn(apagarJornada);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["jornadas"],
    queryFn: () => listar({ data: undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apagar({ data: { id } }),
    onSuccess: () => {
      toast.success("Atendimento removido.");
      void queryClient.invalidateQueries({ queryKey: ["jornadas"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const jornadas = data?.jornadas ?? [];

  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="font-serif text-3xl text-foreground">Minhas análises e protocolos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cada atendimento percorre anamnese, bioimpedância, revisão, protocolo, aprovação e
          documento final.
        </p>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Comece pela Consulta do paciente</CardTitle>
            <CardDescription>
              A anamnese e o exame já salvos acompanham a análise. Os registros anteriores continuam
              abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/consulta" search={{ id: undefined }}>
                Abrir consultas
              </Link>
            </Button>
          </CardContent>
        </Card>

        <section className="mt-10 space-y-3">
          <h2 className="font-serif text-xl text-foreground">Atendimentos</h2>

          {isPending && <p className="text-sm text-muted-foreground">A carregar atendimentos…</p>}

          {isError && (
            <div className="rounded-md border border-destructive/50 p-4">
              <p className="text-sm text-destructive">Não foi possível carregar os atendimentos.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!isPending && !isError && jornadas.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-8 text-center">
              <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Ainda não há análises. Abra uma consulta para começar.
              </p>
            </div>
          )}

          {jornadas.map((j) => (
            <Card key={j.id}>
              <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">{j.patientName || "Sem nome"}</p>
                  {j.consultationId ? (
                    <Link
                      to="/consulta"
                      search={{ id: j.consultationId }}
                      className="text-xs underline"
                    >
                      Abrir consulta vinculada
                    </Link>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Registro anterior, sem consulta vinculada
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABEL[j.status] ?? j.status} · versão {j.version}
                    {j.approvedVersion === j.version ? " · aprovado" : ""} ·{" "}
                    {new Date(j.updatedAt).toLocaleDateString("pt-PT")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline">
                    <Link to="/jornada/$id" params={{ id: j.id }}>
                      Continuar <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover atendimento"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remover esta análise e seu histórico de aprovações? A consulta e os relatórios de bioimpedância serão preservados.",
                        )
                      )
                        deleteMutation.mutate(j.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
